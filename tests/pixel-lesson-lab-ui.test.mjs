import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import test, { after } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const labModule = await vite
  .ssrLoadModule("/src/games/PixelLessonLab.tsx")
  .catch(() => ({}));
const scriptModule = await vite
  .ssrLoadModule("/src/games/pixel-lesson-script.ts")
  .catch(() => ({}));
const { PixelLessonLab, PixelLessonWarnings } = labModule;
const { formatPixelLessonScript, parsePixelLessonScript } = scriptModule;

after(async () => vite.close());

test("pixel lesson lab starts with one generator action and a live sample", () => {
  assert.equal(typeof PixelLessonLab, "function", "Expected PixelLessonLab");
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/games"] },
      createElement(PixelLessonLab),
    ),
  );

  assert.match(html, /<h1[^>]*>Pixel Lesson Lab<\/h1>/);
  assert.match(html, /grown-up tools/i);
  assert.match(html, /What should this adventure practice\?/);
  assert.match(html, /<textarea[^>]*id="pixel-lesson-topic"[^>]*maxlength="500"/i);
  assert.match(html, /Generate in game/);
  assert.match(html, /Live game preview/);
  assert.match(html, /Sample mission/);
  assert.match(html, /What AI can change/);
  assert.doesNotMatch(html, /pixel-lesson-script/);
});

test("pixel lesson JSON can be formatted and prepared again", async () => {
  const { DEFAULT_PIXEL_LESSON } = await vite.ssrLoadModule(
    "/lib/pixel-lesson-data.ts",
  );
  assert.equal(typeof formatPixelLessonScript, "function");
  assert.equal(typeof parsePixelLessonScript, "function");

  const formatted = formatPixelLessonScript(DEFAULT_PIXEL_LESSON);
  assert.match(formatted, /^\{\n {2}"schemaVersion": 1,/);
  assert.deepEqual(parsePixelLessonScript(formatted), {
    lesson: DEFAULT_PIXEL_LESSON,
    warnings: [],
  });
  assert.throws(
    () => parsePixelLessonScript('{"title":', "edited game script"),
    /edited game script must contain valid JSON/i,
  );
});

test("pixel lesson warnings are visible without blocking the preview", () => {
  assert.equal(typeof PixelLessonWarnings, "function");
  const html = renderToStaticMarkup(
    createElement(PixelLessonWarnings, {
      warnings: ["missions[0].targetId: using lesson-tree"],
    }),
  );

  assert.match(html, /role="status"/);
  assert.match(html, /Game script warnings/);
  assert.match(html, /using lesson-tree/);
  assert.doesNotMatch(html, /disabled/);
});
