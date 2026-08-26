import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import {
  MemoryRouter,
  useLocation,
  useNavigationType,
} from "react-router";
import test from "node:test";
import { createServer } from "vite";
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
const targetModule = await vite
  .ssrLoadModule("/src/learner-profile/GuardianLearnerTarget.tsx")
  .catch(() => ({}));
const { GuardianLearnerTarget, useGuardianLearnerTarget } = targetModule;

const mia = {
  age: 6,
  createdAt: "2026-08-25T08:00:00.000Z",
  id: "learner-mia",
  name: "Mia",
  profileStatus: "completed",
};
const noah = {
  age: null,
  createdAt: "2026-08-26T08:00:00.000Z",
  id: "learner-noah",
  name: "Noah the Space Explorer",
  profileStatus: "not_started",
};

test.afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
});

test.after(async () => {
  await vite.close();
  restoreDom();
});

function json(value, init) {
  return Response.json(value, init);
}

function roster(activeProfileId = mia.id, profiles = [mia, noah]) {
  return { activeProfileId, profiles };
}

function installRosterFetch(response = roster()) {
  globalThis.fetch = async (path, init = {}) => {
    assert.equal(path, "/api/learner-profiles");
    assert.equal(init.method, "GET");
    return typeof response === "function" ? response() : json(response);
  };
}

function RouterProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return createElement(
    "output",
    { "aria-label": "Router state" },
    `${navigationType} ${location.search}${location.hash}`,
  );
}

function TargetHarness() {
  assert.equal(
    typeof useGuardianLearnerTarget,
    "function",
    "Expected the shared Guardian learner target hook",
  );
  assert.equal(
    typeof GuardianLearnerTarget,
    "function",
    "Expected the shared visible Guardian learner target",
  );
  const state = useGuardianLearnerTarget();
  return createElement(
    "main",
    null,
    createElement(GuardianLearnerTarget, { state }),
    createElement(
      "output",
      { "aria-label": "Resolved target" },
      state.learnerProfileId ?? "unresolved",
    ),
    createElement(RouterProbe),
  );
}

function harness(initialEntry = "/guardian/stories") {
  return createElement(
    MemoryRouter,
    { initialEntries: [initialEntry] },
    createElement(TargetHarness),
  );
}

function namedButton(container, name) {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === name ||
      candidate.textContent.trim() === name,
  );
  assert.ok(button, `Expected a button named "${name}".`);
  return button;
}

function routerState(container) {
  return container.querySelector('output[aria-label="Router state"]')
    ?.textContent;
}

function resolvedTarget(container) {
  return container.querySelector('output[aria-label="Resolved target"]')
    ?.textContent;
}

test("shows a loading state before the roster resolves", async () => {
  const load = deferred();
  globalThis.fetch = () => load.promise;

  const container = await mountStrict(harness());

  assert.match(container.textContent, /Loading learner settings/);
  assert.equal(resolvedTarget(container), "unresolved");
});

test("offers a retry after roster loading fails", async () => {
  let failing = true;
  installRosterFetch(() =>
    failing
      ? json({ message: "Roster unavailable" }, { status: 503 })
      : json(roster()),
  );
  const container = await mountStrict(harness());
  await waitFor(() =>
    assert.match(container.textContent, /Roster unavailable/),
  );

  failing = false;
  await click(namedButton(container, "Try again"));

  await waitFor(() => assert.equal(resolvedTarget(container), mia.id));
  assert.match(container.textContent, /Editing settings for Mia/);
});

test("offers an Add learner recovery when the roster is empty", async () => {
  installRosterFetch(roster(null, []));
  const container = await mountStrict(harness());

  await waitFor(() => assert.match(container.textContent, /No learners yet/));
  const link = [...container.querySelectorAll("a")].find(
    (candidate) => candidate.textContent.trim() === "Add learner",
  );
  assert.equal(link?.getAttribute("href"), "/guardian/learners");
  assert.equal(resolvedTarget(container), "unresolved");
});

test("resolves one valid URL target and keeps every learner name visible", async () => {
  installRosterFetch();
  const container = await mountStrict(
    harness("/guardian/stories?learnerProfileId=learner-noah"),
  );

  await waitFor(() => assert.equal(resolvedTarget(container), noah.id));
  assert.equal(namedButton(container, mia.name).getAttribute("aria-pressed"), "false");
  assert.equal(
    namedButton(container, noah.name).getAttribute("aria-pressed"),
    "true",
  );
  assert.match(container.textContent, /Editing settings for Noah the Space Explorer/);
});

test("normalizes a missing target to the owned active learner with replace", async () => {
  installRosterFetch();
  const container = await mountStrict(
    harness("/guardian/stories?filter=saved&filter=new#levels"),
  );

  await waitFor(() => assert.equal(resolvedTarget(container), mia.id));
  assert.equal(
    routerState(container),
    "REPLACE ?filter=saved&filter=new&learnerProfileId=learner-mia#levels",
  );
});

test("normalizes a missing target to the first learner when none is active", async () => {
  installRosterFetch(roster(null));
  const container = await mountStrict(harness("/guardian/stories?sort=name"));

  await waitFor(() => assert.equal(resolvedTarget(container), mia.id));
  assert.equal(
    routerState(container),
    "REPLACE ?sort=name&learnerProfileId=learner-mia",
  );
});

for (const [label, search] of [
  ["unknown", "learnerProfileId=learner-elsewhere"],
  ["duplicate", "learnerProfileId=learner-mia&learnerProfileId=learner-noah"],
  ["blank", "learnerProfileId="],
  ["invalid", "learnerProfileId=%EF%BF%BD"],
]) {
  test(`does not silently fall back from a present ${label} target`, async () => {
    installRosterFetch();
    const container = await mountStrict(harness(`/guardian/stories?${search}`));

    await waitFor(() =>
      assert.match(container.textContent, /learner target.*could not be found/i),
    );
    const link = [...container.querySelectorAll("a")].find(
      (candidate) => candidate.textContent.trim() === "Manage learners",
    );
    assert.equal(link?.getAttribute("href"), "/guardian/learners");
    assert.equal(resolvedTarget(container), "unresolved");
    assert.match(routerState(container), new RegExp(`^POP \\?${search}`));
  });
}

test("selects an editing target without changing the Learner mode badge", async () => {
  installRosterFetch();
  const container = await mountStrict(
    harness("/guardian/stories?view=art&learnerProfileId=learner-mia"),
  );
  await waitFor(() => assert.equal(resolvedTarget(container), mia.id));

  await click(namedButton(container, noah.name));

  await waitFor(() => assert.equal(resolvedTarget(container), noah.id));
  assert.equal(
    routerState(container),
    "PUSH ?view=art&learnerProfileId=learner-noah",
  );
  assert.equal(namedButton(container, noah.name).getAttribute("aria-pressed"), "true");
  const learnerModeBadge = [...container.querySelectorAll("span")].find(
    (candidate) => candidate.textContent.trim() === "Learner mode",
  );
  assert.ok(learnerModeBadge);
  assert.equal(learnerModeBadge.closest("button"), null);
  assert.equal(learnerModeBadge.parentElement?.textContent.includes(mia.name), true);
  assert.match(container.textContent, /Editing settings for Noah the Space Explorer/);
});
