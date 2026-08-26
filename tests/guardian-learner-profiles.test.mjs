import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useLocation } from "react-router";
import test from "node:test";
import { createServer } from "vite";
import {
  cleanupMountedRoots,
  click,
  deferred,
  input,
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

const managerModule = await vite
  .ssrLoadModule("/src/learner-profile/GuardianLearnerProfiles.tsx")
  .catch(() => ({}));
const { GuardianLearnerProfiles, GuardianLearnerProfilesView } = managerModule;
const { LearnerSelectionProvider } = await vite.ssrLoadModule(
  "/src/learner-profile/LearnerProfileContext.tsx",
);
const { createLearnerProfile, selectLearnerProfile } = await vite.ssrLoadModule(
  "/src/learner-profile/learner-profile-api.ts",
);

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
  name: "Noah",
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

function roster(activeProfileId = mia.id, profiles = [mia, noah]) {
  return { activeProfileId, profiles };
}

function fullProfile(profile) {
  return {
    age: profile.age,
    answers: {
      legacyAnswers: null,
      questionnaireVersion: 2,
      responses: {},
      schemaVersion: 2,
    },
    completedAt:
      profile.profileStatus === "completed" ? "2026-08-25T08:00:00.000Z" : null,
    currentQuestionKey:
      profile.profileStatus === "completed" ? null : "preferred_name",
    description: null,
    id: profile.id,
    name: profile.name,
    profileStatus: profile.profileStatus,
    questionnaireVersion: 2,
    storyLevel: "first-words",
  };
}

function renderView(overrides = {}) {
  assert.equal(
    typeof GuardianLearnerProfilesView,
    "function",
    "Expected a rendered Guardian learner manager view",
  );
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/learners"] },
      createElement(GuardianLearnerProfilesView, {
        activeProfileId: mia.id,
        error: "",
        isLoading: false,
        onAdd() {},
        onManage() {},
        onRetry() {},
        onSelect() {},
        pendingProfileId: null,
        profiles: [mia, noah],
        statusMessage: "",
        ...overrides,
      }),
    ),
  );
}

function button(container, accessibleName) {
  const match = [...container.querySelectorAll("button")].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === accessibleName ||
      candidate.textContent.trim() === accessibleName,
  );
  assert.ok(match, `Expected button named "${accessibleName}".`);
  return match;
}

function LocationProbe() {
  const location = useLocation();
  return createElement(
    "output",
    { "aria-label": "Current route" },
    `${location.pathname}${location.search}`,
  );
}

function currentRoute(container) {
  return container.querySelector('output[aria-label="Current route"]')
    ?.textContent;
}

function managerHarness({ activeProfileId = mia.id, reloadSelectedLearner }) {
  assert.equal(
    typeof GuardianLearnerProfiles,
    "function",
    "Expected an interactive Guardian learner manager",
  );
  return createElement(
    LearnerSelectionProvider,
    {
      activeProfileId,
      async createAndSelectLearner(name) {
        const result = await createLearnerProfile(name);
        if (!result.activeProfileId) {
          throw new Error("The newly added learner could not be loaded.");
        }
        await reloadSelectedLearner(result.activeProfileId);
        return result;
      },
      reloadSelectedLearner,
      async selectLearner(profileId) {
        const result = await selectLearnerProfile(profileId);
        if (result.activeProfileId !== profileId) {
          throw new Error("The selected learner could not be loaded.");
        }
        await reloadSelectedLearner(profileId);
        return result;
      },
    },
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/learners"] },
      createElement(GuardianLearnerProfiles),
      createElement(LocationProbe),
    ),
  );
}

function changingContextManagerHarness({ onActivate, reloadSelectedLearner }) {
  function Harness() {
    const [activeProfileId, setActiveProfileId] = useState(mia.id);
    return createElement(
      LearnerSelectionProvider,
      {
        activeProfileId,
        async createAndSelectLearner(name) {
          const result = await createLearnerProfile(name);
          if (!result.activeProfileId) {
            throw new Error("The newly added learner could not be loaded.");
          }
          await reloadSelectedLearner(result.activeProfileId);
          return result;
        },
        reloadSelectedLearner,
        async selectLearner(profileId) {
          const result = await selectLearnerProfile(profileId);
          if (result.activeProfileId !== profileId) {
            throw new Error("The selected learner could not be loaded.");
          }
          await reloadSelectedLearner(profileId);
          return result;
        },
      },
      createElement(
        "button",
        {
          onClick: () => {
            onActivate();
            setActiveProfileId("learner-ava");
          },
          type: "button",
        },
        "Activate Ava in background",
      ),
      createElement(
        MemoryRouter,
        { initialEntries: ["/guardian/learners"] },
        createElement(GuardianLearnerProfiles),
        createElement(LocationProbe),
      ),
    );
  }

  return createElement(Harness);
}

test("learner manager renders the roster, setup state, and add form accessibly", () => {
  const html = renderView();

  assert.match(html, /<h1[^>]*>Learner profiles<\/h1>/);
  assert.match(html, /<ul/);
  assert.equal((html.match(/<li/g) ?? []).length, 2);
  assert.match(html, /<h3[^>]*><bdi[^>]*>Mia<\/bdi><\/h3>/);
  assert.match(html, /<h3[^>]*><bdi[^>]*>Noah<\/bdi><\/h3>/);
  assert.match(html, /Current learner/);
  assert.match(html, /Age 6/);
  assert.match(html, /Setup complete/);
  assert.match(html, /Setup not started/);
  assert.match(html, /aria-label="Use Noah"/);
  assert.match(html, /aria-label="Manage Mia&#x27;s details"/);
  assert.match(html, /aria-label="Manage Noah&#x27;s details"/);
  assert.match(
    html,
    /<label[^>]*for="preferred-name"[^>]*>Preferred name<\/label>/,
  );
  assert.match(html, /<input[^>]*id="preferred-name"/);
  assert.equal((html.match(/role="status"/g) ?? []).length, 1);
});

test("turns a malformed roster success into a retryable manager error", async () => {
  let validResponse = false;
  globalThis.fetch = async (input, init = {}) => {
    assert.equal(String(input), "/api/learner-profiles");
    assert.equal(init.method, "GET");
    return Response.json(
      validResponse ? roster() : { activeProfileId: mia.id, profiles: null },
    );
  };

  const container = await mountStrict(
    managerHarness({
      async reloadSelectedLearner() {
        return fullProfile(mia);
      },
    }),
  );

  await waitFor(() => {
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /learner profiles could not be loaded/i,
    );
    button(container, "Try again");
  });
  validResponse = true;
  await click(button(container, "Try again"));
  await waitFor(() => button(container, "Use Noah"));
});

test("keeps a missing-active roster refresh failure retryable", async () => {
  const ava = {
    age: null,
    createdAt: "2026-08-27T08:00:00.000Z",
    id: "learner-ava",
    name: "Ava",
    profileStatus: "not_started",
  };
  let contextChanged = false;
  let retrySucceeds = false;
  globalThis.fetch = async (input, init = {}) => {
    assert.equal(String(input), "/api/learner-profiles");
    assert.equal(init.method, "GET");
    if (!contextChanged) return Response.json(roster());
    if (!retrySucceeds) {
      return Response.json(
        { error: "roster_failed", message: "Roster refresh failed." },
        { status: 503 },
      );
    }
    return Response.json(roster(ava.id, [mia, noah, ava]));
  };

  const container = await mountStrict(
    changingContextManagerHarness({
      onActivate() {
        contextChanged = true;
      },
      async reloadSelectedLearner() {
        return fullProfile(ava);
      },
    }),
  );

  await waitFor(() => button(container, "Use Noah"));
  await click(button(container, "Activate Ava in background"));
  await waitFor(() => {
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /Roster refresh failed/,
    );
    assert.equal(
      button(container, "Add learner").getAttribute("aria-disabled"),
      "true",
    );
    button(container, "Try again");
  });

  retrySucceeds = true;
  await click(button(container, "Try again"));
  await waitFor(() => {
    assert.match(container.textContent, /Managing Ava/);
    assert.equal(container.querySelector('[role="alert"]'), null);
  });
});

test("plain selection reloads the authoritative learner before announcing and focusing context", async () => {
  const operations = [];
  globalThis.fetch = async (input, init = {}) => {
    const path = String(input);
    if (path === "/api/learner-profiles" && init.method === "GET") {
      return Response.json(roster());
    }
    if (
      path === "/api/learner-profiles/learner-noah/active" &&
      init.method === "PUT"
    ) {
      operations.push("select");
      return Response.json(roster(noah.id));
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    managerHarness({
      async reloadSelectedLearner(id) {
        operations.push(`reload:${id}`);
        return fullProfile(noah);
      },
    }),
  );

  await waitFor(() => button(container, "Use Noah"));
  await click(button(container, "Use Noah"));

  await waitFor(() => {
    assert.deepEqual(operations, ["select", "reload:learner-noah"]);
    assert.match(container.textContent, /Now managing Noah/);
    assert.match(container.textContent, /Current learner/);
    const context = [...container.querySelectorAll("h2")].find(
      (heading) => heading.textContent === "Managing Noah",
    );
    assert.ok(context);
    assert.equal(document.activeElement, context);
  });
});

test("failed selection preserves the current learner and restores initiating focus", async () => {
  let reloadCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const path = String(input);
    if (path === "/api/learner-profiles" && init.method === "GET") {
      return Response.json(roster());
    }
    if (path.endsWith("/learner-noah/active") && init.method === "PUT") {
      return Response.json(
        { error: "selection_failed", message: "Could not select Noah." },
        { status: 500 },
      );
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    managerHarness({
      async reloadSelectedLearner() {
        reloadCalls += 1;
        return fullProfile(noah);
      },
    }),
  );
  await waitFor(() => button(container, "Use Noah"));
  const useNoah = button(container, "Use Noah");
  useNoah.focus();
  await click(useNoah);

  await waitFor(() => {
    assert.equal(reloadCalls, 0);
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /Could not select Noah/,
    );
    assert.match(container.textContent, /Managing Mia/);
    assert.equal(document.activeElement, button(container, "Use Noah"));
  });
});

test("rejects a successful selection response that names a different active learner", async () => {
  let reloadCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const path = String(input);
    if (path === "/api/learner-profiles" && init.method === "GET") {
      return Response.json(roster());
    }
    if (path.endsWith("/learner-noah/active") && init.method === "PUT") {
      return Response.json(roster(mia.id));
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    managerHarness({
      async reloadSelectedLearner() {
        reloadCalls += 1;
        return fullProfile(noah);
      },
    }),
  );
  await waitFor(() => button(container, "Use Noah"));
  const useNoah = button(container, "Use Noah");
  useNoah.focus();
  await click(useNoah);

  await waitFor(() => {
    assert.equal(reloadCalls, 0);
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /selected learner could not be loaded/i,
    );
    assert.match(container.textContent, /Managing Mia/);
    assert.equal(document.activeElement, button(container, "Use Noah"));
  });
});

test("managing an inactive learner waits for authoritative reload before navigation", async () => {
  const reloaded = deferred();
  globalThis.fetch = async (input, init = {}) => {
    const path = String(input);
    if (path === "/api/learner-profiles" && init.method === "GET") {
      return Response.json(roster());
    }
    if (path.endsWith("/learner-noah/active") && init.method === "PUT") {
      return Response.json(roster(noah.id));
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    managerHarness({
      reloadSelectedLearner() {
        return reloaded.promise;
      },
    }),
  );
  await waitFor(() => button(container, "Manage Noah's details"));
  await click(button(container, "Manage Noah's details"));
  assert.equal(currentRoute(container), "/guardian/learners");

  await act(async () => reloaded.resolve(fullProfile(noah)));
  await waitFor(() =>
    assert.equal(
      currentRoute(container),
      "/guardian/profile?returnTo=%2Fguardian%2Flearners",
    ),
  );
});

test("adding a learner selects and reloads it before opening Guardian details", async () => {
  const ava = {
    age: null,
    createdAt: "2026-08-27T08:00:00.000Z",
    id: "learner-ava",
    name: "Ava",
    profileStatus: "not_started",
  };
  const operations = [];
  globalThis.fetch = async (request, init = {}) => {
    const path = String(request);
    if (path === "/api/learner-profiles" && init.method === "GET") {
      return Response.json(roster());
    }
    if (path === "/api/learner-profiles" && init.method === "POST") {
      operations.push(`create:${JSON.parse(init.body).name}`);
      return Response.json(roster(ava.id, [mia, noah, ava]));
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    managerHarness({
      async reloadSelectedLearner(id) {
        operations.push(`reload:${id}`);
        return fullProfile(ava);
      },
    }),
  );
  await waitFor(() => button(container, "Add learner"));
  await input(container.querySelector("#preferred-name"), "  Ava  ");
  await click(button(container, "Add learner"));

  await waitFor(() => {
    assert.deepEqual(operations, ["create:Ava", "reload:learner-ava"]);
    assert.equal(
      currentRoute(container),
      "/guardian/profile?returnTo=%2Fguardian%2Flearners",
    );
  });
});
