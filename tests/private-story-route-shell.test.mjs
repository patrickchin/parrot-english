import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { after, afterEach, before, test } from "node:test";
import {
  cleanupMountedRoots,
  installDom,
  mountStrict,
  waitFor,
} from "./helpers/react-lifecycle.mjs";
import {
  createHermeticViteServer,
  snapshotViteEnvironment,
  viteEnvironmentMatches,
} from "./helpers/hermetic-vite-server.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const privateStoryFixtures = [
  {
    assumedKnownWords: [],
    category: "Long stories",
    completionText: "You finished Fixture Long Story!",
    cover: { alt: "", prompt: "", src: null },
    durationMinutes: 1,
    id: "fixture-long-story",
    level: "long-stories",
    pages: [
      {
        artwork: { alt: "", prompt: "", src: null },
        id: "page-001",
        joinIn: "Turn the page!",
        joinInAudioId: null,
        narrationAudioId: null,
        narrationAudioSrc:
          "/assets/private-story-preview/fixture-long-story/page-001.mp3",
        text: "Synthetic private story page.",
      },
    ],
    promptExperiment: {
      focus: "Read aloud",
      hypothesis: "Saved narration supports reading along.",
      instruction: "Listen and read along.",
    },
    summary: "Fixture Long Story",
    targetWords: [],
    title: "Fixture Long Story",
  },
];

const restoreDom = installDom();
const originalFetch = globalThis.fetch;
const fetchCalls = [];
let vite;
let viteHarness;
let viteEnvironmentRestored = false;
let App;
let routedLocation = "";

before(async () => {
  const environmentBeforeCreation = snapshotViteEnvironment();
  viteHarness = await createHermeticViteServer({
    appType: "custom",
    define: {
      "import.meta.env.VITE_PARROT_PRIVATE_STORIES": JSON.stringify(
        privateStoryFixtures,
      ),
      "import.meta.env.VITE_PARROT_PRIVATE_STORY_PREVIEW": "true",
    },
    logLevel: "silent",
    root: projectRoot,
  });
  vite = viteHarness.server;
  viteEnvironmentRestored = viteEnvironmentMatches(environmentBeforeCreation);
  try {
    ({ App } = await vite.ssrLoadModule("/src/app/App.tsx"));
  } catch (error) {
    await viteHarness.close();
    viteHarness = null;
    throw error;
  }
});

afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  fetchCalls.length = 0;
  routedLocation = "";
  globalThis.fetch = originalFetch;
});

after(async () => {
  try {
    await viteHarness?.close();
  } finally {
    restoreDom();
  }
});

function privatePreviewAppAt(initialEntry) {
  return createElement(
    MemoryRouter,
    { initialEntries: [initialEntry] },
    createElement(
      "div",
      null,
      createElement(LocationProbe),
      createElement(App),
    ),
  );
}

function LocationProbe() {
  const location = useLocation();
  routedLocation = `${location.pathname}${location.search}${location.hash}`;
  return null;
}

test("uses a hermetic Vite module-transform server", () => {
  assert.equal(viteEnvironmentRestored, true);
  assert.equal(vite.config.configFile, undefined);
  assert.equal(vite.config.envDir, false);
  assert.deepEqual(vite.config.envPrefix, []);
  assert.equal(vite.config.publicDir, "");
  assert.equal(vite.config.server.watch, null);
  assert.equal(vite.config.optimizeDeps.noDiscovery, true);
  assert.deepEqual(vite.config.optimizeDeps.include, []);
  assert.equal(path.isAbsolute(vite.config.cacheDir), true);
  assert.equal(path.dirname(vite.config.cacheDir), os.tmpdir());
  assert.equal(
    vite.config.cacheDir.startsWith(`${projectRoot}${path.sep}`),
    false,
  );
});

test("the bare private story shelf canonicalizes to Long stories", async () => {
  globalThis.fetch = async (...args) => {
    fetchCalls.push(args);
    throw new Error(`Unexpected request: ${String(args[0])}`);
  };

  const shelf = await mountStrict(privatePreviewAppAt("/stories"));
  await waitFor(() => {
    assert.match(shelf.textContent, /Fixture Long Story/);
    assert.equal(routedLocation, "/stories?level=long-stories");
  });
  assert.equal(fetchCalls.length, 0);
});

test("App selects the synthetic private story shell before account and profile gates", async () => {
  assert.equal(
    typeof App,
    "function",
    "Expected App.tsx to export App",
  );
  globalThis.fetch = async (...args) => {
    fetchCalls.push(args);
    throw new Error(`Unexpected request: ${String(args[0])}`);
  };

  const shelf = await mountStrict(privatePreviewAppAt("/lessons"));
  await waitFor(() => {
    assert.match(shelf.textContent, /Pick a story/);
    assert.match(shelf.textContent, /Fixture Long Story/);
    assert.equal(routedLocation, "/stories?level=long-stories");
  });
  assert.match(shelf.textContent, /Pick a story level/);
  assert.doesNotMatch(shelf.textContent, /Personalized story art/);
  assert.equal(shelf.querySelector('[aria-label="Account"]'), null);
  assert.equal(shelf.querySelector('[aria-label="Unlock guardian mode"]'), null);
  assert.equal(fetchCalls.length, 0);

  await cleanupMountedRoots();
  document.body.replaceChildren();

  const reader = await mountStrict(
    privatePreviewAppAt("/stories/fixture-long-story/pages/1"),
  );
  await waitFor(() => {
    assert.match(reader.textContent, /Fixture Long Story/);
    assert.match(reader.textContent, /Synthetic private story page\./);
    assert.equal(routedLocation, "/stories/fixture-long-story/pages/1");
  });
  assert.equal(reader.querySelector('[aria-label="Account"]'), null);
  assert.equal(reader.querySelector('[aria-label="Unlock guardian mode"]'), null);
  assert.equal(fetchCalls.length, 0);
});
