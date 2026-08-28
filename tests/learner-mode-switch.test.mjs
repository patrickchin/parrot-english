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

const { LearnerModeSwitchDialog } = await vite
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

function selectedRadio(container, value) {
  const radio = container.querySelector(`input[type="radio"][value="${value}"]`);
  assert.ok(radio, `Expected a radio for ${value}.`);
  return radio;
}

function RouteProbe() {
  const location = useLocation();
  return createElement(
    "output",
    { "aria-label": "Current route" },
    `${location.pathname}${location.search}${location.hash}`,
  );
}

function DialogHarness({ onBeforeNavigate }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
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
          destination: "/",
          onBeforeNavigate,
          onClose: () => setIsOpen(false),
          returnFocusRef: triggerRef,
        })
      : null,
    createElement(RouteProbe),
  );
}

function harness({ operations }) {
  const Provider = createGuardianAccessProvider({
    api: {
      async loadGuardianAccess() {
        return {
          expiresAt: "2099-01-01T00:00:00.000Z",
          mode: "guardian",
        };
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
        createElement(DialogHarness, {
          onBeforeNavigate: () => operations.push("before-navigate"),
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

test("opening the chooser only loads the roster, with no learner preselected", async () => {
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
  assert.ok(
    document.activeElement === dialog,
    "Expected focus to enter the loading dialog.",
  );
  await waitFor(() => assert.equal(selectedRadio(container, "learner-bob").disabled, false));

  assert.ok(requestCount() >= 1);
  assert.deepEqual(operations, []);
  assert.equal(selectedRadio(container, "learner-bob").checked, false);
  assert.equal(selectedRadio(container, "learner-noah").checked, false);
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

  await waitFor(() => assert.equal(selectedRadio(container, "learner-noah").disabled, false));
  assert.ok(requestCount() >= 2);
  assert.deepEqual(operations, []);
});

test("offers normal learners but omits deletion-pending learners", async () => {
  const operations = [];
  installRosterFetch();
  const container = await mountStrict(harness({ operations }));

  await click(namedButton(container, "Open chooser"));
  await waitFor(() =>
    assert.equal(selectedRadio(container, "learner-bob").disabled, false),
  );

  assert.ok(selectedRadio(container, "learner-noah"));
  const pendingLearnerRadio = container.querySelector(
    'input[type="radio"][value="learner-rose"]',
  );
  const renderedText = container.textContent;
  await click(namedButton(container, "Cancel"));
  assert.ok(
    !pendingLearnerRadio,
    "Expected the chooser to omit the deletion-pending learner radio.",
  );
  assert.doesNotMatch(renderedText, /Rose/);
  assert.deepEqual(operations, []);
});

test("selects a learner before locking and navigating home", async () => {
  const operations = [];
  installRosterFetch();
  const container = await mountStrict(harness({ operations }));

  await click(namedButton(container, "Open chooser"));
  await waitFor(() => assert.equal(selectedRadio(container, "learner-noah").disabled, false));
  await click(selectedRadio(container, "learner-noah"));
  await click(namedButton(container, "Switch to learner mode"));

  await waitFor(() => assert.equal(currentRoute(container), "/"));
  assert.deepEqual(operations, [
    "select:learner-noah",
    "lock",
    "before-navigate",
  ]);
});
