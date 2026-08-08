import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test, { after } from "node:test";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const lessonFile = fileURLToPath(
  new URL("../content/lessons/02-garden-colors.json", import.meta.url),
);

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

const variantModule = await vite
  .ssrLoadModule("/src/lessons/full-scene-lessons.ts")
  .catch(() => ({}));
const playerUiModule = await vite
  .ssrLoadModule("/src/lessons/LessonPlayerUi.tsx")
  .catch(() => ({}));

const { FULL_SCENE_LESSON_VARIANTS } = variantModule;
const { BoxedFullSceneStage } = playerUiModule;

after(async () => vite.close());

const expectedFrames = [
  ["landscape", "Landscape · 3:2", "3 / 2"],
  ["square", "Square · 1:1", "1 / 1"],
  ["portrait", "Portrait · 2:3", "2 / 3"],
  ["wide", "Wide · 16:9", "16 / 9"],
  ["free", "Natural size", null],
];

const stageFixture = {
  frame: { preset: "landscape" },
  image: {
    alt: "Peppa and Dolly look at colorful flowers in the garden",
    src: "/assets/full-scenes/02-garden-colors/01-colorful-flowers.webp",
  },
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtmlAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getLessonTwoVariant() {
  assert.ok(
    Array.isArray(FULL_SCENE_LESSON_VARIANTS),
    "Expected FULL_SCENE_LESSON_VARIANTS to be an array",
  );
  const variant = FULL_SCENE_LESSON_VARIANTS.find(
    (entry) =>
      entry.baseLessonId === "02-garden-colors" && entry.id === "full-scene",
  );
  assert.ok(variant, "Expected lesson 02 to expose a full-scene variant");
  return variant;
}

function renderStage(scene) {
  assert.equal(
    typeof BoxedFullSceneStage,
    "function",
    "Expected BoxedFullSceneStage to be exported from LessonPlayerUi",
  );
  return renderToStaticMarkup(
    createElement(BoxedFullSceneStage, {
      framePreset: scene.frame.preset,
      image: scene.image,
    }),
  );
}

test("lesson 02 full-scene artwork matches its five-scene story and frame plan", async () => {
  const lesson = JSON.parse(await readFile(lessonFile, "utf8"));
  const variant = getLessonTwoVariant();

  assert.equal(lesson.scenes.length, 5);
  assert.equal(variant.scenes.length, lesson.scenes.length);
  assert.deepEqual(
    variant.scenes.map((scene) => scene.frame.preset),
    expectedFrames.map(([preset]) => preset),
  );
  assert.equal(
    new Set(variant.scenes.map((scene) => scene.image.src)).size,
    lesson.scenes.length,
    "Expected one distinct full-scene image per lesson scene",
  );

  for (const scene of variant.scenes) {
    assert.match(
      scene.image.src,
      /^\/assets\/full-scenes\/02-garden-colors\/.+\.webp$/,
    );
    assert.ok(scene.image.alt.trim(), "Expected descriptive full-scene alt text");
  }
});

test("every lesson 02 full-scene source is an existing WebP file", async () => {
  const variant = getLessonTwoVariant();

  for (const scene of variant.scenes) {
    const filePath = join(publicDir, scene.image.src.replace(/^\//, ""));
    const bytes = await readFile(filePath);

    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
  }
});

test("boxed full-scene artwork renders as one labelled image without layered sprites", () => {
  const html = renderStage(stageFixture);
  const alt = escapeRegExp(escapeHtmlAttribute(stageFixture.image.alt));
  const src = escapeRegExp(escapeHtmlAttribute(stageFixture.image.src));

  assert.match(html, /aria-label="Full-scene artwork"/);
  assert.match(html, /role="region"/);
  assert.match(html, new RegExp(`<img[^>]*alt="${alt}"[^>]*src="${src}"`));
  assert.match(html, />Landscape · 3:2</);
  assert.equal((html.match(/<img\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-character=|lesson-character-slot/);
});

test("boxed full-scene artwork exposes each frame label and leaves free art at its natural ratio", () => {
  for (const [preset, label, aspectRatio] of expectedFrames) {
    const html = renderStage({
      ...stageFixture,
      frame: { preset },
    });

    assert.match(html, new RegExp(`>${escapeRegExp(label)}<`));
    if (aspectRatio) {
      assert.match(
        html,
        new RegExp(`style="[^"]*aspect-ratio:${escapeRegExp(aspectRatio)}`),
      );
    } else {
      assert.doesNotMatch(html, /aspect-ratio:/);
    }
  }
});
