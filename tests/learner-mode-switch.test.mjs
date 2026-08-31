import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement, useRef, useState } from "react";
import { MemoryRouter, useLocation } from "react-router";
import test from "node:test";
import { createServer } from "vite";
import {
  cleanupMountedRoots,
  click,
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

const { LearnerModeSelectionPage, LearnerModeSwitchDialog } = await vite
  .ssrLoadModule("/src/app/LearnerModeSwitchDialog.tsx")
  .catch(() => ({}));
const { createGuardianAccessProvider } = await vite.ssrLoadModule(
  "/src/auth/GuardianAccess.tsx",
);
const { LearnerSelectionProvider } = await vite.ssrLoadModule(
  "/src/learner-profile/LearnerProfileContext.tsx",
);

const profiles = [
  {
    age: 6,
    createdAt: "2026-08-29T08:00:00.000Z",
    deletionPending: false,
    id: "learner-bob",
    name: "Bob",
    profileStatus: "completed",
  },
  {
    age: 7,
    createdAt: "2026-08-29T08:01:00.000Z",
    deletionPending: false,
    id: "learner-noah",
    name: "Mary",
    profileStatus: "completed",
  },
  {
    age: 8,
    createdAt: "2026-08-29T08:02:00.000Z",
    deletionPending: true,
    id: "learner-rose",
    name: "Rose",
    profileStatus: "completed",
  },
];

test.afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
  window.localStorage.clear();
});

test.after(async () => {
  await vite.close();
  restoreDom();
});

function currentRoute(container) {
  return container.querySelector('output[aria-label="Current route"]')
    ?.textContent;
}

function namedButton(container, name) {
  const candidate = [...container.querySelectorAll("button")].find(
    (button) =>
      button.getAttribute("aria-label") === name ||
      button.textContent.trim() === name,
  );
  assert.ok(candidate, `Expected a button named ${name}.`);
  return candidate;
}

function namedLink(container, name) {
  const candidate = [...container.querySelectorAll("a")].find(
    (link) =>
      link.getAttribute("aria-label") === name ||
      link.textContent.trim() === name,
  );
  assert.ok(candidate, `Expected a link named ${name}.`);
  return candidate;
}

function RouteProbe() {
  const location = useLocation();
  return createElement(
    "output",
    { "aria-label": "Current route" },
    `${location.pathname}${location.search}${location.hash}`,
  );
}

function PickerHarness({ destination, onBeforeNavigate, presentation }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  if (presentation === "page") {
    return createElement(
      "main",
      null,
      createElement(LearnerModeSelectionPage, {
        destination,
        onBeforeNavigate,
      }),
      createElement(RouteProbe),
    );
  }
  return createElement(
    "main",
    null,
    createElement(
      "button",
      { onClick: () => setIsOpen(true), ref: triggerRef, type: "button" },
      "Open chooser",
    ),
    isOpen
      ? createElement(LearnerModeSwitchDialog, {
          destination,
          onBeforeNavigate,
          onClose: () => setIsOpen(false),
          returnFocusRef: triggerRef,
        })
      : null,
    createElement(RouteProbe),
  );
}

function harness({ destination = "/", mode = "guardian", operations, presentation = "dialog" }) {
  const Provider = createGuardianAccessProvider({
    api: {
      async loadGuardianAccess() {
        return mode === "guardian"
          ? {
              expiresAt: "2099-01-01T00:00:00.000Z",
              mode: "guardian",
            }
          : { mode: "learner" };
      },
      async lockGuardianAccess() {
        operations.push("lock");
        return { mode: "learner" };
      },
      async unlockGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
      },
    },
    schedule: () => () => {},
  });

  return createElement(
    Provider,
    { sessionIdentity: "user-1" },
    createElement(
      LearnerSelectionProvider,
      {
        activeProfileId: "learner-bob",
        async createAndSelectLearner() {
          throw new Error("Not used by the mode chooser.");
        },
        async reloadSelectedLearner() {
          throw new Error("Not used by the mode chooser.");
        },
        async selectLearner(profileId) {
          operations.push(`select:${profileId}`);
          return { activeProfileId: profileId, profiles };
        },
      },
      createElement(
        MemoryRouter,
        { initialEntries: ["/guardian"] },
        createElement(PickerHarness, {
          destination,
          onBeforeNavigate: () => operations.push("before-navigate"),
          presentation,
        }),
      ),
    ),
  );
}

function installRosterFetch({ failRequests = 0 } = {}) {
  let requests = 0;
  globalThis.fetch = async (path, init = {}) => {
    assert.equal(path, "/api/learner-profiles");
    assert.equal(init.method, "GET");
    requests += 1;
    if (requests <= failRequests) {
      return Response.json(
        { message: "Learner profiles could not be loaded." },
        { status: 503 },
      );
    }
    return Response.json({ activeProfileId: "learner-bob", profiles });
  };
  return () => requests;
}

test("opening the chooser offers direct learner buttons without switching", async () => {
  assert.equal(
    typeof LearnerModeSwitchDialog,
    "function",
    "Expected the shared learner-mode chooser dialog",
  );
  const operations = [];
  const requestCount = installRosterFetch();
  const container = await mountStrict(harness({ operations }));

  await click(namedButton(container, "Open chooser"));
  const dialog = container.querySelector('[role="dialog"]');
  assert.ok(dialog, "Expected the learner-mode chooser dialog.");
  assert.equal(
    dialog.getAttribute("aria-labelledby"),
    "learner-mode-switch-title",
  );
  assert.equal(
    dialog.querySelector("#learner-mode-switch-title")?.textContent,
    "Who is learning now?",
  );
  assert.ok(
    document.activeElement === dialog,
    "Expected focus to enter the loading dialog.",
  );
  await waitFor(() => namedButton(container, "Start learner mode as Bob"));

  assert.ok(requestCount() >= 1);
  assert.deepEqual(operations, []);
  assert.ok(namedButton(container, "Start learner mode as Mary"));
  assert.equal(container.querySelector('input[type="radio"]'), null);
  assert.equal(
    [...container.querySelectorAll("button")].some(
      (candidate) => candidate.textContent.trim() === "Choose a learner",
    ),
    false,
  );
  await click(namedButton(container, "Cancel"));
  assert.equal(container.querySelector('[role="dialog"]'), null);
  assert.deepEqual(operations, []);
});

test("retries a failed protected roster load", async () => {
  const operations = [];
  const requestCount = installRosterFetch({ failRequests: 2 });
  const container = await mountStrict(harness({ operations }));

  await click(namedButton(container, "Open chooser"));
  await waitFor(() => assert.match(container.textContent, /Learner profiles could not be loaded/));
  await click(namedButton(container, "Try again"));

  await waitFor(() => namedButton(container, "Start learner mode as Mary"));
  assert.ok(requestCount() >= 2);
  assert.deepEqual(operations, []);
});

test("offers normal learners but omits deletion-pending learners", async () => {
  const operations = [];
  installRosterFetch();
  const container = await mountStrict(harness({ operations }));

  await click(namedButton(container, "Open chooser"));
  await waitFor(() => namedButton(container, "Start learner mode as Bob"));

  assert.ok(namedButton(container, "Start learner mode as Mary"));
  const pendingLearnerButton = [...container.querySelectorAll("button")].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === "Start learner mode as Rose",
  );
  const renderedText = container.textContent;
  await click(namedButton(container, "Cancel"));
  assert.ok(
    !pendingLearnerButton,
    "Expected the chooser to omit the deletion-pending learner button.",
  );
  assert.doesNotMatch(renderedText, /Rose/);
  assert.deepEqual(operations, []);
});

test("a learner button selects, locks, and navigates in one click", async () => {
  const operations = [];
  installRosterFetch();
  const container = await mountStrict(harness({ operations }));

  await click(namedButton(container, "Open chooser"));
  await waitFor(() => namedButton(container, "Start learner mode as Mary"));
  await click(namedButton(container, "Start learner mode as Mary"));

  await waitFor(() => assert.equal(currentRoute(container), "/"));
  assert.deepEqual(operations, [
    "select:learner-noah",
    "lock",
    "before-navigate",
  ]);
});

test("the required page selects and resumes a learner deep link without locking learner mode", async () => {
  assert.equal(
    typeof LearnerModeSelectionPage,
    "function",
    "Expected the required learner-selection page",
  );
  const operations = [];
  installRosterFetch();
  const container = await mountStrict(
    harness({
      destination: "/lessons?from=picker#resume",
      mode: "learner",
      operations,
      presentation: "page",
    }),
  );

  await waitFor(() => namedButton(container, "Start learner mode as Mary"));
  assert.equal(container.querySelectorAll("h1").length, 1);
  const heading = container.querySelector("h1");
  assert.equal(heading?.getAttribute("tabindex"), "-1");
  await waitFor(() => assert.strictEqual(document.activeElement, heading));
  const pageNavigation = container.querySelector(
    'nav[aria-label="Page navigation"]',
  );
  assert.ok(pageNavigation, "Expected the shared page navigation landmark.");
  assert.equal(
    namedLink(pageNavigation, "Manage learners").getAttribute("href"),
    "/guardian/learners",
  );
  assert.match(container.textContent, /Who is learning now\?/);
  assert.equal(container.querySelector('[role="dialog"]'), null);
  assert.doesNotMatch(container.textContent, /Ask a grown-up|Cancel/);

  await click(namedButton(container, "Start learner mode as Mary"));

  await waitFor(() =>
    assert.equal(currentRoute(container), "/lessons?from=picker#resume"),
  );
  assert.deepEqual(operations, [
    "select:learner-noah",
    "before-navigate",
  ]);
});

test("empty chooser routes the Guardian to Manage learners", async () => {
  const operations = [];
  globalThis.fetch = async (path, init = {}) => {
    assert.equal(path, "/api/learner-profiles");
    assert.equal(init.method, "GET");
    return Response.json({ activeProfileId: null, profiles: [] });
  };
  const container = await mountStrict(harness({ operations }));

  await click(namedButton(container, "Open chooser"));
  await waitFor(() => namedLink(container, "Manage learners"));

  assert.equal(namedLink(container, "Manage learners").getAttribute("href"), "/guardian/learners");
  assert.equal(container.querySelector('input[type="radio"]'), null);
  assert.deepEqual(operations, []);
});
