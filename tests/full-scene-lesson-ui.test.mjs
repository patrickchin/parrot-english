import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import test, { after } from "node:test";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const expectedLessonIds = [
  "01-peppas-high-ball",
  "02-garden-colors",
  "03-snack-time",
  "04-playground-words",
  "05-market-day",
  "06-picnic-time",
  "07-bedtime-story",
];

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

function getFullSceneVariants() {
  assert.ok(
    Array.isArray(FULL_SCENE_LESSON_VARIANTS),
    "Expected FULL_SCENE_LESSON_VARIANTS to be an array",
  );

  return expectedLessonIds.map((lessonId) => {
    const matches = FULL_SCENE_LESSON_VARIANTS.filter(
      (entry) => entry.baseLessonId === lessonId && entry.id === "full-scene",
    );
    assert.equal(
      matches.length,
      1,
      `Expected exactly one full-scene variant for ${lessonId}`,
    );
    return matches[0];
  });
}

function getDeclaredReadyMadeVariants() {
  assert.ok(
    Array.isArray(FULL_SCENE_LESSON_VARIANTS),
    "Expected FULL_SCENE_LESSON_VARIANTS to be an array",
  );
  return FULL_SCENE_LESSON_VARIANTS.filter(
    (entry) =>
      entry.id === "full-scene" && expectedLessonIds.includes(entry.baseLessonId),
  );
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

test("every ready-made lesson has one five-scene wide artwork variant", async () => {
  const variants = getFullSceneVariants();
  const allSources = [];

  for (const [index, variant] of variants.entries()) {
    const lessonId = expectedLessonIds[index];
    const lessonFile = fileURLToPath(
      new URL(`../content/lessons/${lessonId}.json`, import.meta.url),
    );
    const lesson = JSON.parse(await readFile(lessonFile, "utf8"));

    assert.equal(lesson.scenes.length, 5, `Expected five scenes in ${lessonId}`);
    assert.equal(variant.scenes.length, lesson.scenes.length);
    assert.deepEqual(
      variant.scenes.map((scene) => scene.frame.preset),
      Array.from({ length: lesson.scenes.length }, () => "wide"),
    );

    for (const scene of variant.scenes) {
      assert.match(
        scene.image.src,
        new RegExp(`^/assets/full-scenes/${lessonId}/.+\\.webp$`),
      );
      assert.ok(
        scene.image.alt.trim(),
        `Expected descriptive full-scene alt text for ${lessonId}`,
      );
      allSources.push(scene.image.src);
    }
  }

  assert.equal(allSources.length, 35);
  assert.equal(
    new Set(allSources).size,
    allSources.length,
    "Expected all 35 full-scene artwork sources to be globally unique",
  );
});

test("every declared ready-made full-scene source is an existing 1672x941 WebP file", async () => {
  const variants = getDeclaredReadyMadeVariants();
  const allSources = variants.flatMap((variant) =>
    variant.scenes.map((scene) => scene.image.src),
  );

  assert.equal(
    variants.length,
    expectedLessonIds.length,
    "Expected asset declarations for all seven ready-made lessons",
  );
  assert.equal(allSources.length, 35);
  assert.equal(new Set(allSources).size, allSources.length);

  for (const source of allSources) {
    const filePath = join(publicDir, source.replace(/^\//, ""));
    const bytes = await readFile(filePath);

    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");

    const metadata = await sharp(filePath).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1672, `Expected ${source} width`);
    assert.equal(metadata.height, 941, `Expected ${source} height`);
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
