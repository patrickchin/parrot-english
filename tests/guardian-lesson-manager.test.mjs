import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useLocation } from "react-router";
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

function LocationProbe() {
  const location = useLocation();
  return createElement(
    "output",
    { "aria-label": "Current route" },
    location.pathname,
  );
}

function currentRoute(container) {
  return container.querySelector('output[aria-label="Current route"]')
    ?.textContent;
}

function button(container, name) {
  const match = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.getAttribute("aria-label") === name,
  );
  assert.ok(match, `Expected button named "${name}".`);
  return match;
}

test("guardian lesson manager owns custom-lesson authoring actions", () => {
  assert.equal(
    typeof GuardianLessonManagerView,
    "function",
    "Expected a rendered guardian lesson manager view",
  );
  const html = renderInRouter(
    createElement(GuardianLessonManagerView, {
      error: "",
      isSwitchingLessonId: null,
      learnerName: "Mia",
      lessons: [savedLesson],
      myLessonsLoadPhase: "ready",
      onRetryMyLessons() {},
      onSwitchAndPlay() {},
    }),
  );

  assert.match(html, /Managing <bdi[^>]*>Mia<\/bdi>/);
  assert.match(html, /<h1[^>]*>My Lessons<\/h1>/);
  assert.match(html, /aria-label="Create custom lesson"/);
  assert.match(html, /href="\/lessons\/my\/create"/);
  assert.match(html, /aria-label="Edit lesson: Made for Mia"/);
  assert.match(html, /href="\/lessons\/my\/lesson%2Fid\/edit"/);
  assert.match(html, /aria-label="Switch and play: Made for Mia"/);
  assert.doesNotMatch(html, /Peppa&#x27;s High Ball/);
});

test("switch and play stays on the guardian page until locking succeeds", async () => {
  assert.equal(
    typeof GuardianLessonManager,
    "function",
    "Expected an interactive guardian lesson manager",
  );
  const pendingLock = deferred();
  let lockCalls = 0;
  const Provider = createGuardianAccessProvider({
    api: {
      async loadGuardianAccess() {
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
      async lockGuardianAccess() {
        lockCalls += 1;
        if (lockCalls === 1) throw new Error("Lock failed.");
        return pendingLock.promise;
      },
      async unlockGuardianAccess() {
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    },
    schedule: () => () => {},
  });
  globalThis.fetch = async () => Response.json({ lessons: [savedLesson] });

  const container = await mountStrict(
    createElement(
      Provider,
      { sessionIdentity: "user-1" },
      createElement(
        MemoryRouter,
        { initialEntries: ["/guardian/lessons"] },
        createElement(GuardianLessonManager, { learnerName: "Mia" }),
        createElement(LocationProbe),
      ),
    ),
  );

  await waitFor(() =>
    assert.ok(button(container, "Switch and play: Made for Mia")),
  );
  await click(button(container, "Switch and play: Made for Mia"));
  assert.equal(currentRoute(container), "/guardian/lessons");
  assert.match(
    container.querySelector('[role="alert"]')?.textContent ?? "",
    /Could not lock guardian mode/,
  );

  await act(async () => {
    button(container, "Switch and play: Made for Mia").click();
    await Promise.resolve();
  });
  assert.equal(currentRoute(container), "/guardian/lessons");

  pendingLock.resolve({ mode: "learner" });
  await waitFor(() =>
    assert.equal(currentRoute(container), "/lessons/my/lesson%2Fid/scenes/1"),
  );
});
