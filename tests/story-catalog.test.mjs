import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import {
  auditStoryVocabulary,
  countStoryWords,
  getStoryLevel,
  STORIES,
  STORY_LEVELS,
  STORY_VOCABULARY_PROFILES,
  resolveStory,
} from "../src/stories/story-catalog.ts";

describe("story script catalog", () => {
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

  it("fully illustrates First words while keeping later page art and narration explicit", () => {
    for (const story of STORIES) {
      assert.equal(
        story.cover.src,
        `https://media.parrotbook.com/assets/v2/stories/${story.id}-cover.webp`,
        `${story.title} cover source`,
      );
      assert.ok(story.cover.alt.trim(), `${story.title} cover alt`);
      assert.ok(story.cover.prompt.trim(), `${story.title} cover prompt`);
      assert.doesNotMatch(story.cover.alt, /placeholder/i);

      for (const page of story.pages) {
        if (story.level === "first-words") {
          assert.equal(
            page.artwork.src,
            `https://media.parrotbook.com/assets/v2/story-pages/${story.id}-${page.id}.webp`,
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
          null,
          `${story.title}/${page.id} audio ID`,
        );
        assert.ok(page.artwork.alt.trim(), `${story.title}/${page.id} image alt`);
        assert.doesNotMatch(page.artwork.alt, /placeholder/i);
        assert.ok(page.artwork.prompt.trim(), `${story.title}/${page.id} image prompt`);
      }
    }

    const supersededLanternAssets = [
      ...readdirSync("public/assets/audio").filter((filename) =>
        filename.startsWith("story-lantern-trail-"),
      ),
    ];
    assert.deepEqual(supersededLanternAssets, []);
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
