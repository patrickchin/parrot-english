import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import test from "node:test";
import { createServer } from "vite";
import {
  cleanupMountedRoots,
  click,
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
const detailsModule = await vite
  .ssrLoadModule("/src/learner-profile/GuardianLearnerDetails.tsx")
  .catch(() => ({}));
const { GuardianLearnerDetails } = detailsModule;
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

function profileEditorState(profile) {
  return {
    profile: {
      ...fullProfile(profile),
      description: `${profile.name} likes space and dinosaurs.`,
      lessonRecordingCleanupPending: false,
      lessonRecordingConsent: false,
      answers: {
        ...fullProfile(profile).answers,
        responses: {
          favoriteAnimals: {
            acknowledgment: "Thank you!",
            answeredAt: "2026-08-26T08:00:00.000Z",
            enrichmentStatus: "generated",
            question: "What animals do you like?",
            rawAnswer: "Dinosaurs",
            summary: "Likes dinosaurs.",
          },
          favoriteCartoons: {
            acknowledgment: "Thank you!",
            answeredAt: "2026-08-26T08:00:00.000Z",
            enrichmentStatus: "generated",
            question: "What cartoons do you like?",
            rawAnswer: "Bluey",
            summary: "Likes Bluey.",
          },
        },
      },
    },
    questions: [
      {
        answerKey: "name",
        audio: null,
        maxLength: 120,
        position: 1,
        promptEn: "What name do you use?",
        promptZh: null,
        required: true,
      },
      {
        answerKey: "age",
        audio: null,
        maxLength: 120,
        position: 2,
        promptEn: "How old are you?",
        promptZh: null,
        required: true,
      },
      {
        answerKey: "favoriteAnimals",
        audio: null,
        maxLength: 300,
        position: 3,
        promptEn: "What animals do you like?",
        promptZh: "你喜欢什么动物？",
        required: false,
      },
      {
        answerKey: "favoriteCartoons",
        audio: null,
        maxLength: 300,
        position: 4,
        promptEn: "What cartoons do you like?",
        promptZh: "你喜欢什么动画片？",
        required: false,
      },
    ],
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

function detailsHarness({
  activeProfileId = mia.id,
  learnerId = noah.id,
  reloadSelectedLearner = async () => fullProfile(mia),
} = {}) {
  assert.equal(
    typeof GuardianLearnerDetails,
    "function",
    "Expected an explicit Guardian learner details container",
  );
  return createElement(
    LearnerSelectionProvider,
    {
      activeProfileId,
      async createAndSelectLearner() {
        throw new Error("Explicit learner details must not create a learner.");
      },
      reloadSelectedLearner,
      async selectLearner() {
        throw new Error("Explicit learner details must not select a learner.");
      },
    },
    createElement(
      MemoryRouter,
      { initialEntries: [`/guardian/learners/${learnerId}`] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          element: createElement(GuardianLearnerDetails),
          path: "/guardian/learners/:learnerId",
        }),
        createElement(Route, {
          element: createElement("p", null, "MANAGE LEARNERS"),
          path: "/guardian/learners",
        }),
      ),
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

test("learner manager distinguishes Guardian management from learner mode", () => {
  const html = renderView();

  assert.match(html, /<h1[^>]*>Manage learners<\/h1>/);
  assert.match(html, /<ul/);
  assert.equal((html.match(/<li/g) ?? []).length, 2);
  assert.match(html, /<h3[^>]*><bdi[^>]*>Mia<\/bdi><\/h3>/);
  assert.match(html, /<h3[^>]*><bdi[^>]*>Noah<\/bdi><\/h3>/);
  assert.match(html, /Learner mode/);
  assert.match(html, /Age 6/);
  assert.match(html, /Setup complete/);
  assert.match(html, /Setup not started/);
  assert.match(html, /aria-label="Use Noah in learner mode"/);
  assert.match(html, /aria-label="Edit Mia&#x27;s profile"/);
  assert.match(html, /aria-label="Edit Noah&#x27;s profile"/);
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
  await waitFor(() => button(container, "Use Noah in learner mode"));
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

  await waitFor(() => button(container, "Use Noah in learner mode"));
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

  await waitFor(() => button(container, "Use Noah in learner mode"));
  await click(button(container, "Use Noah in learner mode"));

  await waitFor(() => {
    assert.deepEqual(operations, ["select", "reload:learner-noah"]);
    assert.match(container.textContent, /Now managing Noah/);
    assert.match(container.textContent, /Learner mode/);
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
  await waitFor(() => button(container, "Use Noah in learner mode"));
  const useNoah = button(container, "Use Noah in learner mode");
  useNoah.focus();
  await click(useNoah);

  await waitFor(() => {
    assert.equal(reloadCalls, 0);
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /Could not select Noah/,
    );
    assert.match(container.textContent, /Managing Mia/);
    assert.equal(
      document.activeElement,
      button(container, "Use Noah in learner mode"),
    );
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
  await waitFor(() => button(container, "Use Noah in learner mode"));
  const useNoah = button(container, "Use Noah in learner mode");
  useNoah.focus();
  await click(useNoah);

  await waitFor(() => {
    assert.equal(reloadCalls, 0);
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /selected learner could not be loaded/i,
    );
    assert.match(container.textContent, /Managing Mia/);
    assert.equal(
      document.activeElement,
      button(container, "Use Noah in learner mode"),
    );
  });
});

test("editing an inactive learner navigates by ID without selecting or reloading", async () => {
  let reloadCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const path = String(input);
    if (path === "/api/learner-profiles" && init.method === "GET") {
      return Response.json(roster());
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
  await waitFor(() => button(container, "Edit Noah's profile"));
  await click(button(container, "Edit Noah's profile"));

  await waitFor(() => {
    assert.equal(reloadCalls, 0);
    assert.equal(
      currentRoute(container),
      "/guardian/learners/learner-noah",
    );
  });
});

test("adding a managed learner preserves learner mode and opens the new ID route", async () => {
  const ava = {
    age: null,
    createdAt: "2026-08-27T08:00:00.000Z",
    id: "learner-ava",
    name: "Ava",
    profileStatus: "not_started",
  };
  let reloadCalls = 0;
  globalThis.fetch = async (request, init = {}) => {
    const path = String(request);
    if (path === "/api/learner-profiles" && init.method === "GET") {
      return Response.json(roster());
    }
    if (path === "/api/learner-profiles" && init.method === "POST") {
      assert.deepEqual(JSON.parse(init.body), {
        activate: false,
        name: "Ava",
      });
      return Response.json(roster(mia.id, [mia, noah, ava]));
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    managerHarness({
      async reloadSelectedLearner() {
        reloadCalls += 1;
        return fullProfile(ava);
      },
    }),
  );
  await waitFor(() => button(container, "Add learner"));
  await input(container.querySelector("#preferred-name"), "  Ava  ");
  await click(button(container, "Add learner"));

  await waitFor(() => {
    assert.equal(reloadCalls, 0);
    assert.equal(
      currentRoute(container),
      "/guardian/learners/learner-ava",
    );
  });
});

test("loads and saves inactive learner details by ID without changing learner mode", async () => {
  const requests = [];
  let reloadCalls = 0;
  globalThis.fetch = async (request, init = {}) => {
    const path = String(request);
    requests.push({ body: init.body, method: init.method, path });
    if (
      path === "/api/profile?learnerProfileId=learner-noah" &&
      init.method === "GET"
    ) {
      return Response.json(profileEditorState(noah));
    }
    if (
      path === "/api/profile?learnerProfileId=learner-noah" &&
      init.method === "PUT"
    ) {
      return Response.json(profileEditorState(noah));
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    detailsHarness({
      async reloadSelectedLearner() {
        reloadCalls += 1;
        return fullProfile(noah);
      },
    }),
  );

  await waitFor(() => {
    assert.equal(container.querySelector("#profile-name")?.value, "Noah");
    assert.equal(container.querySelector("#profile-age")?.value, "");
    assert.equal(
      container.querySelector("#profile-favoriteAnimals")?.value,
      "Dinosaurs",
    );
    assert.equal(
      container.querySelector("#profile-favoriteCartoons")?.value,
      "Bluey",
    );
  });
  assert.match(container.textContent, /What animals do you like\?/);
  assert.match(container.textContent, /你喜欢什么动物？/);
  assert.doesNotMatch(container.textContent, /Redo learner setup/);

  await input(
    container.querySelector("#profile-favoriteAnimals"),
    "Dinosaurs and parrots",
  );
  await click(button(container, "Save changes"));

  await waitFor(() =>
    assert.equal(currentRoute(container), "/guardian/learners"),
  );
  assert.equal(reloadCalls, 0);
  const saveRequest = requests.find(({ method }) => method === "PUT");
  assert.ok(saveRequest);
  assert.deepEqual(JSON.parse(saveRequest.body), {
    answers: {
      age: "",
      description: "Noah likes space and dinosaurs.",
      favoriteAnimals: "Dinosaurs and parrots",
      favoriteCartoons: "Bluey",
      name: "Noah",
    },
  });
  assert.equal(
    requests.some(({ path }) => path.includes("/active")),
    false,
  );
});

test("targets recording consent at an explicit learner without selecting them", async () => {
  let reloadCalls = 0;
  const consentBodies = [];
  globalThis.fetch = async (request, init = {}) => {
    const path = String(request);
    if (
      path === "/api/profile?learnerProfileId=learner-noah" &&
      init.method === "GET"
    ) {
      return Response.json(profileEditorState(noah));
    }
    if (
      path ===
        "/api/profile/lesson-recording-consent?learnerProfileId=learner-noah" &&
      init.method === "PUT"
    ) {
      consentBodies.push(JSON.parse(init.body));
      return Response.json({ cleanupPending: false, enabled: true });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    detailsHarness({
      async reloadSelectedLearner() {
        reloadCalls += 1;
        return fullProfile(noah);
      },
    }),
  );
  await waitFor(() => button(container, "Allow lesson voice recordings"));
  await click(button(container, "Allow lesson voice recordings"));
  await waitFor(() =>
    assert.match(
      container.querySelector('[role="status"]')?.textContent ?? "",
      /currently allowed/,
    ),
  );

  assert.deepEqual(consentBodies, [{ enabled: true }]);
  assert.equal(reloadCalls, 0);
  assert.equal(currentRoute(container), "/guardian/learners/learner-noah");
});

test("refreshes active learner context after targeted recording consent changes", async () => {
  const reloads = [];
  globalThis.fetch = async (request, init = {}) => {
    const path = String(request);
    if (
      path === "/api/profile?learnerProfileId=learner-mia" &&
      init.method === "GET"
    ) {
      return Response.json(profileEditorState(mia));
    }
    if (
      path ===
        "/api/profile/lesson-recording-consent?learnerProfileId=learner-mia" &&
      init.method === "PUT"
    ) {
      return Response.json({ cleanupPending: false, enabled: true });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    detailsHarness({
      activeProfileId: mia.id,
      learnerId: mia.id,
      async reloadSelectedLearner(id) {
        reloads.push(id);
        return fullProfile(mia);
      },
    }),
  );
  await waitFor(() => button(container, "Allow lesson voice recordings"));
  await click(button(container, "Allow lesson voice recordings"));
  await waitFor(() =>
    assert.match(
      container.querySelector('[role="status"]')?.textContent ?? "",
      /currently allowed/,
    ),
  );

  assert.deepEqual(reloads, ["learner-mia"]);
  assert.equal(currentRoute(container), "/guardian/learners/learner-mia");
});
