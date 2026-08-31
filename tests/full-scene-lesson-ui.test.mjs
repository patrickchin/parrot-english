import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test, { after } from "node:test";
import { createServer } from "vite";
import {
  STATIC_MEDIA_ASSETS,
  createStaticMediaPublishPlan,
} from "../scripts/static-media.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
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

const artworkModule = await vite
  .ssrLoadModule("/src/lessons/full-scene-lessons.ts")
  .catch(() => ({}));
const playerUiModule = await vite
  .ssrLoadModule("/src/lessons/LessonPlayerUi.tsx")
  .catch(() => ({}));

const { FULL_SCENE_LESSONS } = artworkModule;
const {
  BoxedFullSceneStage,
  LessonCompletion,
  LessonIntroduction,
  LessonJoinInPrompt,
} = playerUiModule;

after(async () => vite.close());

const stageFixture = {
  image: {
    alt: "Peppa and Dolly look at colorful flowers in the garden",
    src: "https://media.parrotbook.com/assets/v3/full-scenes/02-garden-colors/01-colorful-flowers.webp",
  },
};
const staticMediaPlan = createStaticMediaPublishPlan(STATIC_MEDIA_ASSETS, {
  bucket: "parrot-english-media",
  mediaOrigin: "https://media.parrotbook.com",
  sourceVersion: 2,
  targetVersion: 3,
});

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

function getFullSceneLessons() {
  assert.ok(
    Array.isArray(FULL_SCENE_LESSONS),
    "Expected FULL_SCENE_LESSONS to be an array",
  );

  return expectedLessonIds.map((lessonId) => {
    const matches = FULL_SCENE_LESSONS.filter(
      (entry) => entry.lessonId === lessonId,
    );
    assert.equal(
      matches.length,
      1,
      `Expected exactly one full-scene artwork set for ${lessonId}`,
    );
    return matches[0];
  });
}

function getDeclaredReadyMadeLessons() {
  assert.ok(
    Array.isArray(FULL_SCENE_LESSONS),
    "Expected FULL_SCENE_LESSONS to be an array",
  );
  return FULL_SCENE_LESSONS.filter(
    (entry) => expectedLessonIds.includes(entry.lessonId),
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
      image: scene.image,
    }),
  );
}

function renderPlayerUi(Component, props) {
  assert.ok(Component, "Expected lesson player UI export");
  return renderToStaticMarkup(createElement(Component, props));
}

test("every ready-made lesson has one five-scene artwork set", async () => {
  const lessons = getFullSceneLessons();
  const allSources = [];

  for (const [index, artwork] of lessons.entries()) {
    const lessonId = expectedLessonIds[index];
    const lessonFile = fileURLToPath(
      new URL(`../content/lessons/${lessonId}.json`, import.meta.url),
    );
    const lesson = JSON.parse(await readFile(lessonFile, "utf8"));

    assert.equal(lesson.scenes.length, 5, `Expected five scenes in ${lessonId}`);
    assert.equal(artwork.scenes.length, lesson.scenes.length);

    for (const scene of artwork.scenes) {
      assert.match(
        scene.src,
        new RegExp(`^https://media.parrotbook.com/assets/v3/full-scenes/${lessonId}/.+\\.webp$`),
      );
      assert.ok(
        scene.alt.trim(),
        `Expected descriptive full-scene alt text for ${lessonId}`,
      );
      allSources.push(scene.src);
    }
  }

  assert.equal(allSources.length, 35);
  assert.equal(
    new Set(allSources).size,
    allSources.length,
    "Expected all 35 full-scene artwork sources to be globally unique",
  );
});

test("static media publishes both responsive widths for every full scene", () => {
  const expectedTargets = new Set();

  for (const scene of getFullSceneLessons().flatMap(({ scenes }) => scenes)) {
    const canonicalPath = new URL(scene.src).pathname.replace("/assets/v3/", "");
    for (const width of [384, 768]) {
      const responsivePath = canonicalPath.replace(/\.webp$/, `-${width}.webp`);
      expectedTargets.add(`assets/v3/${responsivePath}`);
      assert.deepEqual(
        staticMediaPlan.find(({ targetKey }) =>
          targetKey === `assets/v3/${responsivePath}`),
        {
          bucket: "parrot-english-media",
          cacheControl: "public, max-age=31536000, immutable",
          contentType: "image/webp",
          path: responsivePath,
          resizeWidth: width,
          sourceKey: `assets/v2/${canonicalPath}`,
          sourceUrl: `https://media.parrotbook.com/assets/v2/${canonicalPath}`,
          targetKey: `assets/v3/${responsivePath}`,
          targetUrl: `https://media.parrotbook.com/assets/v3/${responsivePath}`,
        },
      );
    }
  }

  assert.deepEqual(
    new Set(staticMediaPlan
      .filter(({ path, resizeWidth }) =>
        resizeWidth && path.startsWith("full-scenes/"),
      )
      .map(({ targetKey }) => targetKey)),
    expectedTargets,
  );
});

test("every ready-made scene declares a scene-aware learning-panel composition", () => {
  const scenes = getFullSceneLessons().flatMap((lesson) => lesson.scenes);
  const layouts = new Set();

  for (const scene of scenes) {
    assert.ok(
      Object.hasOwn(scene, "panelSafeRect"),
      `Expected an explicit panel placement decision for ${scene.src}`,
    );
    assert.ok(
      ["stack", "ribbon"].includes(scene.panelLayout),
      `Expected a stack or ribbon panel layout for ${scene.src}`,
    );

    assert.equal(scene.panelSafeRect.length, 4);
    const [x, y, width, height] = scene.panelSafeRect;
    for (const value of scene.panelSafeRect) {
      assert.equal(Number.isFinite(value), true);
      assert.ok(value >= 0 && value <= 1);
    }
    if (scene.panelLayout === "stack") {
      assert.ok(width >= 0.32);
      assert.ok(height >= 0.36);
    } else {
      assert.ok(width >= 0.7);
      assert.ok(height >= 0.16 && height <= 0.22);
    }
    assert.ok(x + width <= 1);
    assert.ok(y + height <= 1);
    layouts.add(scene.panelLayout);
  }

  assert.deepEqual(layouts, new Set(["stack", "ribbon"]));
});

test("learning controls keep a predictable anchor within each lesson", () => {
  for (const lesson of getFullSceneLessons()) {
    const layouts = new Set(lesson.scenes.map((scene) => scene.panelLayout));
    const xPositions = lesson.scenes.map((scene) => scene.panelSafeRect[0]);
    const yPositions = lesson.scenes.map((scene) => scene.panelSafeRect[1]);

    assert.equal(
      layouts.size,
      1,
      `Expected one panel composition throughout ${lesson.lessonId}`,
    );
    assert.ok(
      Math.max(...xPositions) - Math.min(...xPositions) <= 0.08,
      `Expected limited horizontal panel movement in ${lesson.lessonId}`,
    );
    assert.ok(
      Math.max(...yPositions) - Math.min(...yPositions) <= 0.001,
      `Expected a stable vertical panel anchor in ${lesson.lessonId}`,
    );
  }
});

test("every declared ready-made full-scene source is a clean versioned media URL", () => {
  const lessons = getDeclaredReadyMadeLessons();
  const allSources = lessons.flatMap((lesson) =>
    lesson.scenes.map((scene) => scene.src),
  );

  assert.equal(
    lessons.length,
    expectedLessonIds.length,
    "Expected asset declarations for all seven ready-made lessons",
  );
  assert.equal(allSources.length, 35);
  assert.equal(new Set(allSources).size, allSources.length);

  for (const source of allSources) {
    const url = new URL(source);
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "media.parrotbook.com");
    assert.match(url.pathname, /^\/assets\/v3\/full-scenes\/.+\.webp$/);
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
  }
});

test("boxed lesson artwork renders as one labelled image without experiment chrome", () => {
  const html = renderStage(stageFixture);
  const alt = escapeRegExp(escapeHtmlAttribute(stageFixture.image.alt));
  const src = escapeRegExp(escapeHtmlAttribute(stageFixture.image.src));
  const srcSet = escapeRegExp(escapeHtmlAttribute(
    `${stageFixture.image.src.replace(/\.webp$/, "-384.webp")} 384w, ` +
      `${stageFixture.image.src.replace(/\.webp$/, "-768.webp")} 768w, ` +
      `${stageFixture.image.src} 1672w`,
  ));

  assert.match(html, /aria-label="Lesson artwork"/);
  assert.match(html, /role="region"/);
  assert.match(html, new RegExp(`<img[^>]*alt="${alt}"[^>]*src="${src}"`));
  assert.match(html, new RegExp(`<img[^>]*srcSet="${srcSet}"`));
  assert.match(
    html,
    /<img[^>]*sizes="\(max-width: 559px\) calc\(100vw - 1rem\), \(max-height: 480px\) 60vw, calc\(100vw - 3rem\)"/,
  );
  assert.doesNotMatch(html, /Landscape|Portrait|Wide|Natural size/);
  assert.equal((html.match(/<img\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-character=/);
});

test("the introduction uses the lesson title as its single heading", () => {
  const html = renderPlayerUi(LessonIntroduction, {
    lessonTitle: "Peppa's High Ball",
    onStart() {},
    sceneCount: 5,
  });

  assert.match(html, /<h1[^>]*>Peppa&#x27;s High Ball<\/h1>/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /Watch and say the big words with the group\./);
  assert.doesNotMatch(html, /whenever you like/);
  assert.match(html, /<button[^>]*>[^<]*Let&#x27;s go[^<]*<\/button>/);
  assert.doesNotMatch(
    html,
    /Watch and join in|5 parts|Start lesson|1\. Listen|2\. Talk/,
  );
});

test("the automatic join-in prompt announces cue-only and microphone modes", () => {
  const cueOnly = renderPlayerUi(LessonJoinInPrompt, {
    dialogue: "It is up high!",
    recording: false,
  });
  const recording = renderPlayerUi(LessonJoinInPrompt, {
    dialogue: "It is up high!",
    recording: true,
    reserved: true,
  });

  for (const html of [cueOnly, recording]) {
    assert.match(html, /<h2[^>]*>[\s\S]*Join in<\/h2>/);
    assert.match(html, />It is up high!</);
    assert.doesNotMatch(html, /Checking|Try again|Great job|Tap to talk|Skip/);
  }
  assert.doesNotMatch(cueOnly, /role="status"|Voices are joining in/);
  assert.match(recording, /aria-live="polite"/);
  assert.match(recording, /role="status"/);
  assert.match(recording, /Your microphone is joining in too/);
});

test("completion reports background saving without scoring the child", () => {
  const pending = renderPlayerUi(LessonCompletion, {
    lessonTitle: "Peppa's High Ball",
    onBack() {},
    onReplay() {},
    onRetrySaving() {},
    saveState: "pending",
  });
  const failed = renderPlayerUi(LessonCompletion, {
    lessonTitle: "Peppa's High Ball",
    onBack() {},
    onReplay() {},
    onRetrySaving() {},
    saveState: "failed",
  });

  assert.match(pending, /Saving your voices…/);
  assert.match(failed, /Try saving again/);
  for (const html of [pending, failed]) {
    assert.match(html, /<h1[^>]*>You finished Peppa&#x27;s High Ball!<\/h1>/);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.doesNotMatch(html, /Lesson complete!/);
  }
  assert.doesNotMatch(`${pending}${failed}`, /score|checking|great job/i);
});
