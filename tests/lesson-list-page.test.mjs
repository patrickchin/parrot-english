import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import test from "node:test";
import { createServer } from "vite";
import { createLessonScript } from "./fixtures/lesson-script.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

const { ApplicationRoutes } = await vite.ssrLoadModule("/src/app/App.tsx");
const { LESSONS } = await vite.ssrLoadModule("/src/lessons/lesson-catalog.ts");
const { LessonList, LessonListView } = await vite.ssrLoadModule(
  "/src/lessons/LessonList.tsx",
);

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

test("lesson list separates ready-made lessons from custom lessons", () => {
  const html = renderLessonList();
  const expectedHrefs = LESSONS.map(
    (entry) => `/lessons/parrot/${encodeURIComponent(entry.id)}/scenes/1`,
  );

  assert.match(html, /<h1[^>]*>Lessons<\/h1>/);
  assert.match(html, /Choose a story and start speaking/i);
  assert.match(
    html,
    /<h2[^>]*id="parrot-lessons-title"[^>]*>Ready-made lessons<\/h2>/,
  );
  assert.match(
    html,
    /<h2[^>]*id="my-lessons-title"[^>]*>My lessons<\/h2>/,
  );
  assert.equal((html.match(/<h2/g) ?? []).length, 2);
  assert.equal((html.match(/<h3/g) ?? []).length, 7);
  assert.match(html, /Peppa&#x27;s High Ball/);
  assert.equal((html.match(/<article/g) ?? []).length, 7);
  assert.deepEqual(getParrotLessonHrefs(html), expectedHrefs);
  assert.equal(
    (html.match(/aria-label="Start lesson: [^"]+"/g) ?? []).length,
    7,
  );
  assert.doesNotMatch(html, /disabled=""|Coming soon/);
});

test("lesson list keeps custom creation secondary and explains who it is for", () => {
  const html = renderInRouter(
    createElement(LessonListView, {
      isLoadingMyLessons: false,
      myLessons: [],
      myLessonsError: "",
      onRetryMyLessons() {},
    }),
  );

  assert.match(html, /No custom lessons yet\./);
  assert.match(html, /grown-up/i);
  assert.match(
    html,
    /<a[^>]*href="\/lessons\/my\/create"[^>]*>.*Create custom lesson<\/a>/s,
  );
});

test("a failed custom-lesson list offers retry without hiding ready-made lessons", () => {
  const html = renderInRouter(
    createElement(LessonListView, {
      isLoadingMyLessons: false,
      myLessons: [],
      myLessonsError: "Your custom lessons could not be loaded.",
      onRetryMyLessons() {},
    }),
  );

  assert.match(html, /role="alert"/);
  assert.match(html, /Your custom lessons could not be loaded\./);
  assert.match(html, /<button[^>]*>Try again<\/button>/);
  assert.match(html, /Peppa&#x27;s High Ball/);
});

test("each saved lesson exposes distinct play and edit actions", () => {
  const html = renderInRouter(
    createElement(LessonListView, {
      isLoadingMyLessons: false,
      myLessons: [
        {
          id: "lesson/id",
          lesson: createLessonScript({ title: "Editable Garden" }),
          source: "uploaded",
        },
      ],
      myLessonsError: "",
      onRetryMyLessons() {},
    }),
  );

  assert.match(html, /aria-label="Start lesson: Editable Garden"/);
  assert.match(html, /href="\/lessons\/my\/lesson%2Fid\/scenes\/1"/);
  assert.match(html, /aria-label="Edit lesson: Editable Garden"/);
  assert.match(html, /href="\/lessons\/my\/lesson%2Fid\/edit"/);
});

test("a canonical Parrot catalog href renders its directly matched lesson route", () => {
  const [firstHref] = getParrotLessonHrefs(renderLessonList());

  assert.ok(firstHref, "Expected a canonical Parrot lesson link");
  const html = renderInRouter(
    createElement(ApplicationRoutes, { loginTarget: "/" }),
    firstHref,
  );

  assert.match(html, /Parrot English speaking lesson/);
  assert.match(html, /Peppa&#x27;s High Ball/);
  assert.doesNotMatch(html, new RegExp(LESSONS[0].lesson.scenes[0].title));
  assert.match(html, /aria-label="Start lesson"/);
  assert.match(html, />Back to lessons</);
});
