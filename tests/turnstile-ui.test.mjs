import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { act, createElement } from "react";
import { createServer } from "vite";
import {
  cleanupMountedRoots,
  installDom,
  mountStrict,
  waitFor,
} from "./helpers/react-lifecycle.mjs";

const restoreDom = installDom();
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const { TurnstileWidget } = await vite.ssrLoadModule(
  "/src/auth/Turnstile.tsx"
);

test.afterEach(async () => {
  await cleanupMountedRoots();
});

test.after(async () => {
  await vite.close();
  restoreDom();
});

function setRenderedWidth(width) {
  const previousDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientWidth"
  );
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => width,
  });
  return () => {
    if (previousDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        "clientWidth",
        previousDescriptor
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    }
  };
}

test("Turnstile uses a compact challenge on narrow screens and clears spent proof", async () => {
  const restoreWidth = setRenderedWidth(240);
  const removed = [];
  const tokens = [];
  let options;
  const api = {
    remove(widgetId) {
      removed.push(widgetId);
    },
    render(_container, nextOptions) {
      options = nextOptions;
      return "guest-security-check";
    },
  };

  try {
    await mountStrict(
      createElement(TurnstileWidget, {
        load: async () => api,
        onTokenChange: (token) => tokens.push(token),
        siteKey: "public-site-key",
      })
    );
    await waitFor(() => assert.ok(options));

    assert.equal(options.action, "account_access");
    assert.equal(options.sitekey, "public-site-key");
    assert.equal(options.size, "compact");

    const opaqueProof = `opaque-${"x".repeat(2_000)}`;
    await act(async () => options.callback(opaqueProof));
    assert.equal(tokens.at(-1), opaqueProof);

    await act(async () => options["expired-callback"]());
    assert.equal(tokens.at(-1), null);

    await act(async () => options.callback("another-proof"));
    await act(async () => options["error-callback"]());
    assert.equal(tokens.at(-1), null);

    await cleanupMountedRoots();
    assert.deepEqual(removed, ["guest-security-check"]);
  } finally {
    restoreWidth();
  }
});

test("Turnstile uses its flexible challenge when the card is wide enough", async () => {
  const restoreWidth = setRenderedWidth(400);
  let options;

  try {
    await mountStrict(
      createElement(TurnstileWidget, {
        load: async () => ({
          remove() {},
          render(_container, nextOptions) {
            options = nextOptions;
            return "wide-security-check";
          },
        }),
        onTokenChange() {},
        siteKey: "public-site-key",
      })
    );
    await waitFor(() => assert.ok(options));

    assert.equal(options.size, "flexible");
  } finally {
    restoreWidth();
  }
});
