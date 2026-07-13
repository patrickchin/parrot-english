import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import test, { after } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const editorModule = await vite
  .ssrLoadModule("/src/LessonEditor.tsx")
  .catch(() => ({}));
const { LessonEditor } = editorModule;

after(async () => vite.close());

test("saved lesson edit route starts with an accessible loading state", () => {
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

  assert.match(html, /<h1>Edit Lesson<\/h1>/);
  assert.match(html, /role="status"/);
  assert.match(html, /Loading lesson script/);
  assert.match(html, /href="\/lessons"/);
});
