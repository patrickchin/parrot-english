import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
const { LessonListView } = await vite.ssrLoadModule(
  "/src/lessons/LessonList.tsx",
);
const { StoryList } = await vite.ssrLoadModule("/src/stories/StoryList.tsx");
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

test("home gives children four clear, working learning choices", () => {
  const html = renderInRouter(createElement(HomeMenu));
  const hrefs = [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(
    ([, href]) => href,
  );

  assert.deepEqual(hrefs, [
    "/lessons",
    "/talk-to-peppa",
    "/stories",
    "/dubs",
  ]);
  assert.doesNotMatch(html, /href="\/dubs\/(?:five-little-ducks|old-macdonald)"/);
  assert.match(html, /Tap a picture\./i);
  assert.equal((html.match(/<img alt=""/g) ?? []).length, 4);
  assert.match(html, /Nursery rhymes/);
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
      error: "",
      isSwitching: false,
      learnerName: "Mia",
      onSwitchToLearner() {},
    }),
    "/guardian",
  );
  const hrefs = [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(
    ([, href]) => href,
  );

  assert.equal((html.match(/>Manage learners<\/h2>/g) ?? []).length, 1);
  assert.equal((html.match(/>Manage learners<\/a>/g) ?? []).length, 1);
  assert.equal(hrefs.filter((href) => href === "/guardian/learners").length, 1);
  assert.match(html, /<bdi[^>]*>Mia<\/bdi> is using learner mode/);
  assert.match(html, /Add a learner, select who uses learner mode, or edit learner details/);
  assert.doesNotMatch(html, /Learner profiles|Learner details|Manage learner details/);
});

test("guardian dashboard groups the three learning and content tools", () => {
  const html = renderInRouter(
    createElement(GuardianDashboardView, {
      error: "",
      isSwitching: false,
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
    [...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map(([, heading]) =>
      heading,
    ),
    ["My Lessons", "Story settings", "Voice dubbing"],
  );
});

test("guardian dashboard links a separate account and privacy destination", () => {
  const html = renderInRouter(
    createElement(GuardianDashboardView, {
      error: "",
      isSwitching: false,
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
    "/guardian/lessons",
    "/guardian/stories",
    "/guardian/dubbing",
    "/guardian/account",
  ]);
  assert.match(html, /<h2[^>]*>Account &amp; privacy<\/h2>/);
  assert.match(html, />Open account &amp; privacy<\/a>/);
  assert.match(html, /AI and saved data.*sign out.*delete/i);
  assert.doesNotMatch(html, /profile dropdown/i);
  assert.match(html, /Switch to learner/);
});

test("lesson catalog presents one canonical path without artwork experiments", () => {
  const html = renderInRouter(
    createElement(LessonListView, {
      myLessons: [],
      myLessonsLoadPhase: "ready",
      onRetryMyLessons() {},
    }),
    "/lessons",
  );

  assert.match(html, /Pick a lesson/);
  assert.doesNotMatch(
    html,
    /Grown-up: edit|Grown-up tools|Make a lesson|Create custom lesson/,
  );
  assert.doesNotMatch(html, /full-scene|same lesson, same audio|comparison/i);
});

test("story shelf presents a curated learner library without research controls", () => {
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

  assert.equal(STORY_LEVELS.length, 5);
  assert.equal(STORIES.length, 22);
  assert.equal(
    STORIES.filter(({ level }) => level !== "long-stories").length,
    20,
  );
  assert.equal(
    STORIES.filter(({ level }) => level === "long-stories").length,
    2,
  );
  assert.ok(STORIES.every(({ level }) => level !== "original-baseline"));
  assert.match(html, /Pick a story/);
  assert.match(html, /Tap a picture\. I can read it to you\./);
  assert.match(html, /Little stories/);
  assert.match(html, /Long stories/);
  assert.doesNotMatch(
    html,
    /Start here|Say it again|Big adventures|Grown-up options|Guardian consent/,
  );
  assert.doesNotMatch(
    html,
    /CEFR|Pre-A1|reading level|Flask|Teaching notes|Prompt test|Assumes familiar|Original baseline|Uncontrolled comparison|experiment/i,
  );
});

test("the shipped application no longer carries the pixel-game prototype", () => {
  const packageManifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const appSource = readFileSync(
    new URL("../src/app/App.tsx", import.meta.url),
    "utf8",
  );
  const workerSource = readFileSync(
    new URL("../worker/index.ts", import.meta.url),
    "utf8",
  );

  assert.equal(packageManifest.dependencies.phaser, undefined);
  assert.equal(
    existsSync(new URL("../src/games/PixelLessonLab.tsx", import.meta.url)),
    false,
  );
  assert.equal(
    existsSync(new URL("../worker/pixel-lessons.ts", import.meta.url)),
    false,
  );
  assert.doesNotMatch(appSource, /PixelLesson|PixelWorld|path="\/games/);
  assert.doesNotMatch(
    workerSource,
    /pixelLesson|PixelLesson|\/api\/pixel-lessons/,
  );
});
