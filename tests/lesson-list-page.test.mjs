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

const { ApplicationRoutes } = await vite.ssrLoadModule("/src/app/App.tsx");
const { LearnerProfileProvider } = await vite.ssrLoadModule(
  "/src/learner-profile/LearnerProfileContext.tsx",
);
const { LESSONS } = await vite.ssrLoadModule("/src/lessons/lesson-catalog.ts");
const { LessonList } = await vite.ssrLoadModule("/src/lessons/LessonList.tsx");

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

function renderApplicationRoutes(initialEntry) {
  return renderInRouter(
    createElement(
      LearnerProfileProvider,
      {
        profile: {
          id: "learner-mia",
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
          storyLevel: "first-words",
        },
        replaceProfile() {},
      },
      createElement(ApplicationRoutes, { loginTarget: "/" }),
    ),
    initialEntry,
  );
}

function getParrotLessonHrefs(html) {
  return [...html.matchAll(/href="([^"]+)"/g)]
    .map(([, href]) => href)
    .filter((href) => /^\/lessons\/parrot\/[^/]+\/scenes\/1$/.test(href));
}

const expectedReadyMadeArtwork = [
  [
    "https://media.parrotbook.com/assets/v3/lesson-covers/01-peppas-high-ball.webp",
    "Peppa reaching for a red ball high in a tree while Dolly flies up to help",
  ],
  [
    "https://media.parrotbook.com/assets/v3/lesson-covers/02-garden-colors.webp",
    "Peppa and Dolly choosing a red flower for their basket",
  ],
  [
    "https://media.parrotbook.com/assets/v3/lesson-covers/03-snack-time.webp",
    "Dolly handing Peppa an apple from a snack basket",
  ],
  [
    "https://media.parrotbook.com/assets/v3/lesson-covers/04-playground-words.webp",
    "Peppa waiting beside a swing while Dolly takes her turn",
  ],
  [
    "https://media.parrotbook.com/assets/v3/lesson-covers/05-market-day.webp",
    "Peppa buying two red apples from Dolly's fruit stand",
  ],
  [
    "https://media.parrotbook.com/assets/v3/lesson-covers/06-picnic-time.webp",
    "Dolly pouring juice for Peppa on a picnic blanket",
  ],
  [
    "https://media.parrotbook.com/assets/v3/lesson-covers/07-bedtime-story.webp",
    "Peppa tucked under a blanket while Dolly reads beside a lantern",
  ],
];

test("lesson list gives children one simple picture-led lesson path", () => {
  const html = renderLessonList();
  const expectedHrefs = LESSONS.map(
    (entry) => `/lessons/parrot/${encodeURIComponent(entry.id)}/scenes/1`,
  );

  assert.match(html, /<h1[^>]*>Pick a lesson<\/h1>/);
  assert.doesNotMatch(html, /Listen\. Then speak\./i);
  assert.doesNotMatch(html, /\b\d+ parts\b/);
  assert.match(
    html,
    /<section[^>]*aria-label="Lessons"/,
  );
  assert.doesNotMatch(
    html,
    /Grown-up: edit|Grown-up tools|Make a lesson|Create custom lesson/,
  );
  assert.doesNotMatch(html, /id="my-lessons-title"/);
  assert.doesNotMatch(html, /Made for you|My Lessons|custom lesson/i);
  assert.equal((html.match(/<h2/g) ?? []).length, 7);
  assert.equal((html.match(/<h3/g) ?? []).length, 0);
  assert.match(html, /Peppa&#x27;s High Ball/);
  assert.equal((html.match(/<article/g) ?? []).length, 7);
  assert.deepEqual(getParrotLessonHrefs(html), expectedHrefs);
  assert.equal(
    (html.match(/aria-label="Start lesson: [^"]+"/g) ?? []).length,
    7,
  );
  assert.equal((html.match(/>Play<\/span>/g) ?? []).length, 7);
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

test("lesson artwork reserves its card space and defers off-screen images", () => {
  const html = renderLessonList();

  assert.equal((html.match(/decoding="async"/g) ?? []).length, 7);
  assert.equal((html.match(/loading="eager"/g) ?? []).length, 2);
  assert.equal((html.match(/loading="lazy"/g) ?? []).length, 5);
  assert.match(
    html,
    /<img[^>]*fetchPriority="high"[^>]*loading="eager"[^>]*src="https:\/\/media\.parrotbook\.com\/assets\/v3\/lesson-covers\/01-peppas-high-ball\.webp"/,
  );
  assert.match(
    html,
    /sizes="\(max-width: 359px\) 104px,[^"]+"/,
  );
  assert.match(
    html,
    /srcSet="https:\/\/media\.parrotbook\.com\/assets\/v3\/lesson-covers\/01-peppas-high-ball-384\.webp 384w, https:\/\/media\.parrotbook\.com\/assets\/v3\/lesson-covers\/01-peppas-high-ball-768\.webp 768w"/,
  );
});

test("a canonical Parrot catalog href renders its directly matched lesson route", () => {
  const [firstHref] = getParrotLessonHrefs(renderLessonList());

  assert.ok(firstHref, "Expected a canonical Parrot lesson link");
  const html = renderApplicationRoutes(firstHref);

  assert.match(html, /Parrot English speaking lesson/);
  assert.match(html, /<h1[^>]*>Peppa&#x27;s High Ball<\/h1>/);
  assert.doesNotMatch(html, new RegExp(LESSONS[0].lesson.scenes[0].title));
  assert.match(html, /say the big words with the group/);
  assert.doesNotMatch(html, /5 parts|Watch and join in/);
  assert.match(html, /Loading picture…/);
  assert.doesNotMatch(html, /aria-label="Start lesson"/);
  assert.match(html, />Back to lessons</);
});
