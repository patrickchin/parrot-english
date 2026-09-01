import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import test, { after } from "node:test";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

const { HomeMenu } = await vite.ssrLoadModule("/src/app/HomeMenu.tsx");
const { GuardianDashboardView } = await vite
  .ssrLoadModule("/src/app/GuardianDashboard.tsx")
  .catch(() => ({}));
const { GuardianLanguageProvider } = await vite.ssrLoadModule(
  "/src/i18n/guardian-language.tsx",
);
const { LessonListView } = await vite.ssrLoadModule(
  "/src/lessons/LessonList.tsx",
);
const {
  LessonCompletion,
  LessonErrorBanner,
  LessonHud,
  LessonIntroduction,
  LessonJoinInPrompt,
  LessonPlaybackControls,
  LessonSpeech,
} = await vite.ssrLoadModule("/src/lessons/LessonPlayerUi.tsx");
const { StoryList } = await vite.ssrLoadModule("/src/stories/StoryList.tsx");
const { StoryReader } = await vite.ssrLoadModule(
  "/src/stories/StoryReader.tsx",
);
const { WordGameList } = await vite.ssrLoadModule(
  "/src/games/WordGameList.tsx",
);
const { WordGamePlayer } = await vite.ssrLoadModule(
  "/src/games/WordGamePlayer.tsx",
);
const { WORD_GAME_TOPICS } = await vite.ssrLoadModule(
  "/src/games/word-game-catalog.ts",
);
const { LearnerProfileProvider } = await vite.ssrLoadModule(
  "/src/learner-profile/LearnerProfileContext.tsx",
);
const { STORIES, STORY_LEVELS } = await vite.ssrLoadModule(
  "/src/stories/story-catalog.ts",
);

after(async () => {
  await vite.close();
});

function renderInRouter(element, initialEntry = "/") {
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [initialEntry] }, element),
  );
}

function renderLearnerWithChinesePreference(element, initialEntry = "/") {
  return renderInRouter(
    createElement(
      GuardianLanguageProvider,
      { initialLanguage: "zh-Hans", storage: null },
      element,
    ),
    initialEntry,
  );
}

function assertEnglishOnly(html, expectedCopy) {
  for (const copy of expectedCopy) assert.match(html, new RegExp(copy));
  assert.doesNotMatch(html, /[\p{Script=Han}]/u);
}

test("representative learner catalogs remain English under a Chinese preference", () => {
  const home = renderLearnerWithChinesePreference(createElement(HomeMenu));
  assert.match(home, /<h1[^>]*>\s*Parrot English\s*<\/h1>/);
  assert.match(home, /Lessons/);
  assert.match(home, /Talk to Peppa/);
  assert.match(home, /Story time/);
  assert.doesNotMatch(home, /[\p{Script=Han}]/u);

  const lessons = renderLearnerWithChinesePreference(
    createElement(LessonListView),
    "/lessons",
  );
  assert.match(lessons, /Pick a lesson/);
  assert.match(lessons, /aria-label="Back to home"/);
  assert.doesNotMatch(lessons, /[\p{Script=Han}]/u);
});

test("lesson player states remain English under a Chinese preference", () => {
  const html = renderLearnerWithChinesePreference(
    createElement(
      "main",
      null,
      createElement(LessonHud, {
        currentScene: 1,
        sceneCount: 5,
        title: "Peppa's High Ball",
      }),
      createElement(LessonIntroduction, {
        lessonTitle: "Peppa's High Ball",
        onStart() {},
        sceneCount: 5,
      }),
      createElement(LessonSpeech, {
        characterCount: 1,
        characterIndex: 0,
        speech: {
          kind: "character",
          speaker: "peppa",
          text: "My red ball is high in the tree!",
        },
      }),
      createElement(LessonJoinInPrompt, {
        dialogue: "The ball is high!",
        recording: true,
      }),
      createElement(LessonPlaybackControls, {
        atFinalScene: false,
        atFirstScene: true,
        isPaused: false,
        onNext() {},
        onPauseResume() {},
        onPrevious() {},
      }),
      createElement(LessonErrorBanner, {
        error: "The sound did not play. You can try it again or skip it.",
        onRetry() {},
        onSkip() {},
      }),
      createElement(LessonCompletion, {
        lessonTitle: "Peppa's High Ball",
        onBack() {},
        onReplay() {},
        onRetrySaving() {},
        saveState: "failed",
      }),
    ),
    "/lessons/parrot/01-peppas-high-ball/scenes/1",
  );

  assertEnglishOnly(html, [
    "Scene 1 of 5",
    "Let&#x27;s go",
    "My red ball is high in the tree!",
    "The ball is high!",
    "Your microphone is joining in too",
    'aria-label="Pause lesson"',
    "The sound did not play",
    "Try sound",
    "Skip sound",
    "Some voices have not saved yet",
    "Try saving again",
  ]);
});

test("story shelf and reader remain English under a Chinese preference", () => {
  const profile = {
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
    name: "Sam",
    profileStatus: "completed",
    questionnaireVersion: 2,
    storyLevel: "tiny-stories",
  };
  const shelf = renderLearnerWithChinesePreference(
    createElement(
      LearnerProfileProvider,
      { profile, replaceProfile() {} },
      createElement(StoryList),
    ),
    "/stories",
  );
  assertEnglishOnly(shelf, [
    "Pick a story",
    "Choose a story level",
    "Recommended for [\\s\\S]*Sam",
    "Listen to story:",
  ]);

  const story = STORIES.find(({ id }) => id === "the-red-ball");
  assert.ok(story);
  const reader = renderLearnerWithChinesePreference(
    createElement(StoryReader, {
      backToStories: "/stories",
      onNavigatePage() {},
      pageIndex: 0,
      story,
    }),
    "/stories/the-red-ball/pages/1",
  );
  assertEnglishOnly(reader, [
    "The Red Ball",
    "Page 1 of",
    "Listen to this page",
    "Keep playing to the end",
    "Back to stories",
  ]);
});

test("word-game list and player remain English under a Chinese preference", () => {
  const list = renderLearnerWithChinesePreference(
    createElement(WordGameList),
    "/word-games",
  );
  assertEnglishOnly(list, ["Pick a word game", "Word games", "Animals"]);

  const player = renderLearnerWithChinesePreference(
    createElement(WordGamePlayer, { topic: WORD_GAME_TOPICS[0] }),
    "/word-games/animals",
  );
  assertEnglishOnly(player, [
    "Animals",
    "Game progress",
    "1 of 6",
    "Cat. Which is the cat?",
    "Listen again",
    "Back to games",
  ]);
});

test("home gives children five clear, working learning choices", () => {
  const html = renderInRouter(createElement(HomeMenu));
  const hrefs = [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(
    ([, href]) => href,
  );

  assert.deepEqual(hrefs, [
    "/lessons",
    "/talk-to-peppa",
    "/stories",
    "/dubs",
    "/word-games",
  ]);
  assert.doesNotMatch(html, /href="\/dubs\/(?:five-little-ducks|old-macdonald)"/);
  assert.match(html, /<h1[^>]*>\s*Parrot English\s*<\/h1>/);
  assert.doesNotMatch(html, /Tap a picture\.|>Parrot English<\/p>/i);
  assert.equal((html.match(/<img alt=""/g) ?? []).length, 5);
  assert.match(html, /Nursery rhymes/);
  assert.match(html, /Word game/);
  assert.doesNotMatch(
    html,
    /World Explorer|Pixel Lesson Lab|Create a Lesson|Progress|coming soon|experiment/i,
  );
});

test("guardian dashboard presents one learner-management destination", () => {
  assert.equal(
    typeof GuardianDashboardView,
    "function",
    "Expected a rendered guardian dashboard view",
  );
  const html = renderInRouter(
    createElement(GuardianDashboardView, {
      learnerName: "Mia",
      onSwitchToLearner() {},
    }),
    "/guardian",
  );
  const hrefs = [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(
    ([, href]) => href,
  );

  assert.equal((html.match(/>Learner profiles<\/h2>/g) ?? []).length, 1);
  assert.equal((html.match(/>Manage learners<\/a>/g) ?? []).length, 1);
  assert.equal(hrefs.filter((href) => href === "/guardian/learners").length, 1);
  assert.match(html, /aria-label="Switch to learner"/);
  assert.doesNotMatch(html, /is using learner mode|select who uses learner mode/);
  assert.doesNotMatch(html, /Managing Mia/);
  assert.doesNotMatch(html, />Manage learners<\/h2>|Learner details|Manage learner details/);
});

test("guardian dashboard localizes all authored navigation in Chinese", () => {
  const html = renderInRouter(
    createElement(
      GuardianLanguageProvider,
      { initialLanguage: "zh-Hans", storage: null },
      createElement(GuardianDashboardView, {
        onSwitchToLearner() {},
      }),
    ),
    "/guardian",
  );

  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /<h1[^>]*>\s*家长中心\s*<\/h1>/);
  assert.match(html, /aria-label="页面导航"/);
  assert.match(html, /aria-label="切换到学习模式"/);
  for (const copy of [
    "孩子资料",
    "管理孩子",
    "学习与内容",
    "故事设置",
    "配音管理",
    "账户与隐私",
  ]) {
    assert.match(html, new RegExp(copy));
  }
  for (const english of [
    "Guardian dashboard",
    "Learner profiles",
    "Manage learners",
    "Learning &amp; content",
    "Story settings",
    "Voice dubbing",
    "Account &amp; privacy",
  ]) {
    assert.doesNotMatch(html, new RegExp(english));
  }
});

test("guardian dashboard shows only the remaining learning and content cards", () => {
  const html = renderInRouter(
    createElement(GuardianDashboardView, {
      learnerName: "Mia",
      onSwitchToLearner() {},
    }),
    "/guardian",
  );
  assert.match(
    html,
    /<section[^>]*aria-labelledby="learning-content-heading"[^>]*>/,
  );
  assert.match(
    html,
    /<h2[^>]*id="learning-content-heading"[^>]*>Learning &amp; content<\/h2>/,
  );
  assert.deepEqual(
    [...html.matchAll(/<h[23][^>]*>([^<]+)<\/h[23]>/g)]
      .map(([, heading]) => heading)
      .filter((heading) => heading !== "Learning &amp; content"),
    [
      "Learner profiles",
      "Story settings",
      "Voice dubbing",
      "Account &amp; privacy",
    ],
  );
  assert.doesNotMatch(html, /My Lessons/);
  assert.doesNotMatch(html, /href="\/guardian\/lessons"|>Manage lessons<\/a>/);
});

test("guardian dashboard links a separate account and privacy destination", () => {
  const html = renderInRouter(
    createElement(GuardianDashboardView, {
      learnerName: "Mia",
      onSwitchToLearner() {},
    }),
    "/guardian",
  );
  const hrefs = [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(
    ([, href]) => href,
  );

  assert.deepEqual(hrefs, [
    "/guardian/learners",
    "/guardian/stories",
    "/guardian/dubbing",
    "/guardian/account",
  ]);
  assert.match(html, /<h2[^>]*>Account &amp; privacy<\/h2>/);
  assert.match(html, />Open account &amp; privacy<\/a>/);
  assert.match(
    html,
    /Review how AI is used, what Parrot saves, and account deletion controls/,
  );
  assert.doesNotMatch(html, /profile dropdown/i);
  assert.match(html, /Switch to learner/);
});

test("lesson catalog presents one canonical path without artwork experiments", () => {
  const html = renderInRouter(
    createElement(LessonListView),
    "/lessons",
  );

  assert.match(html, /Pick a lesson/);
  assert.doesNotMatch(
    html,
    /Grown-up: edit|Grown-up tools|Make a lesson|Create custom lesson/,
  );
  assert.doesNotMatch(html, /Made for you|My Lessons|custom lesson/i);
  assert.doesNotMatch(html, /full-scene|same lesson, same audio|comparison/i);
});

test("story shelf presents one curated shelf at a time without research controls", () => {
  const html = renderInRouter(
    createElement(
      LearnerProfileProvider,
      {
        profile: {
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
          storyLevel: "tiny-stories",
        },
        replaceProfile() {},
      },
      createElement(StoryList),
    ),
    "/stories",
  );
  const storyHrefs = [...html.matchAll(/<a[^>]*href="(\/stories\/[^"#?]+\/pages\/1)"/g)].map(
    ([, href]) => href,
  );
  const shelfHeadings = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map(
    ([, heading]) => heading,
  );
  const visibleText = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ");

  assert.deepEqual(
    STORY_LEVELS.map(({ id }) => id),
    [
      "first-english-words",
      "first-words",
      "repeating-patterns",
      "tiny-stories",
      "early-a1",
      "long-stories",
    ],
  );
  assert.deepEqual(
    STORY_LEVELS.map(({ id }) =>
      STORIES.filter(({ level }) => level === id).length,
    ),
    [3, 4, 6, 5, 5, 2],
  );
  assert.equal(STORIES.length, 25);
  assert.equal(new Set(STORIES.map(({ id }) => id)).size, 25);
  assert.ok(STORIES.every(({ level }) => level !== "original-baseline"));
  assert.match(html, /Pick a story/);
  assert.doesNotMatch(
    visibleText,
    /Story time|Tap a picture\. I can read it to you\.|Look\. Listen\. Say it\.|Very short\. One idea on each page\.|The same words come back\.|A little story with short lines\.|A longer story with more words\.|Longer stories with saved narration\./,
  );
  assert.deepEqual(
    shelfHeadings,
    STORIES.filter(({ level }) => level === "tiny-stories").map(
      ({ title }) => title,
    ),
  );
  assert.equal((html.match(/role="tab"/g) ?? []).length, 5);
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
  for (const label of [
    "Level 1 · Words & pictures",
    "Level 2 · Repeating stories",
    "Level 3 · Short stories",
    "Level 4 · Longer stories",
    "Storytime · Listen to a full story",
  ]) {
    assert.match(visibleText, new RegExp(label));
  }
  assert.equal(storyHrefs.length, 5);
  assert.equal(new Set(storyHrefs).size, 5);
  assert.match(visibleText, /Recommended for Mia/);
  assert.equal((html.match(/<img[^>]*loading="eager"/g) ?? []).length, 1);
  assert.equal((html.match(/<img[^>]*loading="lazy"/g) ?? []).length, 4);
  assert.doesNotMatch(
    html,
    /Grown-up options|Guardian consent|Choose story level|Upload learner photo|Generate story art/,
  );
  assert.doesNotMatch(
    html,
    /CEFR|Pre-A1|reading level|Flask|Teaching notes|Prompt test|Assumes familiar|Original baseline|Uncontrolled comparison|experiment/i,
  );
});
