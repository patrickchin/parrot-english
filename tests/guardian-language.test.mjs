import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { after, afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  cleanupMountedRoots,
  click,
  flush,
  installDom,
  mountStrict,
} from "./helpers/react-lifecycle.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const restoreDom = installDom();
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});
const languageModule = await vite.ssrLoadModule("/src/i18n/guardian-language.tsx");
const englishModule = await vite.ssrLoadModule("/src/i18n/messages/en.ts");
const chineseModule = await vite.ssrLoadModule("/src/i18n/messages/zh-Hans.ts");

const {
  GUARDIAN_LANGUAGE_STORAGE_KEY,
  GUARDIAN_LANGUAGES,
  GuardianLanguageProvider,
  isGuardianGuidanceSurface,
  resolveGuardianLanguage,
  useGuardianLanguage,
} = languageModule;

afterEach(async () => {
  await cleanupMountedRoots();
  window.localStorage.clear();
});

after(async () => {
  await vite.close();
  restoreDom();
});

function collectLeaves(value, path = "") {
  if (typeof value === "string" || typeof value === "function") {
    return [[path, typeof value]];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    collectLeaves(child, path ? `${path}.${key}` : key),
  );
}

function Probe() {
  const { language, messages, selectLanguage } = useGuardianLanguage();
  return createElement(
    "div",
    null,
    createElement("output", { "data-language": language }, messages.common.save),
    createElement(
      "button",
      { onClick: () => selectLanguage("zh-Hans"), type: "button" },
      "select Chinese",
    ),
  );
}

function renderProvider(props = {}) {
  return mountStrict(
    createElement(
      GuardianLanguageProvider,
      props,
      createElement(Probe),
    ),
  );
}

describe("guardian language domain", () => {
  it("resolves stored and browser language preferences in priority order", () => {
    assert.equal(resolveGuardianLanguage("zh-Hans", ["en-US"]), "zh-Hans");
    assert.equal(resolveGuardianLanguage("en", ["zh-CN"]), "en");
    assert.equal(resolveGuardianLanguage("invalid", ["zh-CN", "en"]), "zh-Hans");
    assert.equal(resolveGuardianLanguage(null, ["en-US", "zh-TW"]), "zh-Hans");
    assert.equal(resolveGuardianLanguage(null, ["en-US"]), "en");
  });

  it("keeps translated catalogs structurally compatible", () => {
    assert.deepEqual(
      collectLeaves(englishModule.englishGuardianMessages),
      collectLeaves(chineseModule.chineseGuardianMessages),
    );
    assert.deepEqual(GUARDIAN_LANGUAGES, ["en", "zh-Hans"]);
    assert.equal(GUARDIAN_LANGUAGE_STORAGE_KEY, "parrot:guardian-language");
  });

  it("identifies guardian and login guidance surfaces without changing learner routes", () => {
    assert.equal(isGuardianGuidanceSurface("/guardian"), true);
    assert.equal(isGuardianGuidanceSurface("/profile/setup", "?redo=1"), true);
    assert.equal(isGuardianGuidanceSurface("/login"), true);
    assert.equal(isGuardianGuidanceSurface("/profile/setup"), false);
    assert.equal(isGuardianGuidanceSurface("/lessons"), false);
  });
});

describe("GuardianLanguageProvider", { concurrency: false }, () => {
  it("uses a valid stored selection without writing during initialization", async () => {
    const writes = [];
    const storage = {
      getItem: () => "zh-Hans",
      setItem: (...args) => writes.push(args),
    };
    const container = await renderProvider({ browserLanguages: ["en-US"], storage });

    assert.equal(container.querySelector("output")?.dataset.language, "zh-Hans");
    assert.equal(writes.length, 0);
  });

  it("uses Chinese browser preference when storage is empty", async () => {
    const container = await renderProvider({
      browserLanguages: ["zh-TW"],
      storage: { getItem: () => null, setItem() {} },
    });

    assert.equal(container.querySelector("output")?.dataset.language, "zh-Hans");
  });

  it("falls through invalid or unreadable storage to browser preferences", async () => {
    const invalid = await renderProvider({
      browserLanguages: ["zh-CN"],
      storage: { getItem: () => "invalid", setItem() {} },
    });
    assert.equal(invalid.querySelector("output")?.dataset.language, "zh-Hans");

    const unreadable = await renderProvider({
      browserLanguages: ["zh-CN"],
      storage: { getItem: () => { throw new Error("blocked"); }, setItem() {} },
    });
    assert.equal(unreadable.querySelector("output")?.dataset.language, "zh-Hans");
  });

  it("persists one explicit selection and retains it when persistence throws", async () => {
    const writes = [];
    const storage = {
      getItem: () => null,
      setItem: (...args) => writes.push(args),
    };
    const container = await renderProvider({ browserLanguages: ["en"], storage });

    await click(container.querySelector("button"));
    await flush();
    assert.equal(container.querySelector("output")?.dataset.language, "zh-Hans");
    assert.deepEqual(writes, [["parrot:guardian-language", "zh-Hans"]]);

    const throwingContainer = await renderProvider({
      browserLanguages: ["en"],
      storage: { getItem: () => null, setItem: () => { throw new Error("blocked"); } },
    });
    await click(throwingContainer.querySelector("button"));
    await flush();
    assert.equal(throwingContainer.querySelector("output")?.dataset.language, "zh-Hans");
  });

  it("lets the initial language override browser and storage without persisting", async () => {
    const writes = [];
    const container = await renderProvider({
      browserLanguages: ["en"],
      initialLanguage: "zh-Hans",
      storage: { getItem: () => "en", setItem: (...args) => writes.push(args) },
    });

    assert.equal(container.querySelector("output")?.dataset.language, "zh-Hans");
    assert.equal(writes.length, 0);
  });

  it("falls back to English when navigator preferences are missing or cannot be read", async () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    try {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: {},
      });
      const missing = await renderProvider({ storage: null });
      assert.equal(missing.querySelector("output")?.dataset.language, "en");

      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: {
          get languages() { throw new Error("blocked"); },
          language: "zh-CN",
        },
      });
      const languageFallback = await renderProvider({ storage: null });
      assert.equal(languageFallback.querySelector("output")?.dataset.language, "zh-Hans");

      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: {
          get languages() { throw new Error("blocked"); },
          get language() { throw new Error("blocked"); },
        },
      });
      const unreadable = await renderProvider({ storage: null });
      assert.equal(unreadable.querySelector("output")?.dataset.language, "en");
    } finally {
      if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    }
  });

  it("provides English defaults to static views outside a provider", () => {
    const html = renderToStaticMarkup(createElement(Probe));
    assert.match(html, /data-language="en"/);
    assert.match(html, />Save</);
  });
});
