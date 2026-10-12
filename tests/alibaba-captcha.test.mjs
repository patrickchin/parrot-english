import assert from "node:assert/strict";
import { test } from "node:test";
import { Window } from "happy-dom";
import { createAlibabaCaptchaPlugin, verifyAlibabaCaptcha } from "../backend/alibaba-captcha.mjs";
import { createAlibabaCaptchaAdapter } from "../src/auth/AlibabaCaptcha.ts";

test("China account protection rejects missing, failed and unavailable CAPTCHA checks", async () => {
  const calls = [];
  const plugin = createAlibabaCaptchaPlugin("pilot-scene", async (scene, token) => { calls.push([scene, token]); return token === "valid-token"; });
  const request = (path, token) => new Request(`https://example.test/api/auth/${path}`, { method: "POST", headers: token ? { "x-captcha-response": token } : {} });
  for (const path of ["sign-up/email", "sign-in/shared-guest", "sign-up/email/", "%73ign-up/email", "sign-up%2femail"] ) {
    assert.equal((await plugin.onRequest(request(path))).response.status, 400);
    assert.equal((await plugin.onRequest(request(path, "invalid-token"))).response.status, 403);
    assert.equal(await plugin.onRequest(request(path, "valid-token")), undefined);
  }
  assert.deepEqual(calls[0], ["pilot-scene", "invalid-token"]);
  assert.equal(await plugin.onRequest(request("get-session")), undefined);
  const unavailable = createAlibabaCaptchaPlugin("pilot-scene", async () => { throw new Error("network unavailable"); });
  assert.equal((await unavailable.onRequest(request("sign-up/email", "token"))).response.status, 503);
  assert.equal((await plugin.onRequest(request("sign-up/email", "x".repeat(16385)))).response.status, 400);
  assert.throws(() => createAlibabaCaptchaPlugin(""), /scene/);
});

test("SDK verification requires a genuine production pass and pins the server-side scene", async () => {
  const token = "opaque-original-token";
  for (const [body, expected] of [
    [{ success: true, result: { verifyResult: true, verifyCode: "T001" } }, true],
    [{ success: true, result: { verifyResult: true, verifyCode: "T005" } }, false],
    [{ success: true, result: { verifyResult: false, verifyCode: "F008" } }, false],
    [{ success: false, result: { verifyResult: true, verifyCode: "T001" } }, false],
    [{}, false],
  ]) {
    const client = { async verifyIntelligentCaptchaWithOptions(request, runtime) {
      assert.equal(request.sceneId, "pilot-scene");
      assert.equal(request.captchaVerifyParam, token);
      assert.equal(runtime.autoretry, false);
      return { body };
    } };
    assert.equal(await verifyAlibabaCaptcha("pilot-scene", token, client), expected);
  }
});

test("rendered China widget forwards tokens, expires them and ignores callbacks after removal", () => {
  const previous = { window: globalThis.window, document: globalThis.document };
  const window = new Window();
  globalThis.window = window;
  globalThis.document = window.document;
  let scheduled;
  window.setTimeout = (callback, delay) => { assert.equal(delay, 80000); scheduled = callback; return 1; };
  window.clearTimeout = () => {};
  const tokens = [];
  let expired = 0;
  let hidden = 0;
  let options;
  const adapter = createAlibabaCaptchaAdapter((value) => {
    options = value;
    const button = window.document.createElement("button");
    button.textContent = "Verify";
    window.document.querySelector(value.element).appendChild(button);
    value.getInstance({ hide() { hidden++; } });
  });
  try {
    const container = window.document.createElement("div");
    window.document.body.appendChild(container);
    const id = adapter.render(container, { sitekey: "pilot-scene", callback: (value) => tokens.push(value), "expired-callback": () => expired++, "error-callback": () => {} });
    assert.equal(container.querySelector("button").textContent, "Verify");
    assert.equal(options.mode, "embed");
    assert.equal(options.SceneId, "pilot-scene");
    options.success("original-token");
    assert.deepEqual(tokens, ["original-token"]);
    scheduled();
    assert.equal(expired, 1);
    const stale = options;
    adapter.remove(id);
    assert.equal(container.childElementCount, 0);
    stale.success("stale-token");
    assert.deepEqual(tokens, ["original-token"]);
    assert.equal(hidden, 2);
  } finally { globalThis.window = previous.window; globalThis.document = previous.document; window.happyDOM.abort(); }
});
