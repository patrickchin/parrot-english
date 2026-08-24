import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement, useState } from "react";
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
const { LearnerProfileProvider, useLearnerProfile } = contextModule;

test.afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
});

test.after(async () => {
  await vite.close();
  restoreDom();
});

function learnerProfile(storyLevel = "first-words") {
  return {
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
    name: "Mia",
    profileStatus: "completed",
    questionnaireVersion: 2,
    storyLevel,
  };
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

function SettingsProfileProvider({ children, storyLevel }) {
  const [profile, setProfile] = useState(() => learnerProfile(storyLevel));
  return createElement(
    LearnerProfileProvider,
    { profile, replaceProfile: setProfile },
    children,
  );
}

function settingsHarness(storyLevel = "first-words") {
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
    { storyLevel },
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/stories"] },
      createElement(GuardianStorySettings),
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

function installArtFetch(preferenceResponse) {
  const preferenceBodies = [];
  globalThis.fetch = async (path, init = {}) => {
    if (path === "/api/stories/the-red-ball/personalized-art") {
      return Response.json({ enabled: true, stories: {} });
    }
    if (path === "/api/profile/preferences" && init.method === "PUT") {
      preferenceBodies.push(JSON.parse(init.body));
      return preferenceResponse(init);
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };
  return preferenceBodies;
}

test("guardian story settings owns level and art management", () => {
  const html = renderView();

  assert.match(html, /<h1[^>]*>Story settings<\/h1>/);
  assert.match(html, /Choose story level/);
  assert.match(html, /Personalized story art/);
  assert.match(html, /Guardian consent/);
  assert.match(html, /Upload learner photo/);
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
  assert.doesNotMatch(html, /Upload learner photo|Generate story art/);
});

test("saves a level before replacing the loaded profile and announces success without moving focus", async () => {
  const preference = deferred();
  const preferenceBodies = installArtFetch(() => preference.promise);
  const container = await mountStrict(settingsHarness());
  const firstWords = levelButton(container, "Start here");
  const tinyStories = levelButton(container, "Little stories");

  tinyStories.focus();
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
  await waitFor(() => assert.equal(tinyStories.getAttribute("aria-selected"), "true"));
  assert.equal(
    container.querySelector('output[aria-label="Saved story level"]')
      ?.textContent,
    "tiny-stories",
  );
  assert.match(
    container.querySelector('[role="status"]')?.textContent ?? "",
    /Story level saved.*Little stories/i,
  );
  assert.equal(document.activeElement, tinyStories);
});

for (const [status, message] of [
  [400, "Choose a supported story level."],
  [500, "Story settings could not be saved."],
]) {
  test(`retains the prior level after a ${status} preference failure`, async () => {
    installArtFetch(() =>
      Response.json(
        { error: "save_failed", message },
        { status },
      ),
    );
    const container = await mountStrict(settingsHarness());
    const firstWords = levelButton(container, "Start here");
    const earlyA1 = levelButton(container, "Big adventures");

    earlyA1.focus();
    await click(earlyA1);
    await waitFor(() =>
      assert.match(
        container.querySelector('[role="alert"]')?.textContent ?? "",
        new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      ),
    );

    assert.equal(firstWords.getAttribute("aria-selected"), "true");
    assert.equal(
      container.querySelector('output[aria-label="Saved story level"]')
        ?.textContent,
      "first-words",
    );
    assert.equal(document.activeElement, earlyA1);
  });
}
