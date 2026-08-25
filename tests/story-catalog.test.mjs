import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { after, afterEach, describe, it } from "node:test";
import {
  auditStoryVocabulary,
  countStoryWords,
  getStoryLevel,
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
import { createHermeticViteServer } from "./helpers/hermetic-vite-server.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const restoreDom = installDom();
const viteHarness = await createHermeticViteServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
});
const vite = viteHarness.server;
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
  await viteHarness.close();
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
      /Grown-up options|Pick a story level|Guardian consent|Upload learner photo|Generate story art/,
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
    assert.equal(STORIES.length, 20);
    assert.equal(STORY_LEVELS.length, 4);
    assert.equal(STORY_VOCABULARY_PROFILES.length, 4);
    assert.deepEqual(
      STORY_LEVELS.map(({ id }) => id),
      [
        "first-words",
        "repeating-patterns",
        "tiny-stories",
        "early-a1",
      ],
    );
    assert.deepEqual(
      STORIES.map(({ level }) => level),
      [
        ...STORY_LEVELS.flatMap(({ id }) => Array(5).fill(id)),
      ],
    );

    for (const level of STORY_LEVELS) {
      assert.equal(
        STORIES.filter((story) => story.level === level.id).length,
        5,
        `${level.label} story count`,
      );
    }
  });

  it("keeps every story, page, title, and prompt experiment distinct", () => {
    assert.equal(new Set(STORIES.map(({ id }) => id)).size, STORIES.length);
    assert.equal(new Set(STORIES.map(({ title }) => title)).size, STORIES.length);
    assert.equal(
      new Set(STORIES.map(({ promptExperiment }) => promptExperiment.focus)).size,
      STORIES.length,
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
      assert.ok(story.promptExperiment.instruction.trim(), `${story.title} prompt`);
      assert.ok(story.promptExperiment.hypothesis.trim(), `${story.title} hypothesis`);
      assert.ok(story.pages.length >= 5 && story.pages.length <= 7, `${story.title} pages`);
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
      const pageWordCounts = story.pages.map(({ text }) => countStoryWords(text));

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
      const targetTokens = story.targetWords
        .join(" ")
        .toLowerCase()
        .match(/[a-z]+(?:['’][a-z]+)?/g) ?? [];
      if (story.promptExperiment.exactRefrain) {
        assert.ok(
          story.pages.filter(
            ({ joinIn }) =>
              joinIn === story.promptExperiment.exactRefrain,
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

  it("fully illustrates First words and assigns saved narration and join-in audio to every page", () => {
    const joinInAudioByText = new Map();

    for (const story of STORIES) {
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
        assert.ok(page.artwork.alt.trim(), `${story.title}/${page.id} image alt`);
        assert.doesNotMatch(page.artwork.alt, /placeholder/i);
        assert.ok(page.artwork.prompt.trim(), `${story.title}/${page.id} image prompt`);
      }
    }

    const savedStoryAssets = new Set(
      readdirSync("public/assets/audio").filter((filename) =>
        filename.startsWith("story-"),
      ),
    );
    const expectedStoryAssets = new Set(
      STORIES.flatMap((story) =>
        story.pages.flatMap((page) => [
          `${page.narrationAudioId}.mp3`,
          `${page.joinInAudioId}.mp3`,
        ]),
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

    assert.deepEqual(auditStoryVocabulary(storyWithUnknownWords).unlistedWords, [
      "bed",
      "thing",
      "xylophone",
    ]);
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
