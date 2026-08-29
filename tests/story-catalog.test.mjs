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
  // Production break caught: adult controls or internal catalog metadata leaks
  // into the learner-facing all-story shelf.
  it("keeps adult and internal metadata off the learner shelf", async () => {
    const container = await mountStrict(
      storyListAt("first-words", "/stories"),
    );
    const intendedShelfText = [
      ...STORY_LEVELS.flatMap(({ description, label }) => [label, description]),
      ...STORIES.map(({ title }) => title),
    ].join("\n");
    const internalMetadata = [
      ...STORY_LEVELS.map(({ cefrReference }) => cefrReference),
      ...STORIES.flatMap(
        ({ category, promptExperiment, targetWords }) => [
          category,
          promptExperiment.focus,
          promptExperiment.hypothesis,
          promptExperiment.instruction,
          targetWords.join(", "),
        ],
      ),
    ].filter(
      (value) => value && !intendedShelfText.includes(value),
    );

    assert.doesNotMatch(
      container.textContent,
      /Grown-up options|Pick a story level|Guardian consent|Upload .* photo|Generate story art|CEFR|Target words|Assumed known|Prompt experiment|Category|Narrative word/i,
    );
    for (const value of internalMetadata) {
      assert.equal(
        container.textContent.includes(value),
        false,
        `internal shelf metadata: ${value}`,
      );
    }
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

  // Production break caught: a saved preference or legacy level query filters
  // sections/cards, produces duplicate routes, or preserves a second shelf URL.
  it("renders all six sections and 25 unique stories for every saved learner profile", async () => {
    const expectedSections = [
      ["First English words", 3],
      ["Start here", 4],
      ["Say it again", 6],
      ["Little stories", 5],
      ["Big adventures", 5],
      ["Long stories", 2],
    ];

    for (const storyLevel of LEARNER_STORY_LEVEL_IDS) {
      const container = await mountStrict(
        storyListAt(storyLevel, `/stories?level=${storyLevel}`),
      );

      try {
        const shelf = container.querySelector(
          'section[aria-label="Read-aloud stories"]',
        );
        assert.ok(shelf, `${storyLevel} shelf`);
        const sections = [...shelf.children].filter((child) =>
          child.matches("section[aria-label]"),
        );
        assert.deepEqual(
          sections.map((section) => [
            section.querySelector("h2")?.textContent,
            section.querySelectorAll('a[aria-label^="Listen to story:"]')
              .length,
          ]),
          expectedSections,
          `${storyLevel} sections`,
        );

        const playableLinks = [
          ...container.querySelectorAll(
            'a[aria-label^="Listen to story:"]',
          ),
        ];
        const playableHrefs = playableLinks.map((link) =>
          link.getAttribute("href"),
        );
        assert.equal(playableLinks.length, 25, `${storyLevel} story links`);
        assert.equal(
          new Set(playableHrefs).size,
          25,
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
            "/stories",
          ),
        );
      } finally {
        await cleanupMountedRoots();
        document.body.replaceChildren();
      }
    }
  });

  // Production break caught: preference stories are added/removed or Rose stays
  // on Start here instead of moving to the repeating-pattern shelf.
  it("publishes 20 stories in the 4/6/5/5 learner preference distribution", () => {
    const learnerStories = STORIES.filter(({ level }) =>
      LEARNER_STORY_LEVEL_IDS.includes(level),
    );
    const learnerLevels = STORY_LEVELS.filter(({ id }) =>
      LEARNER_STORY_LEVEL_IDS.includes(id),
    );

    assert.equal(learnerStories.length, 20);
    assert.equal(learnerLevels.length, 4);
    assert.equal(STORY_VOCABULARY_PROFILES.length, 5);
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
        ...Array(4).fill("first-words"),
        ...Array(6).fill("repeating-patterns"),
        ...Array(5).fill("tiny-stories"),
        ...Array(5).fill("early-a1"),
      ],
    );

    const expectedStoryCount = new Map([
      ["first-words", 4],
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

  // Production break caught: the new shelf copies a looser level or introduces
  // a fifth saved learner preference instead of reusing first-words vocabulary.
  it("defines the strict First English words level contract", () => {
    assert.deepEqual(
      STORY_LEVELS.find(({ id }) => id === "first-english-words"),
      {
        id: "first-english-words",
        label: "First English words",
        cefrReference: "Before Pre-A1",
        description: "Look. Listen. Say it.",
        maxAssumedKnownWords: 0,
        maxNarrativeWordsPerPage: 6,
        maxNarrativeWordsTotal: 30,
        targetWordRange: [4, 6],
        vocabularyProfileId: "first-english-words-v1",
      },
    );
    assert.equal(STORY_VOCABULARY_PROFILES.length, 5);
  });

  // Production break caught: the zero-assumption level silently inherits a
  // broader first-words grammar inventory than its scripts actually picture.
  it("limits First English words scaffolding to a and on", () => {
    const profile = STORY_VOCABULARY_PROFILES.find(
      ({ id }) => id === "first-english-words-v1",
    );
    assert.ok(profile);
    assert.deepEqual(profile.coreWords, ["a", "on"]);

    const story = resolveStory("hello-cat");
    assert.ok(story);
    const storyWithBroaderCoreWord = {
      ...story,
      pages: story.pages.map((page, pageIndex) =>
        pageIndex === 0 ? { ...page, text: `${page.text} I.` } : page,
      ),
    };

    assert.deepEqual(auditStoryVocabulary(storyWithBroaderCoreWord), {
      profileId: "first-english-words-v1",
      unlistedWords: ["i"],
    });
  });

  // Production break caught: a First English words story is missing, renamed,
  // given the wrong teaching targets, padded with prior vocabulary, or not five pages.
  it("publishes exactly the three approved five-page First English words stories", () => {
    assert.equal(STORIES.length, 25);
    assert.deepEqual(
      STORIES.filter(({ level }) => level === "first-english-words").map(
        ({ assumedKnownWords, id, pages, targetWords, title }) => ({
          assumedKnownWords,
          id,
          pageIds: pages.map(({ id: pageId }) => pageId),
          targetWords,
          title,
        }),
      ),
      [
        {
          assumedKnownWords: [],
          id: "hello-cat",
          pageIds: [
            "cat-hello",
            "dog-hello",
            "bird-hello",
            "friends-hello",
            "friends-bye",
          ],
          targetWords: ["hello", "bye", "cat", "dog", "bird"],
          title: "Hello, Cat!",
        },
        {
          assumedKnownWords: [],
          id: "marys-face",
          pageIds: ["face", "eyes", "ears", "nose", "mouth"],
          targetWords: ["face", "eyes", "ears", "nose", "mouth", "point"],
          title: "Mary’s Face",
        },
        {
          assumedKnownWords: [],
          id: "wash-sam-wash",
          pageIds: [
            "dirty-hands",
            "water-on-hands",
            "soap-on-hands",
            "wash-hands",
            "clean-hands",
          ],
          targetWords: ["hands", "dirty", "water", "soap", "wash", "clean"],
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
    assert.deepEqual(story.assumedKnownWords, []);
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

  // Production break caught: any story exceeds its declared total, per-page,
  // target-word, assumed-vocabulary, or repetition ceiling.
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

  it("exempts only familiar beginner names from teaching vocabulary", () => {
    const story = resolveStory("the-red-ball");
    assert.ok(story);
    const storyWithNames = {
      ...story,
      pages: story.pages.map((page, pageIndex) =>
        pageIndex === 0
          ? {
              ...page,
              text: `${page.text} Bob, Mary, Rose, Jack, Ben, Sam, and Jo.`,
            }
          : page,
      ),
    };

    assert.deepEqual(auditStoryVocabulary(storyWithNames).unlistedWords, [
      "jo",
    ]);
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
      const coverVersion = story.level === "first-english-words" ? 7 : 3;
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
          story.level === "first-english-words"
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
    assert.match(narrative, /Ben/);
    assert.match(narrative, /Sam/);
    assert.match(narrative, /family/);
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
