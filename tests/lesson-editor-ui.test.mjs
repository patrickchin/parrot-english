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
const { LessonEditor, TargetedLessonEditor } = editorModule;
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

test.afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
});

function CurrentRoute() {
  const location = useLocation();
  return createElement(
    "output",
    { "aria-label": "Current route" },
    `${location.pathname}${location.search}`,
  );
}

function learnerRoster() {
  return {
    activeProfileId: "learner-mia",
    profiles: [
      {
        age: 8,
        createdAt: "2026-08-01T08:00:00.000Z",
        deletionPending: false,
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        deletionPending: false,
        id: "learner-noah",
        name: "Noah",
        profileStatus: "completed",
      },
    ],
  };
}

function readyTarget() {
  const roster = learnerRoster();
  return {
    activeProfileId: roster.activeProfileId,
    error: "",
    learnerName: "Mia",
    learnerProfileId: "learner-mia",
    phase: "ready",
    profiles: roster.profiles,
    retry() {},
    select() {},
  };
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
          element: createElement(TargetedLessonEditor, {
            learnerProfileId: "learner-mia",
            target: readyTarget(),
          }),
          path: "/lessons/my/:lessonId/edit",
        }),
      ),
    ),
  );

  assert.match(html, /<h1[^>]*>Edit Lesson<\/h1>/);
  assert.match(html, /Editing settings for Mia/);
  assert.match(html, /Noah/);
  assert.match(html, /role="status"/);
  assert.match(html, /Loading lesson/);
  assert.match(
    html,
    /<a[^>]*aria-label="Back to lessons"[^>]*href="\/guardian\/lessons\?learnerProfileId=learner-mia"/,
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
    if (
      path === "/api/lessons/my/garden-help?learnerProfileId=learner-mia" &&
      init.method === "GET"
    ) {
      return Response.json({ lesson: saved });
    }
    if (
      path === "/api/lessons/my/garden-help?learnerProfileId=learner-mia" &&
      init.method === "PUT"
    ) {
      return Response.json({ lesson: saved, warnings: [] });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  await mountStrict(
    createElement(
      MemoryRouter,
      {
        initialEntries: [
          "/lessons/my/garden-help/edit?learnerProfileId=learner-mia",
        ],
      },
      createElement(
        Routes,
        null,
        createElement(Route, {
          element: createElement(TargetedLessonEditor, {
            learnerProfileId: "learner-mia",
            target: readyTarget(),
          }),
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
      "/guardian/lessons?learnerProfileId=learner-mia",
    ),
  );
});

test("loads, saves, and returns with Noah's explicit lesson target", async () => {
  const lesson = createLessonScript({ title: "Noah's garden lesson" });
  const saved = {
    id: "noah-garden",
    lesson,
    revision: "a".repeat(64),
    source: "generated",
  };
  const requests = [];
  globalThis.fetch = async (path, init = {}) => {
    requests.push({ method: init.method ?? "GET", path });
    if (path === "/api/learner-profiles") {
      return Response.json(learnerRoster());
    }
    if (path === "/api/lessons/my/noah-garden?learnerProfileId=learner-noah") {
      return Response.json(
        init.method === "PUT"
          ? { lesson: saved, warnings: [] }
          : { lesson: saved },
      );
    }
    if (path === "/api/lessons/my/noah-garden") {
      return Response.json(
        init.method === "PUT"
          ? { lesson: saved, warnings: [] }
          : { lesson: saved },
      );
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    createElement(
      MemoryRouter,
      {
        initialEntries: [
          "/lessons/my/noah-garden/edit?learnerProfileId=learner-noah",
        ],
      },
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
    assert.match(container.textContent, /Editing settings for Noah/),
  );
  await waitFor(() =>
    assert.ok(
      [...container.querySelectorAll("button")].find(
        (candidate) => candidate.textContent.trim() === "Save changes",
      ),
    ),
  );
  await click(
    [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === "Save changes",
    ),
  );
  await waitFor(() =>
    assert.equal(
      container.querySelector('output[aria-label="Current route"]')
        ?.textContent,
      "/guardian/lessons?learnerProfileId=learner-noah",
    ),
  );
  const featureRequests = requests.filter(({ path }) =>
    path.startsWith("/api/lessons/my"),
  );
  assert.ok(featureRequests.length > 0);
  assert.ok(
    featureRequests.every(({ path }) =>
      path.endsWith("?learnerProfileId=learner-noah"),
    ),
  );
});

test("normalizes a missing edit target before loading the lesson", async () => {
  const lesson = createLessonScript();
  const saved = {
    id: "garden-help",
    lesson,
    revision: "a".repeat(64),
    source: "generated",
  };
  const requests = [];
  globalThis.fetch = async (path, init = {}) => {
    requests.push({ method: init.method ?? "GET", path });
    if (path === "/api/learner-profiles") {
      return Response.json(learnerRoster());
    }
    if (path === "/api/lessons/my/garden-help?learnerProfileId=learner-mia") {
      return Response.json({ lesson: saved });
    }
    if (path === "/api/lessons/my/garden-help") {
      return Response.json({ lesson: saved });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
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
      ),
      createElement(CurrentRoute),
    ),
  );

  await waitFor(() =>
    assert.equal(
      container.querySelector('output[aria-label="Current route"]')
        ?.textContent,
      "/lessons/my/garden-help/edit?learnerProfileId=learner-mia",
    ),
  );
  await waitFor(() => assert.match(container.textContent, /Lesson loaded/));
  const loads = requests.filter(
    ({ method, path }) =>
      method === "GET" && path.startsWith("/api/lessons/my/garden-help"),
  );
  assert.ok(loads.length > 0);
  assert.ok(
    loads.every(
      ({ path }) =>
        path === "/api/lessons/my/garden-help?learnerProfileId=learner-mia",
    ),
  );
});

test("an invalid edit target never loads the active learner's lesson", async () => {
  const requests = [];
  globalThis.fetch = async (path, init = {}) => {
    requests.push({ method: init.method ?? "GET", path });
    if (path === "/api/learner-profiles") {
      return Response.json(learnerRoster());
    }
    if (path === "/api/lessons/my/garden-help") {
      return Response.json({
        lesson: {
          id: "garden-help",
          lesson: createLessonScript(),
          revision: "a".repeat(64),
          source: "generated",
        },
      });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };
  const container = await mountStrict(
    createElement(
      MemoryRouter,
      {
        initialEntries: [
          "/lessons/my/garden-help/edit?learnerProfileId=missing-learner",
        ],
      },
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

  await waitFor(() =>
    assert.match(
      container.textContent,
      /target in this page link could not be found/i,
    ),
  );
  assert.deepEqual(
    requests.filter(({ path }) => path.startsWith("/api/lessons/my")),
    [],
  );
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
      correct: {
        speaker: "dolly",
        dialogue: "Legacy success.",
        after: "continue",
      },
      incorrect: {
        speaker: "dolly",
        dialogue: "Legacy retry.",
        after: "retry",
      },
      incorrectFinal: {
        speaker: "dolly",
        dialogue: "Legacy finish.",
        after: "continue",
      },
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
