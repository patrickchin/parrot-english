import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import test, { after } from "node:test";
import { createServer } from "vite";
import { createLessonScript } from "./fixtures/lesson-script.mjs";
import {
  cleanupMountedRoots,
  click,
  input,
  installDom,
  mountStrict,
} from "./helpers/react-lifecycle.mjs";

const restoreDom = installDom();

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const editorModule = await vite
  .ssrLoadModule("/src/lessons/LessonEditor.tsx")
  .catch(() => ({}));
const { LessonEditor } = editorModule;
const guiEditorModule = await vite
  .ssrLoadModule("/src/lessons/LessonGuiEditor.tsx")
  .catch(() => ({}));
const { LessonGuiEditor } = guiEditorModule;

after(async () => {
  await cleanupMountedRoots();
  await vite.close();
  restoreDom();
});

test("saved lesson edit route starts with an accessible GUI loading state", () => {
  assert.equal(typeof LessonEditor, "function", "Expected LessonEditor");
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/lessons/my/lesson-1/edit"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          element: createElement(LessonEditor),
          path: "/lessons/my/:lessonId/edit",
        }),
      ),
    ),
  );

  assert.match(html, /<h1[^>]*>Edit Lesson<\/h1>/);
  assert.match(html, /role="status"/);
  assert.match(html, /Loading lesson/);
  assert.match(html, /href="\/lessons"/);
  assert.doesNotMatch(
    html,
    /lesson-script-editor|Editable lesson script|Review script/i,
  );
});

test("GUI authors character dialogue and preserves imported learner checks without showing controls", async () => {
  assert.equal(typeof LessonGuiEditor, "function", "Expected LessonGuiEditor");
  const lesson = createLessonScript();
  const userStep = lesson.scenes[0].steps[0] = {
    speaker: "user",
    dialogue: "Can you help me?",
    emotes: {},
    check: {
      maxAttempts: 2,
      correct: { speaker: "dolly", dialogue: "Legacy success.", after: "continue" },
      incorrect: { speaker: "dolly", dialogue: "Legacy retry.", after: "retry" },
      incorrectFinal: { speaker: "dolly", dialogue: "Legacy finish.", after: "continue" },
    },
  };
  const changes = [];
  const container = await mountStrict(
    createElement(LessonGuiEditor, {
      lesson,
      onChange(nextLesson) {
        changes.push(nextLesson);
      },
    }),
  );

  assert.doesNotMatch(container.textContent, /Check the learner's pronunciation|Speaking feedback/);
  await input(container.querySelector('textarea[aria-label="Dialogue"]'), "Can you help us?");
  assert.deepEqual(changes.at(-1).scenes[0].steps[0].check, userStep.check);

  await click([...container.querySelectorAll("button")].find((button) => /Add dialogue/.test(button.textContent)));
  assert.deepEqual(changes.at(-1).scenes[0].steps.at(-1), {
    speaker: "peppa",
    dialogue: "",
    emotes: {},
  });
});
