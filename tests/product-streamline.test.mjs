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
const { LessonListView } = await vite.ssrLoadModule(
  "/src/lessons/LessonList.tsx",
);
const { StoryList } = await vite.ssrLoadModule("/src/stories/StoryList.tsx");
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

test("home gives children three clear, working learning choices", () => {
  const html = renderInRouter(createElement(HomeMenu));
  const hrefs = [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(
    ([, href]) => href,
  );

  assert.deepEqual(hrefs, ["/lessons", "/talk-to-peppa", "/stories"]);
  assert.match(html, /What do you want to do/i);
  assert.doesNotMatch(
    html,
    /World Explorer|Pixel Lesson Lab|Create a Lesson|Progress|coming soon|experiment/i,
  );
});

test("lesson catalog presents one canonical path without artwork experiments", () => {
  const html = renderInRouter(
    createElement(LessonListView, {
      isLoadingMyLessons: false,
      myLessons: [],
      myLessonsError: "",
      onRetryMyLessons() {},
    }),
    "/lessons",
  );

  assert.match(html, /Pick a lesson/);
  assert.match(html, /Grown-up tools/);
  assert.match(html, /aria-label="Create custom lesson"/);
  assert.doesNotMatch(html, /full-scene|same lesson, same audio|comparison/i);
});

test("story shelf presents a curated learner library without research controls", () => {
  const html = renderInRouter(createElement(StoryList), "/stories");

  assert.equal(STORY_LEVELS.length, 4);
  assert.equal(STORIES.length, 20);
  assert.ok(STORIES.every(({ level }) => level !== "original-baseline"));
  assert.match(html, /Pick a story/);
  assert.match(html, /Tap a picture\. I can read it to you\./);
  assert.match(html, /Start here/);
  assert.match(html, /Say it again/);
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
  assert.equal(existsSync(new URL("../worker/pixel-lessons.ts", import.meta.url)), false);
  assert.doesNotMatch(appSource, /PixelLesson|PixelWorld|path="\/games/);
  assert.doesNotMatch(workerSource, /pixelLesson|PixelLesson|\/api\/pixel-lessons/);
});
