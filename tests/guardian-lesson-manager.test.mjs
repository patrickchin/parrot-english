import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import test from "node:test";
import { createServer } from "vite";
import { createLessonScript } from "./fixtures/lesson-script.mjs";
import {
  cleanupMountedRoots,
  installDom,
  mountStrict,
  waitFor,
} from "./helpers/react-lifecycle.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const restoreDom = installDom();
const originalFetch = globalThis.fetch;
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

const guardianManagerModule = await vite
  .ssrLoadModule("/src/lessons/GuardianLessonManager.tsx")
  .catch(() => ({}));
const { GuardianLessonManager, GuardianLessonManagerView } =
  guardianManagerModule;
const { createGuardianAccessProvider } = await vite.ssrLoadModule(
  "/src/auth/GuardianAccess.tsx",
);

const savedLesson = {
  id: "lesson/id",
  lesson: createLessonScript({ title: "Made for Mia" }),
  revision: "a".repeat(64),
  source: "uploaded",
};

test.afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
  window.history.replaceState(null, "", "/");
});

test.after(async () => {
  await vite.close();
  restoreDom();
});

function renderInRouter(element) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/lessons"] },
      element,
    ),
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

function readyTarget(learnerProfileId = "learner-mia", learnerName = "Mia") {
  const roster = learnerRoster();
  return {
    activeProfileId: roster.activeProfileId,
    error: "",
    learnerName,
    learnerProfileId,
    phase: "ready",
    profiles: roster.profiles,
    retry() {},
    select() {},
  };
}

test("guardian lesson manager owns custom-lesson authoring actions", () => {
  assert.equal(
    typeof GuardianLessonManagerView,
    "function",
    "Expected a rendered guardian lesson manager view",
  );
  const html = renderInRouter(
    createElement(GuardianLessonManagerView, {
      lessons: [savedLesson],
      myLessonsLoadPhase: "ready",
      onRetryMyLessons() {},
      target: readyTarget(),
    }),
  );

  assert.match(html, /Editing settings for Mia/);
  assert.match(html, /<h1[^>]*>My Lessons<\/h1>/);
  assert.match(html, /aria-label="Create custom lesson"/);
  assert.match(
    html,
    /href="\/lessons\/my\/create\?learnerProfileId=learner-mia"/,
  );
  assert.match(html, /aria-label="Edit lesson: Made for Mia"/);
  assert.match(
    html,
    /href="\/lessons\/my\/lesson%2Fid\/edit\?learnerProfileId=learner-mia"/,
  );
  assert.match(html, /Manage learners/);
  assert.doesNotMatch(html, /Switch and play/);
  assert.doesNotMatch(html, /Peppa&#x27;s High Ball/);
});

test("lists only the URL-targeted learner's lessons without an active-scoped feature request", async () => {
  const requests = [];
  const noahLesson = {
    ...savedLesson,
    id: "noah-lesson",
    lesson: createLessonScript({ title: "Made for Noah" }),
  };
  globalThis.fetch = async (path, init = {}) => {
    requests.push({ method: init.method ?? "GET", path });
    if (path === "/api/learner-profiles") {
      return Response.json(learnerRoster());
    }
    if (path === "/api/lessons/my?learnerProfileId=learner-noah") {
      return Response.json({ lessons: [noahLesson] });
    }
    if (path === "/api/lessons/my") {
      return Response.json({ lessons: [savedLesson] });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };
  const Provider = createGuardianAccessProvider({
    api: {
      async loadGuardianAccess() {
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    },
    schedule: () => () => {},
  });

  const container = await mountStrict(
    createElement(
      Provider,
      { sessionIdentity: "user-1" },
      createElement(
        MemoryRouter,
        {
          initialEntries: ["/guardian/lessons?learnerProfileId=learner-noah"],
        },
        createElement(GuardianLessonManager, { learnerName: "Mia" }),
      ),
    ),
  );

  await waitFor(() => assert.match(container.textContent, /Made for Noah/));
  assert.match(container.textContent, /Editing settings for Noah/);
  assert.doesNotMatch(container.textContent, /Made for Mia/);
  const lessonRequests = requests.filter(({ path }) =>
    path.startsWith("/api/lessons/my"),
  );
  assert.ok(lessonRequests.length > 0);
  assert.ok(
    lessonRequests.every(
      ({ method, path }) =>
        method === "GET" &&
        path === "/api/lessons/my?learnerProfileId=learner-noah",
    ),
  );
});

test("an invalid lesson target never loads active-scoped lesson data", async () => {
  const requests = [];
  globalThis.fetch = async (path, init = {}) => {
    requests.push({ method: init.method ?? "GET", path });
    if (path === "/api/learner-profiles") {
      return Response.json(learnerRoster());
    }
    if (path === "/api/lessons/my") {
      return Response.json({ lessons: [savedLesson] });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };
  const Provider = createGuardianAccessProvider({
    api: {
      async loadGuardianAccess() {
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
      async lockGuardianAccess() {
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    },
    schedule: () => () => {},
  });

  const container = await mountStrict(
    createElement(
      Provider,
      { sessionIdentity: "user-1" },
      createElement(
        MemoryRouter,
        {
          initialEntries: [
            "/guardian/lessons?learnerProfileId=missing-learner",
          ],
        },
        createElement(GuardianLessonManager, { learnerName: "Mia" }),
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
