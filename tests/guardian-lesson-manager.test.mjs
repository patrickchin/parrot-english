import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import test from "node:test";
import { createServer } from "vite";
import { createLessonScript } from "./fixtures/lesson-script.mjs";
import {
  cleanupMountedRoots,
  click,
  deferred,
  installDom,
  mountStrict,
  waitFor,
} from "./helpers/react-lifecycle.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const restoreDom = installDom();
const originalFetch = globalThis.fetch;
const originalConfirm = window.confirm;
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
  window.confirm = originalConfirm;
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
  assert.match(html, /aria-label="Delete lesson: Made for Mia"/);
  assert.match(html, /Delete/);
  assert.doesNotMatch(html, /Edit lesson|\/edit/);
  assert.match(html, /aria-label="Back to guardian dashboard"/);
  assert.match(html, /href="\/guardian"/);
  assert.doesNotMatch(html, /Manage learners/);
  assert.doesNotMatch(html, /Switch and play/);
  assert.doesNotMatch(html, /Peppa&#x27;s High Ball/);
});

test("deletes a confirmed lesson for the URL-targeted learner immediately", async () => {
  const requests = [];
  let resolveDelete;
  const deleteResponse = new Promise((resolve) => {
    resolveDelete = resolve;
  });
  let confirmed = false;
  window.confirm = (message) => {
    assert.match(message, /Made for Mia/);
    assert.match(message, /cannot be undone/i);
    return confirmed;
  };
  globalThis.fetch = async (path, init = {}) => {
    requests.push({ method: init.method ?? "GET", path });
    if (path === "/api/learner-profiles") return Response.json(learnerRoster());
    if (path === "/api/lessons/my?learnerProfileId=learner-noah") {
      return Response.json({ lessons: [savedLesson] });
    }
    if (
      path === "/api/lessons/my/lesson%2Fid?learnerProfileId=learner-noah" &&
      init.method === "DELETE"
    ) {
      return deleteResponse;
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
        { initialEntries: ["/guardian/lessons?learnerProfileId=learner-noah"] },
        createElement(GuardianLessonManager),
      ),
    ),
  );

  await waitFor(() => assert.match(container.textContent, /Made for Mia/));
  const remove = [...container.querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-label") === "Delete lesson: Made for Mia",
  );
  await click(remove);
  assert.equal(requests.some(({ method }) => method === "DELETE"), false);
  assert.match(container.textContent, /Made for Mia/);
  confirmed = true;
  await click(remove);
  await waitFor(() => {
    assert.equal(remove.disabled, true);
    assert.match(remove.textContent, /Deleting…/);
  });
  resolveDelete(new Response(null, { status: 204 }));
  await waitFor(() => assert.doesNotMatch(container.textContent, /Made for Mia/));
  assert.match(container.textContent, /No custom lessons yet/);
  assert.deepEqual(
    requests.filter(({ method }) => method === "DELETE"),
    [
      {
        method: "DELETE",
        path: "/api/lessons/my/lesson%2Fid?learnerProfileId=learner-noah",
      },
    ],
  );
});

test("keeps a lesson and allows another delete attempt after a failed request", async () => {
  let deleteAttempts = 0;
  window.confirm = () => true;
  globalThis.fetch = async (path, init = {}) => {
    if (path === "/api/learner-profiles") return Response.json(learnerRoster());
    if (path === "/api/lessons/my?learnerProfileId=learner-noah") {
      return Response.json({ lessons: [savedLesson] });
    }
    if (
      path === "/api/lessons/my/lesson%2Fid?learnerProfileId=learner-noah" &&
      init.method === "DELETE"
    ) {
      deleteAttempts += 1;
      return Response.json({ error: "request_failed" }, { status: 500 });
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
        { initialEntries: ["/guardian/lessons?learnerProfileId=learner-noah"] },
        createElement(GuardianLessonManager),
      ),
    ),
  );

  await waitFor(() => assert.match(container.textContent, /Made for Mia/));
  const remove = () =>
    [...container.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === "Delete lesson: Made for Mia",
    );
  await click(remove());
  await waitFor(() => assert.equal(container.querySelector('[role="alert"]')?.textContent, "We couldn't delete Made for Mia. Please try again."));
  assert.match(container.textContent, /Made for Mia/);
  assert.equal(remove().disabled, false);
  await click(remove());
  await waitFor(() => assert.equal(deleteAttempts, 2));
});

test("allows a second lesson deletion while the first request is pending", async () => {
  const secondLesson = {
    ...savedLesson,
    id: "lesson-two",
    lesson: createLessonScript({ title: "Made for Noah" }),
  };
  const pendingDeletes = new Map();
  window.confirm = () => true;
  globalThis.fetch = async (path, init = {}) => {
    if (path === "/api/learner-profiles") return Response.json(learnerRoster());
    if (path === "/api/lessons/my?learnerProfileId=learner-noah") {
      return Response.json({ lessons: [savedLesson, secondLesson] });
    }
    if (init.method === "DELETE") {
      return new Promise((resolve) => pendingDeletes.set(path, resolve));
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
        { initialEntries: ["/guardian/lessons?learnerProfileId=learner-noah"] },
        createElement(GuardianLessonManager),
      ),
    ),
  );

  await waitFor(() => assert.match(container.textContent, /Made for Noah/));
  const button = (title) =>
    [...container.querySelectorAll("button")].find(
      (candidate) => candidate.getAttribute("aria-label") === `Delete lesson: ${title}`,
    );
  const miaDelete = button("Made for Mia");
  const noahDelete = button("Made for Noah");
  await click(miaDelete);
  await waitFor(() => {
    assert.equal(miaDelete.disabled, true);
    assert.match(miaDelete.textContent, /Deleting…/);
    assert.equal(noahDelete.disabled, false);
  });
  await click(noahDelete);
  await waitFor(() => {
    assert.equal(noahDelete.disabled, true);
    assert.match(noahDelete.textContent, /Deleting…/);
    assert.equal(pendingDeletes.size, 2);
  });
  for (const resolve of pendingDeletes.values()) {
    resolve(new Response(null, { status: 204 }));
  }
  await waitFor(() => assert.match(container.textContent, /No custom lessons yet/));
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

test("defaults settings requests to a live learner instead of the active pending learner", async () => {
  const requests = [];
  globalThis.fetch = async (path, init = {}) => {
    requests.push({ method: init.method ?? "GET", path });
    if (path === "/api/learner-profiles") {
      return Response.json({
        activeProfileId: "learner-sam",
        profiles: [
          {
            age: 8,
            createdAt: "2026-08-01T08:00:00.000Z",
            deletionPending: true,
            id: "learner-sam",
            name: "Sam",
            profileStatus: "completed",
          },
          {
            age: 10,
            createdAt: "2026-08-02T08:00:00.000Z",
            deletionPending: false,
            id: "learner-bob",
            name: "Bob",
            profileStatus: "completed",
          },
        ],
      });
    }
    if (path === "/api/lessons/my?learnerProfileId=learner-bob") {
      return Response.json({ lessons: [] });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/lessons"] },
      createElement(GuardianLessonManager),
    ),
  );

  await waitFor(() =>
    assert.match(container.textContent, /Editing settings for Bob/),
  );
  const lessonRequests = requests.filter(({ path }) =>
    path.startsWith("/api/lessons/my"),
  );
  assert.ok(lessonRequests.length > 0);
  assert.ok(
    lessonRequests.every(
      ({ method, path }) =>
        method === "GET" &&
        path === "/api/lessons/my?learnerProfileId=learner-bob",
    ),
  );
  assert.equal(
    [...container.querySelectorAll("button")].some(
      (candidate) => candidate.getAttribute("aria-label") === "Sam",
    ),
    false,
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

test("keeps the My Lessons shell and learner selector mounted while a new target loads", async () => {
  const noahLessons = deferred();
  globalThis.fetch = async (path) => {
    if (path === "/api/learner-profiles") {
      return Response.json(learnerRoster());
    }
    if (path === "/api/lessons/my?learnerProfileId=learner-mia") {
      return Response.json({ lessons: [savedLesson] });
    }
    if (path === "/api/lessons/my?learnerProfileId=learner-noah") {
      return noahLessons.promise;
    }
    throw new Error(`Unexpected request: ${path}`);
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
        { initialEntries: ["/guardian/lessons?learnerProfileId=learner-mia"] },
        createElement(GuardianLessonManager),
      ),
    ),
  );

  await waitFor(() => assert.match(container.textContent, /Made for Mia/));
  const main = container.querySelector("main");
  const noahButton = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === "Noah",
  );
  assert.ok(main);
  assert.ok(noahButton);
  noahButton.focus();
  act(() => noahButton.click());

  try {
    assert.ok(
      container.querySelector("main") === main,
      "Expected the route main landmark to remain mounted.",
    );
    assert.equal(noahButton.isConnected, true);
    assert.ok(
      document.activeElement === noahButton,
      "Expected focus to remain on the selected learner.",
    );
    assert.match(
      [...container.querySelectorAll('[role="status"]')].find((status) =>
        /Loading My Lessons…/.test(status.textContent ?? ""),
      )?.textContent ?? "",
      /Loading My Lessons…/,
    );
    assert.equal(
      [...container.querySelectorAll('[role="status"]')]
        .find((status) => /Loading My Lessons…/.test(status.textContent ?? ""))
        ?.closest('[aria-busy="true"]') !== null,
      true,
    );
    assert.match(container.textContent, /Editing settings for Noah/);
    assert.doesNotMatch(container.textContent, /Made for Mia/);
  } finally {
    noahLessons.resolve(Response.json({ lessons: [] }));
  }
});
