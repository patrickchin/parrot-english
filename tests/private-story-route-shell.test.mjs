import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { after, afterEach, before, test } from "node:test";
import { createServer } from "vite";
import {
  cleanupMountedRoots,
  installDom,
  mountStrict,
  waitFor,
} from "./helpers/react-lifecycle.mjs";

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
const vite = await createServer({
  appType: "custom",
  define: {
    "import.meta.env.VITE_PARROT_PRIVATE_STORIES": JSON.stringify(
      privateStoryFixtures,
    ),
    "import.meta.env.VITE_PARROT_PRIVATE_STORY_PREVIEW": "true",
  },
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

let PrivateStoryPreviewRoutes;
let routedLocation = "";

before(async () => {
  ({ PrivateStoryPreviewRoutes } = await vite.ssrLoadModule(
    "/src/app/App.tsx",
  ));
});

afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  fetchCalls.length = 0;
  routedLocation = "";
  globalThis.fetch = originalFetch;
});

after(async () => {
  await vite.close();
  restoreDom();
});

function previewRoutesAt(initialEntry) {
  return createElement(
    MemoryRouter,
    { initialEntries: [initialEntry] },
    createElement(
      "div",
      null,
      createElement(LocationProbe),
      createElement(PrivateStoryPreviewRoutes),
    ),
  );
}

function LocationProbe() {
  const location = useLocation();
  routedLocation = `${location.pathname}${location.search}${location.hash}`;
  return null;
}

test("private preview exposes only synthetic story routes without account clients", async () => {
  assert.equal(
    typeof PrivateStoryPreviewRoutes,
    "function",
    "Expected App.tsx to export PrivateStoryPreviewRoutes",
  );
  globalThis.fetch = async (...args) => {
    fetchCalls.push(args);
    throw new Error(`Unexpected request: ${String(args[0])}`);
  };

  const shelf = await mountStrict(previewRoutesAt("/lessons"));
  await waitFor(() => {
    assert.match(shelf.textContent, /Pick a story/);
    assert.match(shelf.textContent, /Fixture Long Story/);
    assert.equal(routedLocation, "/stories?level=long-stories");
  });
  assert.match(shelf.textContent, /Pick a story level/);
  assert.doesNotMatch(shelf.textContent, /Personalized story art/);

  await cleanupMountedRoots();
  document.body.replaceChildren();

  const reader = await mountStrict(
    previewRoutesAt("/stories/fixture-long-story/pages/1"),
  );
  await waitFor(() => {
    assert.match(reader.textContent, /Fixture Long Story/);
    assert.match(reader.textContent, /Synthetic private story page\./);
  });
  assert.equal(fetchCalls.length, 0);
});
