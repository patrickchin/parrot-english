import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import test from "node:test";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

const { ApplicationRoutes } = await vite.ssrLoadModule("/src/App.tsx");
const { LESSONS } = await vite.ssrLoadModule("/src/lesson-catalog.ts");
const { LessonList } = await vite.ssrLoadModule("/src/LessonList.tsx");

test.after(async () => {
  await vite.close();
});

function renderInRouter(element, initialEntry = "/lessons") {
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [initialEntry] }, element),
  );
}

function renderLessonList() {
  assert.equal(typeof LessonList, "function", "Expected an executable LessonList");
  return renderInRouter(createElement(LessonList));
}

function getParrotLessonHrefs(html) {
  return [...html.matchAll(/href="([^"]+)"/g)]
    .map(([, href]) => href)
    .filter((href) => /^\/lessons\/parrot\/[^/]+\/scenes\/1$/.test(href));
}

test("lesson list separates all discovered Parrot lessons from My Lessons", () => {
  const html = renderLessonList();
  const expectedHrefs = LESSONS.map(
    (entry) => `/lessons/parrot/${encodeURIComponent(entry.id)}/scenes/1`,
  );

  assert.match(html, /<h1>Choose a lesson<\/h1>/);
  assert.doesNotMatch(html, /lesson-list-eyebrow|Pick a story and start speaking English/);
  assert.match(html, /<h2 id="parrot-lessons-title">Parrot Lessons<\/h2>/);
  assert.match(html, /<h2 id="my-lessons-title">My Lessons<\/h2>/);
  assert.equal((html.match(/<h2/g) ?? []).length, 2);
  assert.equal((html.match(/<h3/g) ?? []).length, 7);
  assert.match(html, /Peppa&#x27;s High Ball/);
  assert.equal((html.match(/<article/g) ?? []).length, 7);
  assert.deepEqual(getParrotLessonHrefs(html), expectedHrefs);
  assert.equal(
    (html.match(/aria-label="Start lesson: [^"]+"/g) ?? []).length,
    7,
  );
  assert.equal((html.match(/<\/svg> Start lesson<\/a>/g) ?? []).length, 7);
  assert.doesNotMatch(html, /disabled=""|Coming soon/);
});

test("lesson list exposes My Lessons empty and creation states plus main-menu navigation", () => {
  const html = renderLessonList();

  assert.match(
    html,
    /<a class="lesson-main-menu-link app-header-control" href="\/"[^>]*>[^<]*<[^>]+>.*Back to main menu<\/a>/s,
  );
  assert.match(html, /class="my-lessons-empty"/);
  assert.match(html, /You haven&#x27;t created any lessons yet\./);
  assert.match(
    html,
    /<a[^>]*href="\/lessons\/my\/create"[^>]*>.*Create a lesson<\/a>/s,
  );
});

test("a canonical Parrot catalog href renders its directly matched lesson route", () => {
  const [firstHref] = getParrotLessonHrefs(renderLessonList());

  assert.ok(firstHref, "Expected a canonical Parrot lesson link");
  const html = renderInRouter(
    createElement(ApplicationRoutes, { loginTarget: "/" }),
    firstHref,
  );

  assert.match(html, /Parrot English speaking lesson/);
  assert.match(html, new RegExp(LESSONS[0].lesson.scenes[0].title));
  assert.match(html, /aria-label="Start lesson"/);
  assert.match(html, />Back to lessons</);
});
