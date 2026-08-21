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

const expectedReadyMadeArtwork = [
  [
    "/assets/lesson-covers/01-peppas-high-ball.webp",
    "Peppa reaching for a red ball high in a tree while Dolly flies up to help",
  ],
  [
    "/assets/lesson-covers/02-garden-colors.webp",
    "Peppa and Dolly choosing a red flower for their basket",
  ],
  [
    "/assets/lesson-covers/03-snack-time.webp",
    "Dolly handing Peppa an apple from a snack basket",
  ],
  [
    "/assets/lesson-covers/04-playground-words.webp",
    "Peppa waiting beside a swing while Dolly takes her turn",
  ],
  [
    "/assets/lesson-covers/05-market-day.webp",
    "Peppa buying two red apples from Dolly's fruit stand",
  ],
  [
    "/assets/lesson-covers/06-picnic-time.webp",
    "Dolly pouring juice for Peppa on a picnic blanket",
  ],
  [
    "/assets/lesson-covers/07-bedtime-story.webp",
    "Peppa tucked under a blanket while Dolly reads beside a lantern",
  ],
];

test("lesson list gives children one simple picture-led lesson path", () => {
  const html = renderLessonList();
  const expectedHrefs = LESSONS.map(
    (entry) => `/lessons/parrot/${encodeURIComponent(entry.id)}/scenes/1`,
  );

  assert.match(html, /<h1[^>]*>Pick a lesson<\/h1>/);
  assert.match(html, /Listen\. Then speak\./i);
  assert.match(
    html,
    /<section[^>]*aria-label="Lessons"/,
  );
  assert.match(html, /<h2[^>]*id="grown-up-tools-title"[^>]*>[\s\S]*Grown-up tools<\/h2>/);
  assert.doesNotMatch(html, /id="my-lessons-title"/);
  assert.equal((html.match(/<h3/g) ?? []).length, 7);
  assert.match(html, /Peppa&#x27;s High Ball/);
  assert.equal((html.match(/<article/g) ?? []).length, 7);
  assert.deepEqual(getParrotLessonHrefs(html), expectedHrefs);
  assert.equal(
    (html.match(/aria-label="Start lesson: [^"]+"/g) ?? []).length,
    7,
  );
  for (const practiceLine of [
    "Say: Can you help me?",
    "Say: It is red.",
    "Say: May I have an apple?",
    "Say: Can I have a turn?",
    "Say: Two apples, please.",
    "Say: Yes, please.",
    "Say: Good night.",
  ]) {
    assert.match(html, new RegExp(practiceLine.replace(/[?.]/g, "\\$&")));
  }
  assert.doesNotMatch(html, /retrieve a ball from a high tree branch/i);
  assert.doesNotMatch(html, /disabled=""|Coming soon/);
});

test("ready-made lessons use distinct story-specific artwork", () => {
  const html = renderLessonList();

  for (const [src, alt] of expectedReadyMadeArtwork) {
    const renderedAlt = alt.replaceAll("'", "&#x27;");
    assert.match(
      html,
      new RegExp(
        `<img[^>]*alt="${renderedAlt.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*src="${src.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
      ),
    );
  }

  assert.equal(new Set(expectedReadyMadeArtwork.map(([src]) => src)).size, 7);
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

  assert.match(html, /No made-for-you lessons yet\./);
  assert.match(html, /Grown-up tools/);
  assert.match(
    html,
    /<a[^>]*aria-label="Create custom lesson"[^>]*href="\/lessons\/my\/create"[^>]*>.*Make a lesson<\/a>/s,
  );
});

test("lesson artwork reserves its card space and defers off-screen images", () => {
  const html = renderLessonList();

  assert.equal((html.match(/decoding="async"/g) ?? []).length, 7);
  assert.equal((html.match(/loading="eager"/g) ?? []).length, 2);
  assert.equal((html.match(/loading="lazy"/g) ?? []).length, 5);
  assert.match(
    html,
    /<img[^>]*fetchPriority="high"[^>]*loading="eager"[^>]*src="\/assets\/lesson-covers\/01-peppas-high-ball\.webp"/,
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

test("saved lessons keep distinct play, edit, and create actions", () => {
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
  assert.match(html, /Made for you/);
  assert.match(html, /A lesson made for you\./);
  assert.match(html, /aria-label="Edit lesson: Editable Garden"/);
  assert.match(html, /href="\/lessons\/my\/lesson%2Fid\/edit"/);
  assert.match(html, /Grown-up: edit/);
  assert.match(
    html,
    /<a[^>]*aria-label="Create custom lesson"[^>]*href="\/lessons\/my\/create"[^>]*>.*Make a lesson<\/a>/s,
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
  assert.match(html, /Peppa&#x27;s High Ball/);
  assert.doesNotMatch(html, new RegExp(LESSONS[0].lesson.scenes[0].title));
  assert.match(html, /aria-label="Start lesson"/);
  assert.match(html, />Back to lessons</);
});
