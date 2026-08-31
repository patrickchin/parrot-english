import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import test from "node:test";
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
const { LessonGuiEditor } = await vite
  .ssrLoadModule("/src/lessons/LessonGuiEditor.tsx")
  .catch(() => ({}));

test.afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
});

test.after(async () => {
  await vite.close();
  restoreDom();
});

test("GUI authors character dialogue and preserves imported learner checks without showing controls", async () => {
  assert.equal(typeof LessonGuiEditor, "function", "Expected LessonGuiEditor");
  const lesson = createLessonScript();
  const userStep = (lesson.scenes[0].steps[0] = {
    speaker: "user",
    dialogue: "Can you help me?",
    emotes: {},
    check: {
      maxAttempts: 2,
      correct: { speaker: "dolly", dialogue: "Legacy success.", after: "continue" },
      incorrect: { speaker: "dolly", dialogue: "Legacy retry.", after: "retry" },
      incorrectFinal: { speaker: "dolly", dialogue: "Legacy finish.", after: "continue" },
    },
  });
  const changes = [];
  const container = await mountStrict(
    createElement(LessonGuiEditor, {
      lesson,
      onChange(nextLesson) {
        changes.push(nextLesson);
      },
    }),
  );

  assert.doesNotMatch(container.textContent, /Visual lesson studio|Storyboard/);
  assert.equal(
    container.querySelector('[aria-label="Lesson studio overview"] h2')
      ?.textContent,
    lesson.title,
  );
  assert.equal(
    container.querySelector('#lesson-scenes-title')?.textContent,
    "Scenes",
  );
  assert.doesNotMatch(
    container.textContent,
    /Check the learner's pronunciation|Speaking feedback/,
  );
  await input(
    container.querySelector('textarea[aria-label="Dialogue"]'),
    "Can you help us?",
  );
  assert.deepEqual(changes.at(-1).scenes[0].steps[0].check, userStep.check);

  await click(
    [...container.querySelectorAll("button")].find((button) =>
      /Add dialogue/.test(button.textContent),
    ),
  );
  assert.deepEqual(changes.at(-1).scenes[0].steps.at(-1), {
    speaker: "peppa",
    dialogue: "",
    emotes: {},
  });
});
