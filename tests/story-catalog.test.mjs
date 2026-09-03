import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { after, afterEach, describe, it } from "node:test";
import { createServer } from "vite";
import {
  LEARNER_STORY_LEVEL_IDS,
  STORIES,
  STORY_LEVELS,
  resolveStory,
} from "../src/stories/story-catalog.ts";
import {
  cleanupMountedRoots,
  installDom,
  mountStrict,
  waitFor,
} from "./helpers/react-lifecycle.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const restoreDom = installDom();
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});
const { StoryList } = await vite
  .ssrLoadModule("/src/stories/StoryList.tsx")
  .catch(() => ({}));
const { LearnerProfileProvider } = await vite
  .ssrLoadModule("/src/learner-profile/LearnerProfileContext.tsx")
  .catch(() => ({}));

afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
});

after(async () => {
  await vite.close();
  restoreDom();
});

function learnerProfile(storyLevel) {
  return {
    age: 6,
    answers: {
      description: null,
      questionnaireVersion: 2,
      responses: {},
      schemaVersion: 2,
    },
    completedAt: "2026-08-25T08:00:00.000Z",
    currentQuestionKey: null,
    description: "Likes animals",
    name: "Mia",
    profileStatus: "completed",
    storyLevel,
  };
}

function LocationProbe() {
  const location = useLocation();
  return createElement(
    "output",
    { "aria-label": "Current story route" },
    `${location.pathname}${location.search}`,
  );
}

function storyListAt(storyLevel, initialEntry) {
  assert.equal(typeof StoryList, "function", "Expected learner StoryList");
  assert.equal(
    typeof LearnerProfileProvider,
    "function",
    "Expected the loaded-profile context provider",
  );
  return createElement(
    LearnerProfileProvider,
    { profile: learnerProfile(storyLevel) },
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(StoryList),
      createElement(LocationProbe),
    ),
  );
}

describe("story script catalog", () => {
  // Production break caught: adult controls leak into the learner-facing shelf.
  it("keeps adult controls off the learner shelf", async () => {
    const container = await mountStrict(
      storyListAt("first-words", "/stories"),
    );

    assert.doesNotMatch(
      container.textContent,
      /Grown-up options|Pick a story level|Guardian consent|Upload .* photo|Generate story art|CEFR|Target words|Assumed known|Prompt experiment|Category|Narrative word/i,
    );
  });

  it("renders two public long stories when that shelf is selected", async () => {
    const container = await mountStrict(
      storyListAt("tiny-stories", "/stories?level=long-stories"),
    );
    const section = container.querySelector('section[role="tabpanel"]');

    assert.ok(section);
    assert.match(
      container.querySelector('[role="tab"][aria-selected="true"]')
        ?.textContent ?? "",
      /Storytime · Listen to a full story/,
    );
    assert.equal(
      section.querySelectorAll('a[aria-label^="Listen to story:"]').length,
      2,
    );
  });

  // Production break caught: a saved preference is ignored and the learner
  // gets every large story card at once instead of one focused shelf.
  it("renders only the saved level while keeping all five choices available", async () => {
    const expectedShelves = new Map([
      ["first-words", ["Level 1 · Words & pictures", 7]],
      ["repeating-patterns", ["Level 2 · Repeating stories", 6]],
      ["tiny-stories", ["Level 3 · Short stories", 5]],
      ["early-a1", ["Level 4 · Longer stories", 5]],
    ]);

    for (const storyLevel of LEARNER_STORY_LEVEL_IDS) {
      const container = await mountStrict(
        storyListAt(storyLevel, `/stories?level=${storyLevel}`),
      );

      try {
        const shelf = container.querySelector(
          'section[aria-label="Read-aloud stories"]',
        );
        assert.ok(shelf, `${storyLevel} shelf`);
        assert.equal(
          shelf.querySelectorAll('[role="tab"]').length,
          5,
          `${storyLevel} picker tabs`,
        );
        const selectedTab = shelf.querySelector(
          '[role="tab"][aria-selected="true"]',
        );
        const panel = shelf.querySelector('section[role="tabpanel"]');
        const [expectedLabel, expectedCount] = expectedShelves.get(storyLevel);
        assert.match(selectedTab?.textContent ?? "", new RegExp(expectedLabel));
        assert.ok(panel, `${storyLevel} panel`);

        const playableLinks = [
          ...panel.querySelectorAll(
            'a[aria-label^="Listen to story:"]',
          ),
        ];
        const playableHrefs = playableLinks.map((link) =>
          link.getAttribute("href"),
        );
        assert.equal(
          playableLinks.length,
          expectedCount,
          `${storyLevel} story links`,
        );
        assert.equal(
          new Set(playableHrefs).size,
          expectedCount,
          `${storyLevel} unique story links`,
        );
        for (const href of playableHrefs) {
          assert.match(href, /^\/stories\/[a-z0-9-]+\/pages\/1$/);
          const storyId = href.split("/")[2];
          assert.ok(resolveStory(storyId), `${href} resolves to a story`);
        }

        await waitFor(() =>
          assert.equal(
            container.querySelector(
              'output[aria-label="Current story route"]',
            )?.textContent,
            `/stories?level=${storyLevel}`,
          ),
        );
      } finally {
        await cleanupMountedRoots();
        document.body.replaceChildren();
      }
    }
  });

  // Production break caught: preference stories are added/removed or Rose stays
  // in the first learner level instead of moving to repeating patterns.
  it("publishes 23 stories in the 7/6/5/5 learner preference distribution", () => {
    const learnerStories = STORIES.filter(({ level }) =>
      LEARNER_STORY_LEVEL_IDS.includes(level),
    );
    const learnerLevels = STORY_LEVELS.filter(({ id }) =>
      LEARNER_STORY_LEVEL_IDS.includes(id),
    );

    assert.equal(learnerStories.length, 23);
    assert.equal(learnerLevels.length, 4);
    assert.deepEqual(
      learnerLevels.map(({ id }) => id),
      [
        "first-words",
        "repeating-patterns",
        "tiny-stories",
        "early-a1",
      ],
    );
    assert.deepEqual(
      learnerStories.map(({ level }) => level),
      [
        ...Array(7).fill("first-words"),
        ...Array(6).fill("repeating-patterns"),
        ...Array(5).fill("tiny-stories"),
        ...Array(5).fill("early-a1"),
      ],
    );

    const expectedStoryCount = new Map([
      ["first-words", 7],
      ["repeating-patterns", 6],
      ["tiny-stories", 5],
      ["early-a1", 5],
    ]);
    for (const level of learnerLevels) {
      assert.equal(
        learnerStories.filter((story) => story.level === level.id).length,
        expectedStoryCount.get(level.id),
        `${level.label} story count`,
      );
    }
  });

  it("labels the beginner shelf as Level 1 words and pictures", () => {
    assert.deepEqual(
      STORY_LEVELS.find(({ id }) => id === "first-words"),
      {
        id: "first-words",
        label: "Level 1 · Words & pictures",
        cefrReference: "Entry Pre-A1",
        description: "A few familiar words on each page.",
      },
    );
  });

  it("keeps the three early five-page stories on the first-words shelf", () => {
    assert.equal(STORIES.length, 25);
    assert.deepEqual(
      STORIES.filter(({ id }) =>
        ["hello-cat", "marys-face", "wash-sam-wash"].includes(id),
      ).map(
        ({ id, pages, title }) => ({
          id,
          pageIds: pages.map(({ id: pageId }) => pageId),
          title,
        }),
      ),
      [
        {
          id: "hello-cat",
          pageIds: [
            "cat-hello",
            "dog-hello",
            "bird-hello",
            "friends-hello",
            "friends-bye",
          ],
          title: "Hello, Cat!",
        },
        {
          id: "marys-face",
          pageIds: ["face", "eyes", "ears", "nose", "mouth"],
          title: "Mary’s Face",
        },
        {
          id: "wash-sam-wash",
          pageIds: [
            "dirty-hands",
            "water-on-hands",
            "soap-on-hands",
            "wash-hands",
            "clean-hands",
          ],
          title: "Wash, Sam, Wash!",
        },
      ],
    );
  });

  // Production break caught: Mary's pointing action replaces the body word
  // instead of giving each zero-English target an immediate say-back.
  it("gives every Mary’s Face body word an immediate point-and-say turn", () => {
    const story = resolveStory("marys-face");
    assert.ok(story);
    assert.deepEqual(
      story.pages.map(({ joinIn, text }) => ({ joinIn, text })),
      [
        { text: "Point. Face.", joinIn: "Face!" },
        { text: "Point. Eyes.", joinIn: "Eyes!" },
        { text: "Point. Ears.", joinIn: "Ears!" },
        { text: "Point. Nose.", joinIn: "Nose!" },
        { text: "Point. Mouth.", joinIn: "Mouth!" },
      ],
    );
  });

  // Production break caught: Where Is Rose? remains on the first-words shelf
  // even if aggregate shelf counts happen to be preserved by moving another story.
  it("moves Where Is Rose? to repeating patterns", () => {
    assert.equal(resolveStory("where-is-dot")?.level, "repeating-patterns");
  });

  it("publishes two fully illustrated long read-alouds in short reading beats", () => {
    const longStories = STORIES.filter(
      ({ level }) => level === "long-stories",
    );
    const expected = {
      "the-gruffalo": {
        pageCount: 23,
        sceneCount: 12,
        textHash:
          "bf1663d2d5c89f3de41b47dbc91d53d98455a4ada04fc3a9144798442d84b035",
      },
      "we-re-going-on-a-bear-hunt": {
        pageCount: 13,
        sceneCount: 5,
        textHash:
          "c661e127071fbe49d34ef1ef415418c98f701ad2ea49c43b81ae643dccf89cd4",
      },
    };

    assert.equal(longStories.length, 2);
    assert.deepEqual(
      longStories.map(({ pages }) => pages.length),
      [23, 13],
    );
    for (const story of longStories) {
      const storyExpectation = expected[story.id];
      const normalizedText = story.pages
        .map(({ text }) => text)
        .join(" ")
        .replace(/\s+/gu, " ")
        .trim();
      const sceneSources = new Set(
        story.pages.map(({ artwork }) => artwork.src),
      );

      assert.ok(storyExpectation, story.id);
      assert.equal(story.pages.length, storyExpectation.pageCount);
      assert.equal(sceneSources.size, storyExpectation.sceneCount);
      assert.equal(
        createHash("sha256").update(normalizedText).digest("hex"),
        storyExpectation.textHash,
        `${story.title} preserves its complete narration`,
      );
      assert.equal(
        story.cover.src,
        `https://media.parrotbook.com/assets/v5/stories/${story.id}-cover.webp`,
      );
      assert.ok(story.cover.alt.trim(), `${story.title} cover alt`);
      assert.ok(story.cover.prompt.trim(), `${story.title} cover prompt`);

      for (const [pageIndex, page] of story.pages.entries()) {
        const pageId = `page-${String(pageIndex + 1).padStart(3, "0")}`;

        assert.equal(page.id, pageId);
        assert.equal(
          page.narrationAudioId,
          `story-${story.id}-${pageId}-narration`,
        );
        assert.equal(page.joinInAudioId, null);
        assert.match(
          page.artwork.src,
          new RegExp(
            `^https://media\\.parrotbook\\.com/assets/v5/story-pages/${story.id}-page-\\d{3}\\.webp$`,
          ),
        );
        assert.ok(page.artwork.alt.trim(), `${story.title}/${page.id} art alt`);
        assert.ok(
          page.artwork.prompt.trim(),
          `${story.title}/${page.id} art prompt`,
        );
      }
    }
  });

  // Production break caught: authoring-only metadata remains on runtime
  // stories even though the shelf and reader do not consume it.
  it("keeps runtime story records minimal and their IDs distinct", () => {
    assert.equal(new Set(STORIES.map(({ id }) => id)).size, STORIES.length);
    assert.equal(
      new Set(STORIES.map(({ title }) => title)).size,
      STORIES.length,
    );
    const serializedStory = JSON.parse(JSON.stringify(STORIES[0]));
    assert.deepEqual(Object.keys(serializedStory).sort(), [
      "completionText",
      "cover",
      "id",
      "level",
      "pages",
      "title",
    ]);

    for (const story of STORIES) {
      assert.ok(story.completionText.trim(), `${story.title} completion`);
      assert.ok(
        story.pages.length >= 5 &&
          (story.level === "long-stories" || story.pages.length <= 7),
        `${story.title} pages`,
      );
      assert.equal(
        new Set(story.pages.map(({ id }) => id)).size,
        story.pages.length,
        `${story.title} page IDs`,
      );
    }
  });

  it("keeps the whale word separate from Ben's name", () => {
    const story = resolveStory("wally-finds-the-way");
    assert.ok(story);

    assert.match(story.pages[0].text, /^Ben the whale cannot see/);
  });

  // Production break caught: a new story uses stale v3/v6 artwork paths, an
  // existing story changes media version, or a playable page loses saved audio.
  it("fully illustrates every learner page and assigns saved narration and join-in audio", () => {
    const joinInAudioByText = new Map();

    for (const story of STORIES.filter(({ level }) => level !== "long-stories")) {
      const usesV7Artwork = ["hello-cat", "marys-face", "wash-sam-wash"].includes(story.id);
      const coverVersion = usesV7Artwork ? 7 : 3;
      assert.equal(
        story.cover.src,
        `https://media.parrotbook.com/assets/v${coverVersion}/stories/${story.id}-cover.webp`,
        `${story.title} cover source`,
      );
      assert.ok(story.cover.alt.trim(), `${story.title} cover alt`);
      assert.ok(story.cover.prompt.trim(), `${story.title} cover prompt`);
      assert.doesNotMatch(story.cover.alt, /placeholder/i);

      for (const page of story.pages) {
        const imageVersion =
          usesV7Artwork
            ? 7
            : story.level === "first-words" || story.id === "where-is-dot"
              ? 3
              : 6;
        assert.equal(
          page.artwork.src,
          `https://media.parrotbook.com/assets/v${imageVersion}/story-pages/${story.id}-${page.id}.webp`,
          `${story.title}/${page.id} image source`,
        );
        assert.equal(
          page.narrationAudioId,
          `story-${story.id}-${page.id}-narration`,
          `${story.title}/${page.id} narration audio ID`,
        );
        assert.match(
          page.joinInAudioId,
          /^story-join-in-[a-z0-9]+(?:-[a-z0-9]+)*$/,
          `${story.title}/${page.id} join-in audio ID`,
        );
        const priorJoinInId = joinInAudioByText.get(page.joinIn);
        if (priorJoinInId) assert.equal(page.joinInAudioId, priorJoinInId);
        else joinInAudioByText.set(page.joinIn, page.joinInAudioId);
        assert.ok(
          page.artwork.alt.trim(),
          `${story.title}/${page.id} image alt`,
        );
        assert.doesNotMatch(page.artwork.alt, /placeholder/i);
        assert.ok(
          page.artwork.prompt.trim(),
          `${story.title}/${page.id} image prompt`,
        );
      }
    }

    const savedStoryAssets = new Set(
      readdirSync("public/assets/audio").filter((filename) =>
        filename.startsWith("story-"),
      ),
    );
    const expectedStoryAssets = new Set(
      STORIES.flatMap((story) =>
        story.pages.flatMap((page) =>
          [page.narrationAudioId, page.joinInAudioId]
            .filter(Boolean)
            .map((audioId) => `${audioId}.mp3`),
        ),
      ),
    );
    assert.deepEqual(savedStoryAssets, expectedStoryAssets);
    assert.equal(existsSync("public/assets/stories"), false);
  });

  // Production break caught: a story is renamed, reordered, or moved to a
  // different reader shelf while aggregate counts still look correct.
  it("publishes the exact runtime story order, titles, and levels", () => {
    assert.deepEqual(
      STORIES.map(({ id, level, title }) => [id, title, level]),
      [
        ["hello-cat", "Hello, Cat!", "first-words"],
        ["marys-face", "Mary’s Face", "first-words"],
        ["wash-sam-wash", "Wash, Sam, Wash!", "first-words"],
        ["the-red-ball", "The Red Ball", "first-words"],
        ["which-hat", "Which Hat?", "first-words"],
        ["wake-up-nori", "Wake Up, Mary!", "first-words"],
        ["three-apples", "Three Apples", "first-words"],
        ["where-is-dot", "Where Is Rose?", "repeating-patterns"],
        ["boots-in-the-rain", "Boots in the Rain", "repeating-patterns"],
        ["big-box-small-box", "Big Box, Small Box", "repeating-patterns"],
        ["lina-goes-to-sleep", "Mary Goes to Sleep", "repeating-patterns"],
        ["seed-wake-up", "Seed, Wake Up!", "repeating-patterns"],
        ["a-snack-for-two", "A Snack for Two", "repeating-patterns"],
        ["the-lantern-trail", "The Lantern Trail", "tiny-stories"],
        ["the-noisy-little-band", "The Noisy Little Band", "tiny-stories"],
        ["robo-tries", "Bob Tries", "tiny-stories"],
        ["tess-can-help", "Rose Can Help", "tiny-stories"],
        ["ready-maya-ready", "Ready, Mary, Ready!", "tiny-stories"],
        ["kite-come-back", "Kite, Come Back!", "early-a1"],
        [
          "the-picnic-blanket-search",
          "The Picnic Blanket Search",
          "early-a1",
        ],
        ["soup-for-five", "Soup for Five", "early-a1"],
        ["wally-finds-the-way", "Ben Finds the Way", "early-a1"],
        ["the-moon-bus", "The Moon Bus", "early-a1"],
        ["the-gruffalo", "The Gruffalo", "long-stories"],
        [
          "we-re-going-on-a-bear-hunt",
          "We’re Going on a Bear Hunt",
          "long-stories",
        ],
      ],
    );
  });

  it("resolves only exact playable story IDs", () => {
    assert.equal(
      resolveStory("the-red-ball"),
      STORIES.find(({ id }) => id === "the-red-ball"),
    );
    assert.equal(resolveStory("the-lantern-trail")?.id, "the-lantern-trail");
    assert.equal(resolveStory("the-lantern-trail-original"), null);
    assert.equal(resolveStory("The-Red-Ball"), null);
    assert.equal(resolveStory("missing-story"), null);
    assert.equal(resolveStory(undefined), null);
  });
});
