import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
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
const guardianModule = await vite
  .ssrLoadModule("/src/stories/GuardianStorySettings.tsx")
  .catch(() => ({}));
const contextModule = await vite
  .ssrLoadModule("/src/learner-profile/LearnerProfileContext.tsx")
  .catch(() => ({}));
const { GuardianStorySettings, GuardianStorySettingsView } = guardianModule;
const {
  LearnerProfileProvider,
  LearnerSelectionProvider,
  useLearnerProfile,
} = contextModule;

test.afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
});

test.after(async () => {
  await vite.close();
  restoreDom();
});

function learnerProfile(
  storyLevel = "first-words",
  { id = "learner-mia", name = "Mia" } = {},
) {
  return {
    id,
    age: 6,
    answers: {
      legacyAnswers: null,
      questionnaireVersion: 2,
      responses: {},
      schemaVersion: 2,
    },
    completedAt: "2026-08-25T08:00:00.000Z",
    currentQuestionKey: null,
    description: "Likes animals",
    name,
    profileStatus: "completed",
    questionnaireVersion: 2,
    storyLevel,
  };
}

function learnerRoster() {
  return {
    activeProfileId: "learner-mia",
    profiles: [
      {
        age: 6,
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

function textFromMarkup(markup) {
  return markup
    .replace(/<[^>]+>/g, "")
    .replaceAll("&#x27;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function artState(overrides = {}) {
  return {
    consentChecked: false,
    error: "",
    featureEnabled: true,
    generateDisabled: true,
    hasSelectedPhoto: false,
    isGenerating: false,
    metadata: { stories: {} },
    personalizedArtwork: null,
    selectedFileName: "",
    statusMessage: "",
    storyTitle: "The Red Ball",
    setConsentChecked() {},
    setSelectedFile() {},
    generate() {},
    remove() {},
    ...overrides,
  };
}

function renderView(overrides = {}) {
  assert.equal(
    typeof GuardianStorySettingsView,
    "function",
    "Expected guardian story settings view",
  );
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/stories"] },
      createElement(GuardianStorySettingsView, {
        art: artState(),
        error: "",
        isSaving: false,
        onSelectLevel() {},
        selectedLevel: "first-words",
        statusMessage: "",
        target: readyTarget(),
        ...overrides,
      }),
    ),
  );
}

function ProfileProbe() {
  const { profile } = useLearnerProfile();
  return createElement(
    "output",
    { "aria-label": "Saved story level" },
    profile.storyLevel,
  );
}

function SelectionProvider({
  activeProfileId = "learner-mia",
  children,
  reloadSelectedLearner = async () => learnerProfile(),
}) {
  return createElement(
    LearnerSelectionProvider,
    {
      activeProfileId,
      async createAndSelectLearner() {
        throw new Error("Story settings must not create a learner.");
      },
      reloadSelectedLearner,
      async selectLearner() {
        throw new Error("Story settings must not select a learner.");
      },
    },
    children,
  );
}

function SettingsProfileProvider({
  activeProfileId,
  children,
  reloadSelectedLearner,
  storyLevel,
}) {
  const [profile, setProfile] = useState(() => learnerProfile(storyLevel));
  return createElement(
    SelectionProvider,
    { activeProfileId, reloadSelectedLearner },
    createElement(
      LearnerProfileProvider,
      { profile, replaceProfile: setProfile },
      children,
    ),
  );
}

function settingsHarness(storyLevel = "first-words", selection = {}) {
  assert.equal(
    typeof GuardianStorySettings,
    "function",
    "Expected interactive guardian story settings",
  );
  assert.equal(
    typeof LearnerProfileProvider,
    "function",
    "Expected the loaded-profile context provider",
  );
  return createElement(
    SettingsProfileProvider,
    { storyLevel, ...selection },
    createElement(
      MemoryRouter,
      {
        initialEntries: ["/guardian/stories?learnerProfileId=learner-mia"],
      },
      createElement(GuardianStorySettings, { learnerName: "Mia" }),
      createElement(ProfileProbe),
    ),
  );
}

function levelButton(container, name) {
  const button = [...container.querySelectorAll('[role="tab"]')].find(
    (candidate) => candidate.textContent.includes(name),
  );
  assert.ok(button, `Expected story-level button ${name}`);
  return button;
}

function assertPendingFocusable(button) {
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute("aria-disabled"), "true");
  assert.equal(document.activeElement, button);
}

function statusMatching(container, pattern) {
  return [...container.querySelectorAll('[role="status"]')].find((status) =>
    pattern.test(status.textContent ?? ""),
  );
}

function installArtFetch(preferenceResponse, storyLevel = "first-words") {
  const preferenceBodies = [];
  globalThis.fetch = async (path, init = {}) => {
    if (path === "/api/learner-profiles") {
      return Response.json(learnerRoster());
    }
    if (
      path === "/api/profile?learnerProfileId=learner-mia" &&
      (init.method ?? "GET") === "GET"
    ) {
      return Response.json({
        profile: learnerProfile(storyLevel),
        questions: [],
      });
    }
    if (
      path ===
      "/api/stories/the-red-ball/personalized-art?learnerProfileId=learner-mia"
    ) {
      return Response.json({ enabled: true, stories: {} });
    }
    if (
      path === "/api/profile/preferences?learnerProfileId=learner-mia" &&
      init.method === "PUT"
    ) {
      preferenceBodies.push(JSON.parse(init.body));
      return preferenceResponse(init);
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };
  return preferenceBodies;
}

test("guardian story settings owns level and art management", () => {
  const html = renderView();
  const renderedText = textFromMarkup(html);
  const container = document.createElement("div");
  container.innerHTML = html;
  const levelTabs = [...container.querySelectorAll('[role="tab"]')];

  assert.match(renderedText, /Editing settings for Mia/);
  assert.match(renderedText, /Noah/);
  assert.match(html, /<h1[^>]*>Story settings<\/h1>/);
  assert.match(html, /Choose story level/);
  assert.match(
    renderedText,
    /This shelf opens first for Mia\. Every story shelf is still available\./,
  );
  assert.equal(levelTabs.length, 4);
  assert.equal(
    levelTabs.some((tab) =>
      tab.textContent.includes("Storytime · Listen to a full story"),
    ),
    false,
  );
  assert.match(html, /Personalized story art/);
  assert.doesNotMatch(renderedText, /Guardian consent/);
  assert.match(renderedText, /I am 18 or older/);
  assert.match(renderedText, /Upload Mia's photo/);
  assert.match(renderedText, /look like Mia/);
  assert.match(renderedText, /I am Mia's guardian/);
  assert.match(html, /Generate story art/);
});

test("guardian story settings preserves private-art cleanup states", () => {
  const html = renderView({
    art: artState({
      featureEnabled: false,
      metadata: { hasStoredArt: true, stories: {} },
    }),
  });

  assert.match(html, /Delete stored story art/);
  assert.match(textFromMarkup(html), /Mia's private story art/);
  assert.doesNotMatch(
    textFromMarkup(html),
    /Upload .* photo|Generate story art/,
  );
});

test("saves a level before replacing the loaded profile and announces success without moving focus", async () => {
  const preference = deferred();
  const preferenceBodies = installArtFetch(() => preference.promise);
  const container = await mountStrict(settingsHarness());
  const firstWords = levelButton(container, "Level 1 · Words & pictures");
  const tinyStories = levelButton(container, "Level 3 · Short stories");

  tinyStories.focus();
  await click(tinyStories);
  assertPendingFocusable(tinyStories);
  await click(tinyStories);
  assert.deepEqual(preferenceBodies, [{ storyLevel: "tiny-stories" }]);
  assert.equal(firstWords.getAttribute("aria-selected"), "true");
  assert.equal(
    container.querySelector('output[aria-label="Saved story level"]')
      ?.textContent,
    "first-words",
  );

  preference.resolve(
    Response.json({
      profile: learnerProfile("tiny-stories"),
      questions: [],
    }),
  );
  await waitFor(() =>
    assert.equal(tinyStories.getAttribute("aria-selected"), "true"),
  );
  assert.equal(tinyStories.getAttribute("aria-disabled"), null);
  assert.equal(tinyStories.disabled, false);
  assert.equal(
    container.querySelector('output[aria-label="Saved story level"]')
      ?.textContent,
    "first-words",
  );
  assert.match(
    statusMatching(container, /Story level saved/i)?.textContent ?? "",
    /Story level saved.*Level 3 · Short stories/i,
  );
  assert.equal(document.activeElement, tinyStories);
});

test("refreshes active learner context after a targeted story-level save", async () => {
  const reloads = [];
  installArtFetch(() =>
    Response.json({
      profile: learnerProfile("tiny-stories"),
      questions: [],
    }),
  );
  const container = await mountStrict(
    settingsHarness("first-words", {
      async reloadSelectedLearner(id) {
        reloads.push(id);
        return learnerProfile("tiny-stories");
      },
    }),
  );

  await waitFor(() =>
    assert.ok(levelButton(container, "Level 3 · Short stories")),
  );
  await click(levelButton(container, "Level 3 · Short stories"));
  await waitFor(() =>
    assert.match(
      statusMatching(container, /Story level saved/i)?.textContent ?? "",
      /Story level saved.*Level 3 · Short stories/i,
    ),
  );

  assert.deepEqual(reloads, ["learner-mia"]);
});

test("rejects a story-level response for a different learner without announcing success", async () => {
  installArtFetch(() =>
    Response.json({
      profile: learnerProfile("tiny-stories", {
        id: "learner-noah",
        name: "Noah",
      }),
      questions: [],
    }),
  );
  const container = await mountStrict(settingsHarness());
  await click(levelButton(container, "Level 3 · Short stories"));

  await waitFor(() =>
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /selected learner profile could not be saved/i,
    ),
  );
  assert.equal(
    container.querySelector('output[aria-label="Saved story level"]')
      ?.textContent,
    "first-words",
  );
  assert.doesNotMatch(
    statusMatching(container, /Story level saved/i)?.textContent ?? "",
    /Story level saved/i,
  );
});

test("aborts and ignores an old learner's level save after a keyed learner change", async () => {
  const preference = deferred();
  const saveSignals = [];
  globalThis.fetch = async (path, init = {}) => {
    if (path === "/api/learner-profiles") {
      return Response.json(learnerRoster());
    }
    if (
      path === "/api/profile?learnerProfileId=learner-mia" &&
      (init.method ?? "GET") === "GET"
    ) {
      return Response.json({
        profile: learnerProfile(),
        questions: [],
      });
    }
    if (
      path === "/api/profile?learnerProfileId=learner-noah" &&
      (init.method ?? "GET") === "GET"
    ) {
      return Response.json({
        profile: learnerProfile("early-a1", {
          id: "learner-noah",
          name: "Noah",
        }),
        questions: [],
      });
    }
    if (
      path ===
        "/api/stories/the-red-ball/personalized-art?learnerProfileId=learner-mia" ||
      path ===
        "/api/stories/the-red-ball/personalized-art?learnerProfileId=learner-noah"
    ) {
      return Response.json({ enabled: true, stories: {} });
    }
    if (
      path === "/api/profile/preferences?learnerProfileId=learner-mia" &&
      init.method === "PUT"
    ) {
      saveSignals.push(init.signal);
      return preference.promise;
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    createElement(
      SelectionProvider,
      null,
      createElement(
        MemoryRouter,
        {
          initialEntries: ["/guardian/stories?learnerProfileId=learner-mia"],
        },
        createElement(GuardianStorySettings, { learnerName: "Mia" }),
      ),
    ),
  );
  await waitFor(() =>
    assert.ok(levelButton(container, "Level 3 · Short stories")),
  );
  await click(levelButton(container, "Level 3 · Short stories"));
  await waitFor(() => assert.equal(saveSignals.length, 1));
  await click(
    [...container.querySelectorAll("button")].find(
      (candidate) => candidate.getAttribute("aria-label") === "Noah",
    ),
  );

  assert.ok(saveSignals[0] instanceof AbortSignal);
  assert.equal(saveSignals[0].aborted, true);
  await act(async () => {
    preference.resolve(
      Response.json({
        profile: learnerProfile("tiny-stories"),
        questions: [],
      }),
    );
    await preference.promise;
    await Promise.resolve();
  });

  await waitFor(() =>
    assert.match(container.textContent, /Editing settings for Noah/),
  );
  assert.equal(
    levelButton(container, "Level 4 · Longer stories").getAttribute(
      "aria-selected",
    ),
    "true",
  );
  assert.equal(container.querySelector('[role="alert"]'), null);
  assert.doesNotMatch(
    statusMatching(container, /Story level saved|Saving story level/i)
      ?.textContent ?? "",
    /Story level saved|Saving story level/i,
  );
});

test("keeps the story settings shell connected while a new learner profile loads", async () => {
  const noahProfile = deferred();
  globalThis.fetch = async (path, init = {}) => {
    if (path === "/api/learner-profiles") {
      return Response.json(learnerRoster());
    }
    if (
      path === "/api/profile?learnerProfileId=learner-mia" &&
      (init.method ?? "GET") === "GET"
    ) {
      return Response.json({ profile: learnerProfile(), questions: [] });
    }
    if (
      path === "/api/profile?learnerProfileId=learner-noah" &&
      (init.method ?? "GET") === "GET"
    ) {
      return noahProfile.promise;
    }
    if (
      path ===
        "/api/stories/the-red-ball/personalized-art?learnerProfileId=learner-mia" ||
      path ===
        "/api/stories/the-red-ball/personalized-art?learnerProfileId=learner-noah"
    ) {
      return Response.json({ enabled: true, stories: {} });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    createElement(
      SelectionProvider,
      null,
      createElement(
        MemoryRouter,
        {
          initialEntries: ["/guardian/stories?learnerProfileId=learner-mia"],
        },
        createElement(GuardianStorySettings),
      ),
    ),
  );
  await waitFor(() =>
    assert.ok(levelButton(container, "Level 3 · Short stories")),
  );
  const main = container.querySelector("main");
  const noahTarget = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.getAttribute("aria-label") === "Noah",
  );
  assert.ok(main, "Expected the route main landmark");
  assert.ok(noahTarget, "Expected the Noah learner target");

  noahTarget.focus();
  act(() => noahTarget.click());

  try {
    assert.match(container.textContent, /Editing settings for Noah/);
    assert.equal(container.querySelector("main") === main, true);
    assert.equal(document.activeElement === noahTarget, true);
    assert.equal(container.contains(noahTarget), true);
    assert.equal(noahTarget.getAttribute("aria-pressed"), "true");
    assert.match(
      statusMatching(container, /Loading story settings/i)?.textContent ?? "",
      /Loading story settings/i,
    );
    assert.equal(container.querySelectorAll('[role="tab"]').length, 4);
    assert.ok(container.querySelector('[role="tablist"]'));
    assert.ok(
      container.querySelector("h2")?.textContent?.includes("Choose story level"),
    );
    assert.ok(
      container.querySelector('[aria-label="Personalized story art"]'),
    );
    assert.equal(
      [...container.querySelectorAll('[role="tab"]')].some(
        (tab) => tab.getAttribute("aria-selected") === "true",
      ),
      false,
    );
    assert.ok(
      [...container.querySelectorAll('[role="tab"]')].every(
        (tab) => tab.getAttribute("aria-disabled") === "true",
      ),
    );
    assert.equal(container.querySelector('input[type="file"]')?.disabled, true);
    assert.equal(
      container.querySelector('input[type="checkbox"]')?.disabled,
      true,
    );
  } finally {
    noahProfile.resolve(
      Response.json({
        profile: learnerProfile("early-a1", {
          id: "learner-noah",
          name: "Noah",
        }),
        questions: [],
      }),
    );
  }
});

test("keeps story controls unavailable when the targeted profile fails to load", async () => {
  const preferenceRequests = [];
  globalThis.fetch = async (path, init = {}) => {
    if (path === "/api/learner-profiles") {
      return Response.json(learnerRoster());
    }
    if (
      path === "/api/profile?learnerProfileId=learner-mia" &&
      (init.method ?? "GET") === "GET"
    ) {
      return Response.json(
        { error: "load_failed", message: "Profile unavailable." },
        { status: 500 },
      );
    }
    if (
      path ===
      "/api/stories/the-red-ball/personalized-art?learnerProfileId=learner-mia"
    ) {
      return Response.json({ enabled: true, stories: {} });
    }
    if (path.startsWith("/api/profile/preferences")) {
      preferenceRequests.push(path);
      return Response.json({ profile: learnerProfile(), questions: [] });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(settingsHarness());
  await waitFor(() =>
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /Profile unavailable/i,
    ),
  );

  const tabs = [...container.querySelectorAll('[role="tab"]')];
  assert.equal(tabs.length, 4);
  assert.ok(
    tabs.every((tab) => tab.getAttribute("aria-disabled") === "true"),
  );
  await click(levelButton(container, "Level 3 · Short stories"));
  assert.deepEqual(preferenceRequests, []);
});

test("loads and saves Noah's story settings and art through explicit target requests", async () => {
  const requests = [];
  globalThis.fetch = async (path, init = {}) => {
    requests.push({ method: init.method ?? "GET", path });
    if (path === "/api/learner-profiles") {
      return Response.json({
        activeProfileId: "learner-mia",
        profiles: [
          {
            age: 6,
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
      });
    }
    if (
      path === "/api/profile?learnerProfileId=learner-noah" &&
      (init.method ?? "GET") === "GET"
    ) {
      return Response.json({
        profile: learnerProfile("early-a1", {
          id: "learner-noah",
          name: "Noah",
        }),
        questions: [],
      });
    }
    if (
      path ===
        "/api/stories/the-red-ball/personalized-art?learnerProfileId=learner-noah" &&
      (init.method ?? "GET") === "GET"
    ) {
      return Response.json({ enabled: true, stories: {} });
    }
    if (
      path === "/api/profile/preferences?learnerProfileId=learner-noah" &&
      init.method === "PUT"
    ) {
      return Response.json({
        profile: learnerProfile("tiny-stories", {
          id: "learner-noah",
          name: "Noah",
        }),
        questions: [],
      });
    }
    if (path === "/api/stories/the-red-ball/personalized-art") {
      return Response.json({ enabled: true, stories: {} });
    }
    if (path === "/api/profile/preferences" && init.method === "PUT") {
      return Response.json({
        profile: learnerProfile("tiny-stories"),
        questions: [],
      });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    createElement(
      SettingsProfileProvider,
      {
        activeProfileId: "learner-mia",
        reloadSelectedLearner: async () =>
          assert.fail("Inactive story edits must not refresh active context."),
        storyLevel: "first-words",
      },
      createElement(
        MemoryRouter,
        {
          initialEntries: ["/guardian/stories?learnerProfileId=learner-noah"],
        },
        createElement(GuardianStorySettings, { learnerName: "Mia" }),
      ),
    ),
  );

  await waitFor(() =>
    assert.match(container.textContent, /Editing settings for Noah/),
  );
  assert.equal(
    levelButton(container, "Level 4 · Longer stories").getAttribute(
      "aria-selected",
    ),
    "true",
  );
  await click(levelButton(container, "Level 3 · Short stories"));
  await waitFor(() =>
    assert.match(
      statusMatching(container, /Story level saved/i)?.textContent ?? "",
      /Story level saved.*Level 3 · Short stories/i,
    ),
  );

  const featureRequests = requests.filter(
    ({ path }) =>
      path.startsWith("/api/profile") ||
      path.startsWith("/api/stories/the-red-ball/personalized-art"),
  );
  assert.ok(featureRequests.length > 0);
  assert.ok(
    featureRequests.every(({ path }) =>
      path.endsWith("?learnerProfileId=learner-noah"),
    ),
  );
});

for (const [status, message] of [
  [400, "Choose a supported story level."],
  [500, "Story settings could not be saved."],
]) {
  test(`retains the prior level after a ${status} preference failure`, async () => {
    const preference = deferred();
    const preferenceBodies = installArtFetch(() => preference.promise);
    const container = await mountStrict(settingsHarness());
    const firstWords = levelButton(container, "Level 1 · Words & pictures");
    const earlyA1 = levelButton(container, "Level 4 · Longer stories");

    earlyA1.focus();
    await click(earlyA1);
    assertPendingFocusable(earlyA1);
    await click(earlyA1);
    assert.deepEqual(preferenceBodies, [{ storyLevel: "early-a1" }]);
    preference.resolve(
      Response.json({ error: "save_failed", message }, { status }),
    );
    await waitFor(() =>
      assert.match(
        container.querySelector('[role="alert"]')?.textContent ?? "",
        new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      ),
    );

    assert.equal(earlyA1.getAttribute("aria-disabled"), null);
    assert.equal(earlyA1.disabled, false);
    assert.equal(firstWords.getAttribute("aria-selected"), "true");
    assert.equal(
      container.querySelector('output[aria-label="Saved story level"]')
        ?.textContent,
      "first-words",
    );
    assert.equal(document.activeElement, earlyA1);
  });
}
