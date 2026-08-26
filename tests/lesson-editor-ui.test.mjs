import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import test, { after } from "node:test";
import { createServer } from "vite";
import { createLessonScript } from "./fixtures/lesson-script.mjs";
import {
  cleanupMountedRoots,
  click,
  input,
  installDom,
  mountStrict,
  waitFor,
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
const originalFetch = globalThis.fetch;

after(async () => {
  await cleanupMountedRoots();
  globalThis.fetch = originalFetch;
  await vite.close();
  restoreDom();
});

function CurrentRoute() {
  const location = useLocation();
  return createElement(
    "output",
    { "aria-label": "Current route" },
    location.pathname,
  );
}

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
          element: createElement(LessonEditor, { learnerName: "Mia" }),
          path: "/lessons/my/:lessonId/edit",
        }),
      ),
    ),
  );

  assert.match(html, /<h1[^>]*>Edit Lesson<\/h1>/);
  assert.match(html, /Managing <bdi[^>]*>Mia<\/bdi>/);
  assert.match(html, /role="status"/);
  assert.match(html, /Loading lesson/);
  assert.match(
    html,
    /<a[^>]*aria-label="Back to lessons"[^>]*href="\/guardian\/lessons"/,
  );
  assert.doesNotMatch(
    html,
    /lesson-script-editor|Editable lesson script|Review script/i,
  );
});

test("saving edited lessons returns to Guardian lessons", async () => {
  const lesson = createLessonScript();
  const saved = {
    id: "garden-help",
    lesson,
    revision: "a".repeat(64),
    source: "generated",
  };
  globalThis.fetch = async (path, init = {}) => {
    if (path === "/api/lessons/my/garden-help" && init.method === "GET") {
      return Response.json({ lesson: saved });
    }
    if (path === "/api/lessons/my/garden-help" && init.method === "PUT") {
      return Response.json({ lesson: saved, warnings: [] });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/lessons/my/garden-help/edit"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          element: createElement(LessonEditor, { learnerName: "Mia" }),
          path: "/lessons/my/:lessonId/edit",
        }),
        createElement(Route, {
          element: createElement("p", null, "Guardian lessons"),
          path: "/guardian/lessons",
        }),
      ),
      createElement(CurrentRoute),
    ),
  );

  await waitFor(() =>
    assert.ok(
      [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent.trim() === "Save changes",
      ),
    ),
  );
  await click(
    [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === "Save changes",
    ),
  );
  await waitFor(() =>
    assert.equal(
      document.querySelector('output[aria-label="Current route"]').textContent,
      "/guardian/lessons",
    ),
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
