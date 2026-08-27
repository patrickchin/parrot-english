import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { after, afterEach, describe, it } from "node:test";
import { createServer } from "vite";
import {
  auditStoryVocabulary,
  countStoryWords,
  getStoryLevel,
  LEARNER_STORY_LEVEL_IDS,
  STORIES,
  STORY_LEVELS,
  STORY_VOCABULARY_PROFILES,
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
      legacyAnswers: null,
      questionnaireVersion: 2,
      responses: {},
      schemaVersion: 2,
    },
    completedAt: "2026-08-25T08:00:00.000Z",
    currentQuestionKey: null,
    description: "Likes animals",
    name: "Mia",
    profileStatus: "completed",
    questionnaireVersion: 2,
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
    { profile: learnerProfile(storyLevel), replaceProfile() {} },
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(StoryList),
      createElement(LocationProbe),
    ),
  );
}

describe("story script catalog", () => {
  it("renders the saved learner shelf without grown-up controls", async () => {
    const container = await mountStrict(
      storyListAt("tiny-stories", "/stories"),
    );

    assert.match(container.textContent, /Little stories/);
    assert.doesNotMatch(container.textContent, /Big adventures/);
    assert.doesNotMatch(
      container.textContent,
      /Grown-up options|Pick a story level|Guardian consent|Upload .* photo|Generate story art/,
    );
  });

  it("renders two public long stories beneath every saved learner shelf", async () => {
    const container = await mountStrict(
      storyListAt("tiny-stories", "/stories?level=tiny-stories"),
    );
    const section = container.querySelector(
      'section[aria-label="Long stories"]',
    );

    assert.ok(section);
    assert.equal(
      section.querySelectorAll('a[aria-label^="Listen to story:"]').length,
      2,
    );
  });

  it("replaces a mismatched story query with the saved shelf without rendering the requested shelf", async () => {
    const container = await mountStrict(
      storyListAt("tiny-stories", "/stories?level=early-a1"),
    );

    assert.match(container.textContent, /Little stories/);
    assert.doesNotMatch(container.textContent, /Big adventures/);
    await waitFor(() =>
      assert.equal(
        container.querySelector('output[aria-label="Current story route"]')
          ?.textContent,
        "/stories?level=tiny-stories",
      ),
    );
  });

  it("replaces an invalid story query with the saved shelf", async () => {
    const container = await mountStrict(
      storyListAt("repeating-patterns", "/stories?level=expert"),
    );

    assert.match(container.textContent, /Say it again/);
    await waitFor(() =>
      assert.equal(
        container.querySelector('output[aria-label="Current story route"]')
          ?.textContent,
        "/stories?level=repeating-patterns",
      ),
    );
  });

  it("publishes 20 stories across four learner levels", () => {
    const learnerStories = STORIES.filter(({ level }) =>
      LEARNER_STORY_LEVEL_IDS.includes(level),
    );
    const learnerLevels = STORY_LEVELS.filter(({ id }) =>
      LEARNER_STORY_LEVEL_IDS.includes(id),
    );

    assert.equal(learnerStories.length, 20);
    assert.equal(learnerLevels.length, 4);
    assert.equal(STORY_VOCABULARY_PROFILES.length, 4);
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
        ...learnerLevels.flatMap(({ id }) => Array(5).fill(id)),
      ],
    );

    for (const level of learnerLevels) {
      assert.equal(
        learnerStories.filter((story) => story.level === level.id).length,
        5,
        `${level.label} story count`,
      );
    }
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
        assert.ok(
          countStoryWords(page.text) <= 45,
          `${story.title}/${page.id} keeps the reading beat short`,
        );
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

  it("keeps every story, page, title, and learner prompt experiment distinct", () => {
    const learnerStories = STORIES.filter(
      ({ level }) => level !== "long-stories",
    );

    assert.equal(new Set(STORIES.map(({ id }) => id)).size, STORIES.length);
    assert.equal(
      new Set(STORIES.map(({ title }) => title)).size,
      STORIES.length,
    );
    assert.equal(
      new Set(
        learnerStories.map(({ promptExperiment }) => promptExperiment.focus),
      ).size,
      learnerStories.length,
    );

    for (const story of STORIES) {
      assert.deepEqual(Object.keys(story).sort(), [
        "assumedKnownWords",
        "category",
        "completionText",
        "cover",
        "durationMinutes",
        "id",
        "level",
        "pages",
        "promptExperiment",
        "summary",
        "targetWords",
        "title",
      ]);
      assert.ok(story.summary.trim(), `${story.title} summary`);
      assert.ok(story.completionText.trim(), `${story.title} completion`);
      assert.ok(
        story.promptExperiment.instruction.trim(),
        `${story.title} prompt`,
      );
      assert.ok(
        story.promptExperiment.hypothesis.trim(),
        `${story.title} hypothesis`,
      );
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

  it("enforces the internal language ceiling for every level", () => {
    for (const story of STORIES) {
      const level = getStoryLevel(story.level);
      const narrativeWords = countStoryWords(
        story.pages.map(({ text }) => text).join(" "),
      );
      const pageWordCounts = story.pages.map(({ text }) =>
        countStoryWords(text),
      );

      assert.ok(
        narrativeWords <= level.maxNarrativeWordsTotal,
        `${story.title} has ${narrativeWords}/${level.maxNarrativeWordsTotal} narrative words`,
      );
      assert.ok(
        Math.max(...pageWordCounts) <= level.maxNarrativeWordsPerPage,
        `${story.title} page ceiling`,
      );
      assert.ok(
        story.targetWords.length >= level.targetWordRange[0] &&
          story.targetWords.length <= level.targetWordRange[1],
        `${story.title} target-word range`,
      );
      assert.ok(
        story.assumedKnownWords.length <= level.maxAssumedKnownWords,
        `${story.title} assumed-known-word ceiling`,
      );
      assert.equal(
        new Set(story.assumedKnownWords).size,
        story.assumedKnownWords.length,
        `${story.title} assumed-known words are distinct`,
      );

      if (story.level === "long-stories") {
        for (const page of story.pages) {
          assert.ok(page.text.trim(), `${story.title}/${page.id} text`);
          assert.ok(page.joinIn.trim(), `${story.title}/${page.id} join-in`);
          assert.ok(
            countStoryWords(page.joinIn) <= 7,
            `${story.title}/${page.id} join-in stays short`,
          );
        }
        continue;
      }

      const completeScript = story.pages
        .map(({ joinIn, text }) => `${text} ${joinIn}`)
        .join(" ")
        .toLowerCase();
      for (const targetWord of story.targetWords) {
        assert.ok(
          completeScript.includes(targetWord.toLowerCase()),
          `${story.title} uses displayed target “${targetWord}”`,
        );
      }
      const scriptTokens = completeScript.match(/[a-z]+(?:['’][a-z]+)?/g) ?? [];
      const targetTokens =
        story.targetWords
          .join(" ")
          .toLowerCase()
          .match(/[a-z]+(?:['’][a-z]+)?/g) ?? [];
      if (story.promptExperiment.exactRefrain) {
        assert.ok(
          story.pages.filter(
            ({ joinIn }) => joinIn === story.promptExperiment.exactRefrain,
          ).length >= 3,
          `${story.title} repeats its exact refrain on at least three pages`,
        );
      } else {
        assert.ok(
          targetTokens.some(
            (targetToken) =>
              scriptTokens.filter((word) => word === targetToken).length >= 3,
          ),
          `${story.title} repeats a teaching word or frame at least three times`,
        );
      }

      const vocabularyAudit = auditStoryVocabulary(story);
      assert.equal(vocabularyAudit.profileId, level.vocabularyProfileId);
      assert.deepEqual(
        vocabularyAudit.unlistedWords,
        [],
        `${story.title} has no undeclared script words`,
      );

      for (const page of story.pages) {
        assert.ok(page.text.trim(), `${story.title}/${page.id} text`);
        assert.ok(page.joinIn.trim(), `${story.title}/${page.id} join-in`);
        assert.ok(
          countStoryWords(page.joinIn) <= 7,
          `${story.title}/${page.id} join-in stays short`,
        );
      }
    }
  });

  it("fully illustrates First words and assigns saved narration and join-in audio to every learner page", () => {
    const joinInAudioByText = new Map();

    for (const story of STORIES.filter(({ level }) => level !== "long-stories")) {
      assert.equal(
        story.cover.src,
        `https://media.parrotbook.com/assets/v3/stories/${story.id}-cover.webp`,
        `${story.title} cover source`,
      );
      assert.ok(story.cover.alt.trim(), `${story.title} cover alt`);
      assert.ok(story.cover.prompt.trim(), `${story.title} cover prompt`);
      assert.doesNotMatch(story.cover.alt, /placeholder/i);

      for (const page of story.pages) {
        if (story.level === "first-words") {
          assert.equal(
            page.artwork.src,
            `https://media.parrotbook.com/assets/v3/story-pages/${story.id}-${page.id}.webp`,
            `${story.title}/${page.id} image source`,
          );
        } else {
          assert.equal(
            page.artwork.src,
            null,
            `${story.title}/${page.id} image source`,
          );
        }
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

  it("keeps unknown words unknown instead of guessing their lemmas", () => {
    const story = STORIES[0];
    const storyWithUnknownWords = {
      ...story,
      pages: story.pages.map((page, pageIndex) =>
        pageIndex === 0
          ? { ...page, text: `${page.text} Thing bed xylophone.` }
          : page,
      ),
    };

    assert.deepEqual(
      auditStoryVocabulary(storyWithUnknownWords).unlistedWords,
      ["bed", "thing", "xylophone"],
    );
  });

  it("replaces the dense Lantern Trail wording without changing its stable ID", () => {
    const story = resolveStory("the-lantern-trail");
    assert.ok(story);
    assert.equal(story.title, "The Lantern Trail");
    assert.equal(story.level, "tiny-stories");
    assert.equal(story.pages.length, 6);

    const narrative = story.pages.map(({ text }) => text).join(" ");
    assert.equal(countStoryWords(narrative), 46);
    assert.ok(
      Math.max(...story.pages.map(({ text }) => countStoryWords(text))) <= 9,
    );
    assert.doesNotMatch(
      narrative,
      /sunset|moonlight|patter|gust|whooshed|cupped|twinkled|hollow|hovered|beneath/i,
    );
    assert.match(narrative, /Pip/);
    assert.match(narrative, /Flicker/);
    assert.match(narrative, /family/);
  });

  it("resolves only exact playable story IDs", () => {
    assert.equal(resolveStory("the-red-ball"), STORIES[0]);
    assert.equal(resolveStory("the-lantern-trail")?.id, "the-lantern-trail");
    assert.equal(resolveStory("the-lantern-trail-original"), null);
    assert.equal(resolveStory("The-Red-Ball"), null);
    assert.equal(resolveStory("missing-story"), null);
    assert.equal(resolveStory(undefined), null);
  });
});
