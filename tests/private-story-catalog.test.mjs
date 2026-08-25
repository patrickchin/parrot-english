import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

const PRIVATE_STORY_FIXTURES = [
  {
    assumedKnownWords: [],
    category: "Long stories",
    completionText: "You finished Fixture One!",
    cover: { alt: "", prompt: "", src: null },
    durationMinutes: 1,
    id: "private-story-fixture-one",
    level: "long-stories",
    pages: [
      {
        artwork: { alt: "", prompt: "", src: null },
        id: "page-001",
        joinIn: "Turn the page!",
        joinInAudioId: null,
        narrationAudioId: null,
        narrationAudioSrc: "/assets/private-story-preview/private-story-fixture-one/page-001.mp3",
        text: "Synthetic fixture one.",
      },
    ],
    promptExperiment: {
      focus: "Read aloud",
      hypothesis: "Saved narration supports reading along.",
      instruction: "Listen and read along.",
    },
    summary: "Fixture One",
    targetWords: [],
    title: "Fixture One",
  },
  {
    assumedKnownWords: [],
    category: "Long stories",
    completionText: "You finished Fixture Two!",
    cover: { alt: "", prompt: "", src: null },
    durationMinutes: 1,
    id: "private-story-fixture-two",
    level: "long-stories",
    pages: [
      {
        artwork: { alt: "", prompt: "", src: null },
        id: "page-001",
        joinIn: "Turn the page!",
        joinInAudioId: null,
        narrationAudioId: null,
        narrationAudioSrc: "/assets/private-story-preview/private-story-fixture-two/page-001.mp3",
        text: "Synthetic fixture two.",
      },
    ],
    promptExperiment: {
      focus: "Read aloud again",
      hypothesis: "Saved narration supports reading along again.",
      instruction: "Listen and read along again.",
    },
    summary: "Fixture Two",
    targetWords: [],
    title: "Fixture Two",
  },
];

async function loadCatalog(define = {}) {
  const vite = await createServer({
    appType: "custom",
    define,
    logLevel: "silent",
    root: projectRoot,
    server: { middlewareMode: true },
  });
  after(async () => vite.close());
  const preview = await vite.ssrLoadModule(
    "/src/stories/private-story-preview.ts",
  );
  const catalog = await vite.ssrLoadModule("/src/stories/story-catalog.ts");
  return { catalog, preview };
}

describe("private long-story catalog injection", () => {
  it("keeps the default catalog at 20 stories across four levels", async () => {
    const { catalog, preview } = await loadCatalog();

    assert.equal(catalog.STORIES.length, 20);
    assert.equal(catalog.STORY_LEVELS.length, 4);
    assert.equal(preview.IS_PRIVATE_STORY_PREVIEW, false);
  });

  it("appends injected private stories as a final routable Long stories level", async () => {
    const { catalog: injectedCatalog, preview } = await loadCatalog({
      "import.meta.env.VITE_PARROT_PRIVATE_STORIES": JSON.stringify(
        PRIVATE_STORY_FIXTURES,
      ),
      "import.meta.env.VITE_PARROT_PRIVATE_STORY_PREVIEW": "true",
    });

    assert.deepEqual(
      injectedCatalog.STORY_LEVELS.map(({ id }) => id),
      [
        "first-words",
        "repeating-patterns",
        "tiny-stories",
        "early-a1",
        "long-stories",
      ],
    );
    assert.equal(injectedCatalog.STORY_LEVELS.at(-1).label, "Long stories");
    assert.equal(injectedCatalog.STORIES.length, 22);
    assert.equal(preview.IS_PRIVATE_STORY_PREVIEW, true);
    assert.deepEqual(
      injectedCatalog.STORIES.filter(({ level }) => level === "long-stories")
        .map(({ id }) => id),
      ["private-story-fixture-one", "private-story-fixture-two"],
    );
    assert.equal(
      injectedCatalog.resolveStory("private-story-fixture-one")?.id,
      "private-story-fixture-one",
    );
    assert.equal(
      injectedCatalog.resolveStory("private-story-fixture-two")?.id,
      "private-story-fixture-two",
    );
  });
});
