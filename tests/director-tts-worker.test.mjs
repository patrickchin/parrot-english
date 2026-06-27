import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { handleDirectorTts } from "../worker/director-tts.ts";

function createRequest(body, init = {}) {
  return new Request("https://example.com/api/director-tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  });
}

async function readJson(response) {
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  return response.json();
}

describe("director TTS Worker route", () => {
  it("rejects mixed language segment text", async () => {
    const response = await handleDirectorTts(
      createRequest({
        speaker: "polly",
        lang: "zh-CN",
        text: "轮到你说：Hello, Peppa!",
      }),
      {}
    );
    const payload = await readJson(response);

    assert.equal(response.status, 400);
    assert.equal(payload.error, "mixed_language_segment");
  });

  it("returns a playable data URL for valid text when provider is mocked", async () => {
    const env = { ELEVENLABS_API_KEY: "test-key" };
    const calls = [];
    const response = await handleDirectorTts(
      createRequest({
        speaker: "polly",
        lang: "zh-CN",
        text: "新的动态句子。",
      }),
      env,
      async (...args) => {
        calls.push(args);
        return new Uint8Array([1, 2, 3]);
      }
    );
    const payload = await readJson(response);

    assert.equal(response.status, 200);
    assert.match(payload.audioSrc, /^data:audio\/mpeg;base64,/);
    assert.match(payload.key, /^polly__zh-CN__/);
    assert.deepEqual(calls, [
      [
        {
          speaker: "polly",
          lang: "zh-CN",
          text: "新的动态句子。",
        },
        env,
      ],
    ]);
  });

  it("returns a JSON 405 error for non-POST requests", async () => {
    const response = await handleDirectorTts(
      new Request("https://example.com/api/director-tts", { method: "GET" }),
      {}
    );
    const payload = await readJson(response);

    assert.equal(response.status, 405);
    assert.equal(payload.error, "method_not_allowed");
  });

  it("returns a JSON 400 error for invalid JSON", async () => {
    const response = await handleDirectorTts(
      new Request("https://example.com/api/director-tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      {}
    );
    const payload = await readJson(response);

    assert.equal(response.status, 400);
    assert.equal(payload.error, "invalid_json");
  });

  it("returns a JSON 400 error for missing or empty required fields", async () => {
    const cases = [
      { name: "missing speaker", body: { lang: "zh-CN", text: "新的动态句子。" } },
      { name: "empty speaker", body: { speaker: " ", lang: "zh-CN", text: "新的动态句子。" } },
      { name: "missing lang", body: { speaker: "polly", text: "新的动态句子。" } },
      { name: "empty lang", body: { speaker: "polly", lang: "", text: "新的动态句子。" } },
      { name: "missing text", body: { speaker: "polly", lang: "zh-CN" } },
      { name: "empty text", body: { speaker: "polly", lang: "zh-CN", text: " " } },
    ];

    for (const { name, body } of cases) {
      const response = await handleDirectorTts(createRequest(body), {});
      const payload = await readJson(response);

      assert.equal(response.status, 400, name);
      assert.equal(payload.error, "invalid_request", name);
    }
  });

  it("returns a JSON 400 error for unsupported speaker or language", async () => {
    const cases = [
      {
        name: "speaker",
        body: { speaker: "george", lang: "zh-CN", text: "新的动态句子。" },
      },
      {
        name: "language",
        body: { speaker: "polly", lang: "fr-FR", text: "Bonjour." },
      },
    ];

    for (const { name, body } of cases) {
      const response = await handleDirectorTts(createRequest(body), {});
      const payload = await readJson(response);

      assert.equal(response.status, 400, name);
      assert.equal(payload.error, "invalid_request", name);
    }
  });

  it("returns a JSON 503 error when no provider is configured", async () => {
    const response = await handleDirectorTts(
      createRequest({
        speaker: "polly",
        lang: "zh-CN",
        text: "新的动态句子。",
      }),
      {}
    );
    const payload = await readJson(response);

    assert.equal(response.status, 503);
    assert.equal(payload.error, "tts_provider_unconfigured");
  });

  it("returns a JSON 502 error when the provider fails", async () => {
    const response = await handleDirectorTts(
      createRequest({
        speaker: "polly",
        lang: "zh-CN",
        text: "新的动态句子。",
      }),
      {},
      async () => {
        throw new Error("upstream failed");
      }
    );
    const payload = await readJson(response);

    assert.equal(response.status, 502);
    assert.equal(payload.error, "tts_generation_failed");
  });

  it("routes /api/director-tts before static assets", () => {
    const workerIndex = readFileSync(
      new URL("../worker/index.ts", import.meta.url),
      "utf8"
    );
    const routeIndex = workerIndex.indexOf('url.pathname === "/api/director-tts"');
    const assetFallbackIndex = workerIndex.indexOf("return env.ASSETS.fetch(request)");

    assert.ok(routeIndex > -1);
    assert.ok(assetFallbackIndex > -1);
    assert.ok(routeIndex < assetFallbackIndex);
    assert.match(workerIndex, /handleDirectorTts\(request, env\)/);
  });
});
