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
  it("publishes 20 script experiments plus the original baseline", () => {
    assert.equal(STORIES.length, 21);
    assert.equal(STORY_LEVELS.length, 5);
    assert.equal(STORY_VOCABULARY_PROFILES.length, 4);
    assert.deepEqual(
      STORY_LEVELS.map(({ id }) => id),
      [
        "first-words",
        "repeating-patterns",
        "tiny-stories",
        "early-a1",
        "original-baseline",
      ],
    );
    assert.deepEqual(
      STORIES.map(({ level }) => level),
      [
        ...STORY_LEVELS.slice(0, 4).flatMap(({ id }) => Array(5).fill(id)),
        "original-baseline",
      ],
    );

    for (const [levelIndex, level] of STORY_LEVELS.entries()) {
      assert.equal(
        STORIES.filter((story) => story.level === level.id).length,
        levelIndex < 4 ? 5 : 1,
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

  it("uses generated covers while keeping page artwork and audio as placeholders", () => {
    for (const story of STORIES) {
      assert.equal(
        story.cover.src,
        `/assets/stories/${story.id}-cover.webp`,
        `${story.title} cover source`,
      );
      assert.ok(
        existsSync(`public${story.cover.src}`),
        `${story.title} cover file exists`,
      );
      assert.ok(story.cover.alt.trim(), `${story.title} cover alt`);
      assert.ok(story.cover.prompt.trim(), `${story.title} cover prompt`);
      assert.doesNotMatch(story.cover.alt, /placeholder/i);

      for (const page of story.pages) {
        assert.equal(page.artwork.src, null, `${story.title}/${page.id} image source`);
        assert.equal(
          page.narrationAudioId,
          null,
          `${story.title}/${page.id} audio ID`,
        );
        assert.ok(page.artwork.alt.trim(), `${story.title}/${page.id} image alt`);
        assert.ok(page.artwork.prompt.trim(), `${story.title}/${page.id} image prompt`);
      }
    }

    const supersededLanternAssets = [
      ...readdirSync("public/assets/audio").filter((filename) =>
        filename.startsWith("story-lantern-trail-"),
      ),
      ...readdirSync("public/assets/stories").filter((filename) =>
        /^the-lantern-trail-0[1-6]\.webp$/.test(filename),
      ),
    ];
    assert.deepEqual(supersededLanternAssets, []);
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

  it("keeps the complete original Lantern Trail beside the controlled rewrite", () => {
    const story = resolveStory("the-lantern-trail-original");
    assert.ok(story);
    assert.equal(story.title, "The Lantern Trail — Original");
    assert.equal(story.level, "original-baseline");
    assert.equal(story.pages.length, 6);
    assert.equal(story.assumedKnownWords.length, 107);
    assert.deepEqual(
      story.pages.map(({ id, joinIn, text }) => ({ id, joinIn, text })),
      [
        {
          id: "the-garden-gate",
          text:
            "At sunset, Pip the green parrot heard a tiny voice by the garden gate. “I’m Flicker,” said a little firefly. “The wind blew me away from my family.” Pip opened his wings. “We’ll follow your glow and find the lantern tree.”",
          joinIn: "Glow, little lantern, show us the way!",
        },
        {
          id: "the-moonlit-stream",
          text:
            "The trail reached a stream where round stones winked in the moonlight. Flicker lit the first stone, and Pip hopped after him—tip, tap, tip! Together they crossed without wetting a feather.",
          joinIn: "Glow, little lantern, show us the way!",
        },
        {
          id: "the-rain-leaf",
          text:
            "Soft rain began to patter. Pip lifted a giant leaf over them like an umbrella, but Flicker’s light grew dim. Pip stayed close until the warm glow shone again.",
          joinIn: "Glow, little lantern, show us the way!",
        },
        {
          id: "the-windy-sunflowers",
          text:
            "A gust whooshed through the sleeping sunflowers and spun Flicker in circles. Pip cupped his wings around his little friend. When the wind passed, a golden trail twinkled ahead.",
          joinIn: "Glow, little lantern, show us the way!",
        },
        {
          id: "the-lantern-tree",
          text:
            "The trail ended at an old lantern tree. Dozens of fireflies danced from the hollow, and Flicker’s family wrapped him in a warm, sparkling hug. Pip cheered as the whole tree lit up.",
          joinIn: "Welcome home, Flicker!",
        },
        {
          id: "one-last-glow",
          text:
            "Flicker guided Pip back to his cosy tree house. One tiny light hovered outside the round window until Pip was tucked beneath his blanket. Then Flicker blinked once, twice, and floated home beneath the moon.",
          joinIn: "Good night, little lantern.",
        },
      ],
    );

    const narrative = story.pages.map(({ text }) => text).join(" ");
    assert.equal(countStoryWords(narrative), 199);
    assert.equal(
      Math.max(...story.pages.map(({ text }) => countStoryWords(text))),
      41,
    );
    assert.match(narrative, /sunset|moonlight|patter|whooshed|twinkled/i);
    assert.match(narrative, /One tiny light hovered outside the round window/);
  });

  it("resolves only exact playable story IDs", () => {
    assert.equal(resolveStory("the-red-ball"), STORIES[0]);
    assert.equal(resolveStory("the-lantern-trail")?.id, "the-lantern-trail");
    assert.equal(
      resolveStory("the-lantern-trail-original")?.id,
      "the-lantern-trail-original",
    );
    assert.equal(resolveStory("The-Red-Ball"), null);
    assert.equal(resolveStory("missing-story"), null);
    assert.equal(resolveStory(undefined), null);
  });
});
