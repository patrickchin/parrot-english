import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test, { after } from "node:test";
import { createServer } from "vite";
import { createLessonScript } from "./fixtures/lesson-script.mjs";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const previewModule = await vite
  .ssrLoadModule("/src/lessons/LessonScenePreview.tsx")
  .catch(() => ({}));
const { LessonScenePreview } = previewModule;

after(async () => vite.close());

function renderPreview(selectedStepIndex) {
  assert.equal(
    typeof LessonScenePreview,
    "function",
    "Expected LessonScenePreview",
  );
  return renderToStaticMarkup(
    createElement(LessonScenePreview, {
      onSelectStep() {},
      scene: createLessonScript().scenes[0],
      selectedStepIndex,
    }),
  );
}

function findButton(html, accessibleName) {
  const escapedName = accessibleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(
    new RegExp(`<button[^>]*aria-label="${escapedName}"[^>]*>`),
  )?.[0];
}

test("scene preview exposes its visual stage and dialogue timeline accessibly", () => {
  const html = renderPreview(0);

  assert.match(html, /aria-label="Scene preview: Scene 1"/);
  assert.match(
    html,
    /<img[^>]*alt="A sunny garden with flowers and a tall tree"/,
  );
  assert.match(html, /<img[^>]*alt="Peppa listening"/);
  assert.match(html, /<img[^>]*alt="Dolly talking"/);
  assert.match(html, /aria-label="Dolly dialogue preview"/);
  assert.match(html, /aria-label="Dialogue timeline"/);
  const firstLine = findButton(html, "Preview dialogue 1: Dolly");
  const learnerLine = findButton(html, "Preview dialogue 2: Learner");
  assert.ok(firstLine);
  assert.ok(learnerLine);
  assert.match(firstLine, /aria-pressed="true"/);
  assert.match(learnerLine, /aria-pressed="false"/);
});

test("selecting a learner line updates the preview bubble and timeline state", () => {
  const html = renderPreview(1);

  assert.match(html, /aria-label="Learner dialogue preview"/);
  const firstLine = findButton(html, "Preview dialogue 1: Dolly");
  const learnerLine = findButton(html, "Preview dialogue 2: Learner");
  assert.ok(firstLine);
  assert.ok(learnerLine);
  assert.match(firstLine, /aria-pressed="false"/);
  assert.match(learnerLine, /aria-pressed="true"/);
});
