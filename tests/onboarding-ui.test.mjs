import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { after, describe, it } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const questionModule = await vite.ssrLoadModule("/src/OnboardingQuestion.tsx");
const {
  OnboardingQuestionView,
  captureOnboardingAnswer,
  playOnboardingStart,
  replayOnboardingQuestion,
} = questionModule;
const acknowledgmentModule = await vite.ssrLoadModule(
  "/src/OnboardingAcknowledgment.tsx",
);
const { OnboardingAcknowledgment, beginAcknowledgmentPlayback } =
  acknowledgmentModule;
const profileModule = await vite.ssrLoadModule("/src/ProfileEditor.tsx");
const { ProfileEditorView } = profileModule;
const gateModule = await vite.ssrLoadModule("/src/OnboardingGate.tsx");
const {
  OnboardingGateView,
  answerForQuestion,
  createProfileOperationBoundary,
  createProfileOperationOwnership,
  createProfileRouteLifecycle,
  nextProfileAcknowledgment,
  profileDraftsFromState,
  saveQuestionAndAdvance,
  shouldSyncActiveQuestion,
  teardownProfileOperationResources,
  updateProfileDraft,
} = gateModule;
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const questionSource = readFileSync(
  new URL("../src/OnboardingQuestion.tsx", import.meta.url),
  "utf8",
);
const gateSource = readFileSync(
  new URL("../src/OnboardingGate.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

after(async () => {
  await vite.close();
});

function question(overrides = {}) {
  return {
    answerKey: "age",
    position: 2,
    promptEn: "How old are you?",
    promptZh: "你几岁了？",
    required: true,
    maxLength: 120,
    audio: {
      id: "onboarding-v2-age",
      src: "/assets/audio/onboarding-v2-age.mp3",
      text: "How old are you?",
    },
    ...overrides,
  };
}

function questionProps(overrides = {}) {
  return {
    fieldError: "",
    mode: "onboarding",
    onReplay() {},
    onSkip() {},
    onSkipQuestion() {},
    onSubmit() {},
    onTranscribe() {},
    onValueChange() {},
    progress: { answered: 1, current: 2, total: 6 },
    question: question(),
    status: "idle",
    value: "",
    ...overrides,
  };
}

function renderQuestion(overrides = {}) {
  return renderToStaticMarkup(
    createElement(OnboardingQuestionView, questionProps(overrides)),
  );
}

describe("one-question prose onboarding view", () => {
  it("renders one editable prose answer without array controls", () => {
    const html = renderQuestion({ value: "I am six" });

    assert.equal((html.match(/<h1/g) ?? []).length, 1);
    assert.match(html, /How old are you\?/);
    assert.match(html, /你几岁了？/);
    assert.match(html, /Question 2 of 6/);
    assert.match(html, /<textarea/);
    assert.match(html, /maxlength="120"/i);
    assert.match(html, /I am six/);
    assert.match(html, /aria-label="Replay question"/);
    assert.match(html, /aria-label="Speak your answer"/);
    assert.match(html, />Next</);
    assert.match(html, />Skip for now</);
    assert.doesNotMatch(
      html,
      /onboarding-chips|Answer suggestions|Add one answer|aria-label="Add answer"/,
    );
  });

  it("keeps the editable fallback through listening, transcription, and thinking", () => {
    const recording = renderQuestion({ status: "recording" });
    assert.match(recording, /Listening…/);
    assert.match(recording, /<textarea/);

    const transcribing = renderQuestion({ status: "transcribing" });
    assert.match(transcribing, /Writing what I heard…/);
    assert.match(transcribing, /<textarea/);

    const saving = renderQuestion({ status: "saving" });
    assert.match(saving, /Peppa is thinking…/);
    assert.match(saving, /disabled=""/);
    assert.match(saving, /<textarea/);
  });

  it("shows field errors and only offers per-question skip when optional", () => {
    const failed = renderQuestion({
      fieldError: "Please tell me your age using a whole number.",
    });
    assert.match(failed, /role="alert"/);
    assert.match(failed, /Please tell me your age/);

    assert.match(
      renderQuestion({ question: question({ required: false }) }),
      />Skip question</,
    );
    assert.doesNotMatch(renderQuestion(), />Skip question</);
    assert.doesNotMatch(
      renderQuestion({ mode: "profile", question: question({ required: false }) }),
      /Skip for now|Skip question/,
    );
  });

  it("contains no scalar-array branching helpers", () => {
    assert.doesNotMatch(
      questionSource,
      /cardinality|answerType|onboarding-chips|onboarding-suggestions|onToggleOption|onAddPending/,
    );
    assert.doesNotMatch(
      gateSource,
      /addArrayAnswer|toggleArrayAnswer|submissionValue|pendingValue/,
    );
  });
});

describe("onboarding prompt and transcription helpers", () => {
  it("plays only the first simple question after Start", async () => {
    const calls = [];
    await playOnboardingStart({
      questionAudio: question().audio,
      async playLine(options) {
        calls.push(options);
      },
    });
    assert.deepEqual(calls, [
      {
        audioId: "onboarding-v2-age",
        audioSrc: "/assets/audio/onboarding-v2-age.mp3",
        text: "How old are you?",
      },
    ]);
  });

  it("replays only the current question", async () => {
    const calls = [];
    await replayOnboardingQuestion(question().audio, {
      async playLine(options) {
        calls.push(options);
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].audioSrc, "/assets/audio/onboarding-v2-age.mp3");
  });

  it("forwards cancellation when replaying a profile question", async () => {
    const controller = new AbortController();
    let replaySignal;
    await replayOnboardingQuestion(question().audio, {
      signal: controller.signal,
      async playLine(options) {
        replaySignal = options.signal;
      },
    });
    assert.equal(replaySignal, controller.signal);
  });

  it("returns one editable transcript without persisting it", async () => {
    const audio = new Blob(["audio"], { type: "audio/webm" });
    let transcribedAudio;
    const transcript = await captureOnboardingAnswer({
      async record() {
        return audio;
      },
      async transcribe(value) {
        transcribedAudio = value;
        return { transcript: "I like dinosaurs" };
      },
    });
    assert.equal(transcribedAudio, audio);
    assert.equal(transcript, "I like dinosaurs");
  });

  it("forwards one abort signal through recording and transcription", async () => {
    const controller = new AbortController();
    const audio = new Blob(["audio"], { type: "audio/webm" });
    let recordSignal;
    let transcribeSignal;

    await captureOnboardingAnswer({
      signal: controller.signal,
      async record(options) {
        recordSignal = options?.signal;
        return audio;
      },
      async transcribe(_audio, options) {
        transcribeSignal = options?.signal;
        return { transcript: "I like dinosaurs" };
      },
    });

    assert.equal(recordSignal, controller.signal);
    assert.equal(transcribeSignal, controller.signal);
  });
});

describe("Peppa acknowledgment", () => {
  it("shows one acknowledgment and an immediate Next action", () => {
    const html = renderToStaticMarkup(
      createElement(OnboardingAcknowledgment, {
        acknowledgment: { text: "Dinosaurs are very stompy!", audio: null },
        operationId: 1,
        onNext() {},
      }),
    );
    assert.match(html, /Dinosaurs are very stompy!/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, />Next</);
    assert.doesNotMatch(html, /PEPPA SAYS/);
    assert.doesNotMatch(html, /<textarea/);
  });

  it("plays base64 MP3, advances on completion, and revokes its URL", async () => {
    let ended;
    let playCalls = 0;
    let advanced = 0;
    let revoked = "";
    const cleanup = beginAcknowledgmentPlayback({
      acknowledgment: {
        text: "Dinosaurs are very stompy!",
        audio: { contentType: "audio/mpeg", base64: "AQID" },
      },
      createAudio(src) {
        assert.equal(src, "blob:acknowledgment");
        return {
          addEventListener(event, listener) {
            if (event === "ended") ended = listener;
          },
          pause() {},
          play() {
            playCalls += 1;
            return Promise.resolve();
          },
          removeEventListener() {},
        };
      },
      createObjectURL(blob) {
        assert.equal(blob.type, "audio/mpeg");
        assert.equal(blob.size, 3);
        return "blob:acknowledgment";
      },
      onAdvance() {
        advanced += 1;
      },
      revokeObjectURL(url) {
        revoked = url;
      },
    });

    await Promise.resolve();
    assert.equal(playCalls, 1);
    ended();
    assert.equal(advanced, 1);
    cleanup();
    assert.equal(revoked, "blob:acknowledgment");
  });

  it("uses a readable no-audio delay and ignores stale playback", () => {
    let scheduled;
    let advanced = 0;
    const cleanup = beginAcknowledgmentPlayback({
      acknowledgment: { text: "Lovely!", audio: null },
      onAdvance() {
        advanced += 1;
      },
      setTimer(callback, delay) {
        assert.ok(delay >= 1_500);
        scheduled = callback;
        return 7;
      },
      clearTimer(id) {
        assert.equal(id, 7);
      },
    });
    cleanup();
    scheduled();
    assert.equal(advanced, 0);
  });
});

describe("profile summary editor", () => {
  it("renders name, age, and the conversational description with a realtime onboarding action", () => {
    const html = renderToStaticMarkup(
      createElement(ProfileEditorView, {
        drafts: {
          name: "Mia",
          age: "30",
          description: "Mia is thirty and loves pandas and fast red cars.",
          favoriteAnimals: "pandas",
        },
        fieldErrors: {},
        isSaving: false,
        onCancel() {},
        onClose() {},
        onRedoOnboarding() {},
        onSave() {},
        onValueChange() {},
        pageError: "",
      }),
    );

    assert.doesNotMatch(
      html,
      /Your profile|Keep the basics up to date|Want another little chat|Redo the short onboarding conversation/,
    );
    assert.equal((html.match(/<input/g) ?? []).length, 2);
    assert.equal((html.match(/<textarea/g) ?? []).length, 1);
    assert.match(html, /<label[^>]*for="profile-name"[^>]*>.*Name/s);
    assert.match(html, /<input[^>]*id="profile-age"[^>]*type="text"/);
    assert.doesNotMatch(
      html,
      /<input[^>]*id="profile-age"[^>]*(?:inputmode="numeric"|min="3"|max="17")/,
    );
    assert.match(html, /value="Mia"/);
    assert.match(html, /value="30"/);
    assert.match(html, /<label[^>]*for="profile-description"[^>]*>.*About Mia/s);
    assert.match(
      html,
      /<textarea[^>]*id="profile-description"[^>]*maxlength="2000"[^>]*>Mia is thirty and loves pandas and fast red cars\.<\/textarea>/i,
    );
    assert.ok(
      html.indexOf("Mia is thirty and loves pandas") >
        html.indexOf('id="profile-age"'),
    );
    assert.match(html, /<img[^>]*alt="Peppa smiling"[^>]*peppa-happy\.webp/);
    assert.match(html, />Chat with Peppa again</);
    assert.doesNotMatch(html, /pig pal/i);
    assert.match(html, />Save changes</);
    assert.doesNotMatch(
      html,
      /What animals do you like|你喜欢什么动物|Replay|Speak answer/,
    );
  });

  it("keeps the basic form and navigation actions available while idle", () => {
    const html = renderToStaticMarkup(
      createElement(ProfileEditorView, {
        drafts: { name: "Mia", age: "8" },
        fieldErrors: {},
        isSaving: false,
        onCancel() {},
        onClose() {},
        onRedoOnboarding() {},
        onSave() {},
        onValueChange() {},
        pageError: "",
      }),
    );
    const close = html.match(
      /<button[^>]*aria-label="Close profile editor"[^>]*>/,
    )?.[0];
    const cancel = html.match(/<button[^>]*>Cancel<\/button>/)?.[0];
    const save = html.match(/<button[^>]*>Save changes<\/button>/)?.[0];
    const redo = html.match(
      /<button[^>]*>Chat with Peppa again<\/button>/,
    )?.[0];

    assert.doesNotMatch(html, /<fieldset disabled="">/);
    assert.doesNotMatch(close, /disabled/);
    assert.doesNotMatch(cancel, /disabled/);
    assert.doesNotMatch(redo, /disabled/);
    assert.doesNotMatch(save, /disabled/);
  });

  it("blocks closing, canceling, and saving while a save is active", () => {
    const html = renderToStaticMarkup(
      createElement(ProfileEditorView, {
        drafts: { age: "I am eight" },
        fieldErrors: {},
        isSaving: true,
        onCancel() {},
        onClose() {},
        onRedoOnboarding() {},
        onSave() {},
        onValueChange() {},
        pageError: "",
      }),
    );
    const buttons = [
      html.match(/<button[^>]*aria-label="Close profile editor"[^>]*>/)?.[0],
      html.match(/<button[^>]*>Cancel<\/button>/)?.[0],
      html.match(
        /<button[^>]*>Chat with Peppa again<\/button>/,
      )?.[0],
      html.match(/<button[^>]*>Saving…<\/button>/)?.[0],
    ];

    assert.ok(buttons.every((button) => button?.includes('disabled=""')));
  });

  it("clears profile work through shared route teardown", () => {
    assert.match(
      gateSource,
      /const clearProfileEditor = useCallback\(\(\) => \{\s*teardownProfileResources\(\);/,
    );
    assert.match(
      gateSource,
      /const closeProfileEditor = useCallback\(\(\) => \{[\s\S]*?clearProfileEditor\(\);/,
    );
  });

  it("derives the three editable profile drafts and updates them immutably", () => {
    const state = {
      profile: {
        name: "Mia",
        age: 8,
        description: "Mia is eight and likes dinosaurs.",
        answers: emptyAnswers({
          favoriteAnimals: {
            question: "What animals do you like?",
            rawAnswer: "I like dinosaurs",
            summary: "Likes dinosaurs.",
            acknowledgment: "Dinosaurs are stompy!",
            enrichmentStatus: "generated",
            answeredAt: "2026-07-06T10:30:00.000Z",
          },
        }),
      },
      questions: [
        question({ answerKey: "name" }),
        question(),
        question({ answerKey: "favoriteAnimals" }),
      ],
    };
    assert.deepEqual(profileDraftsFromState(state), {
      name: "Mia",
      age: "8",
      description: "Mia is eight and likes dinosaurs.",
    });
    const original = { name: "Mia" };
    assert.deepEqual(updateProfileDraft(original, "name", "Maya"), {
      name: "Maya",
    });
    assert.deepEqual(original, { name: "Mia" });
  });

  it("advances profile acknowledgments one at a time", () => {
    const acknowledgments = [
      { text: "Name saved!", audio: null },
      { text: "Age saved!", audio: null },
    ];
    assert.deepEqual(nextProfileAcknowledgment(acknowledgments, 0), {
      acknowledgment: acknowledgments[1],
      index: 1,
    });
    assert.equal(nextProfileAcknowledgment(acknowledgments, 1), null);
  });

  it("clears owned profile work on route exit and reloads after re-entry", () => {
    assert.equal(
      typeof createProfileRouteLifecycle,
      "function",
      "Expected an executable profile route lifecycle",
    );

    let generation = 0;
    let loadCount = 0;
    let profile = null;
    let profileError = "";
    let profileLoading = false;
    let pendingAcknowledgment = null;
    let controller = null;
    let exitCount = 0;

    function startOperation() {
      generation += 1;
      const operation = generation;
      const operationController = new AbortController();
      controller = operationController;
      return {
        complete(callback) {
          if (operation === generation && !operationController.signal.aborted) {
            callback();
          }
        },
      };
    }

    function loadCurrentProfile(name) {
      loadCount += 1;
      profileLoading = true;
      const operation = startOperation();
      operation.complete(() => {
        profile = name;
        profileLoading = false;
      });
    }

    const lifecycle = createProfileRouteLifecycle(false, {
      onExit() {
        exitCount += 1;
        generation += 1;
        controller?.abort();
        controller = null;
        profile = null;
        profileError = "";
        profileLoading = false;
        if (pendingAcknowledgment?.kind === "profile") {
          pendingAcknowledgment = null;
        }
      },
    });

    assert.equal(lifecycle.update(false), null);
    assert.equal(lifecycle.update(true), "entered");
    loadCurrentProfile("FIRST PROFILE");
    assert.equal(profile, "FIRST PROFILE");

    pendingAcknowledgment = { kind: "profile" };
    const lateSave = startOperation();
    assert.equal(lifecycle.update(true), null);
    assert.equal(lifecycle.update(false), "exited");
    assert.equal(exitCount, 1);
    assert.equal(profile, null);
    assert.equal(profileLoading, false);
    assert.equal(profileError, "");
    assert.equal(pendingAcknowledgment, null);

    lateSave.complete(() => {
      profileError = "STALE SAVE";
    });
    assert.equal(profileError, "");

    assert.equal(lifecycle.update(false), null);
    assert.equal(lifecycle.update(true), "entered");
    loadCurrentProfile("FRESH PROFILE");
    assert.equal(loadCount, 2);
    assert.equal(profile, "FRESH PROFILE");
  });

  it("aborts superseded and exited profile operations", () => {
    assert.equal(
      typeof createProfileOperationBoundary,
      "function",
      "Expected an executable profile operation boundary",
    );

    let generation = 0;
    const boundary = createProfileOperationBoundary(() => {
      generation += 1;
      return generation;
    });
    const first = boundary.begin();
    const second = boundary.begin();
    assert.equal(first.operation, 1);
    assert.equal(second.operation, 2);
    assert.equal(first.controller.signal.aborted, true);
    assert.equal(second.controller.signal.aborted, false);

    boundary.finish(first.controller);
    boundary.cancel();
    assert.equal(second.controller.signal.aborted, true);

    const third = boundary.begin();
    boundary.finish(third.controller);
    boundary.cancel();
    assert.equal(third.controller.signal.aborted, false);
  });

  it("rejects deferred profile completions across Back and unmount", async () => {
    assert.equal(
      typeof createProfileOperationOwnership,
      "function",
      "Expected executable profile operation ownership",
    );

    let generation = 0;
    let abortCount = 0;
    let stateWrites = 0;
    let refreshCalls = 0;
    let navigationCalls = 0;
    const boundary = createProfileOperationBoundary(() => {
      generation += 1;
      return generation;
    });
    const ownership = createProfileOperationOwnership({
      getCurrentOperation: () => generation,
      initialIsProfileRoute: true,
    });

    const supersededOperation = boundary.begin();
    assert.equal(ownership.isCurrent(supersededOperation), true);
    generation += 1;
    assert.equal(ownership.isCurrent(supersededOperation), false);
    boundary.finish(supersededOperation.controller);

    const abortedOperation = boundary.begin();
    assert.equal(ownership.isCurrent(abortedOperation), true);
    abortedOperation.controller.abort();
    assert.equal(ownership.isCurrent(abortedOperation), false);
    boundary.finish(abortedOperation.controller);

    function deferred() {
      let resolve;
      const promise = new Promise((next) => {
        resolve = next;
      });
      return { promise, resolve };
    }

    function settleLater(active, pending) {
      return pending.promise.then(() => {
        if (!ownership.isCurrent(active)) return;
        stateWrites += 1;
        refreshCalls += 1;
        navigationCalls += 1;
      });
    }

    const backOperation = boundary.begin();
    backOperation.controller.signal.addEventListener("abort", () => {
      abortCount += 1;
    });
    const backDeferred = deferred();
    const backSettlement = settleLater(backOperation, backDeferred);

    ownership.setProfileRoute(false);
    backDeferred.resolve();
    await backSettlement;
    assert.equal(abortCount, 0);
    assert.deepEqual(
      { navigationCalls, refreshCalls, stateWrites },
      { navigationCalls: 0, refreshCalls: 0, stateWrites: 0 },
    );

    teardownProfileOperationResources({
      boundary,
      invalidateOperation() {
        generation += 1;
      },
      resetLoadOperation() {},
    });
    assert.equal(abortCount, 1);

    ownership.setProfileRoute(true);
    const unmountOperation = boundary.begin();
    unmountOperation.controller.signal.addEventListener("abort", () => {
      abortCount += 1;
    });
    const unmountDeferred = deferred();
    const unmountSettlement = settleLater(unmountOperation, unmountDeferred);

    ownership.unmount();
    teardownProfileOperationResources({
      boundary,
      invalidateOperation() {
        generation += 1;
      },
      resetLoadOperation() {},
    });
    unmountDeferred.resolve();
    await unmountSettlement;

    assert.equal(abortCount, 2);
    assert.deepEqual(
      { navigationCalls, refreshCalls, stateWrites },
      { navigationCalls: 0, refreshCalls: 0, stateWrites: 0 },
    );

    assert.match(
      gateSource,
      /useIsomorphicLayoutEffect\(\(\) => \{[\s\S]*?ownership\?\.unmount\(\);[\s\S]*?teardownProfileResources\(\);/,
    );
  });

  it("tears down active profile resources when the gate unmounts", () => {
    assert.equal(
      typeof teardownProfileOperationResources,
      "function",
      "Expected a shared no-state-write profile resource teardown",
    );

    let generation = 0;
    let profileLoadOperation = null;
    const boundary = createProfileOperationBoundary(() => {
      generation += 1;
      return generation;
    });
    const active = boundary.begin();
    profileLoadOperation = active.operation;

    teardownProfileOperationResources({
      boundary,
      invalidateOperation() {
        generation += 1;
      },
      resetLoadOperation() {
        profileLoadOperation = null;
      },
    });

    assert.equal(active.controller.signal.aborted, true);
    assert.equal(generation, 2);
    assert.equal(profileLoadOperation, null);
  });

  it("does not invalidate refreshed data after an explicitly handled profile exit", () => {
    let unexpectedExitCleanup = 0;
    const lifecycle = createProfileRouteLifecycle(true, {
      onExit() {
        unexpectedExitCleanup += 1;
      },
    });
    assert.equal(
      typeof lifecycle.markExitHandled,
      "function",
      "Expected explicit exits to be marked before navigation",
    );

    lifecycle.markExitHandled();
    assert.equal(lifecycle.update(false), "exited");
    assert.equal(unexpectedExitCleanup, 0);
  });
});

function emptyAnswers(responses = {}) {
  return {
    schemaVersion: 2,
    questionnaireVersion: 2,
    responses,
    legacyAnswers: null,
  };
}

function fullState(overrides = {}) {
  return {
    mode: "full",
    profile: {
      name: "Mia",
      age: null,
      answers: emptyAnswers(),
      questionnaireVersion: 2,
      currentQuestionKey: "name",
      onboardingStatus: "not_started",
      completedAt: null,
    },
    questionnaire: { version: 2 },
    question: question({
      answerKey: "name",
      position: 1,
      promptEn: "Hi! I'm Peppa. What's your name?",
      promptZh: "你好！我是佩奇。你叫什么名字？",
      audio: {
        id: "onboarding-v2-name",
        src: "/assets/audio/onboarding-v2-name.mp3",
        text: "Hi! I'm Peppa. What's your name?",
      },
    }),
    progress: { answered: 0, current: 1, total: 6 },
    canBypass: false,
    ...overrides,
  };
}

function renderGate(overrides = {}) {
  return renderToStaticMarkup(
    createElement(
      OnboardingGateView,
      {
        acknowledgment: null,
        completedOnboardingFallback: createElement(
          "div",
          { "data-completed-redirect": true },
          "COMPLETED REDIRECT",
        ),
        data: null,
        isOnboardingRoute: true,
        isProfileLoading: false,
        isProfileRoute: false,
        isLoading: false,
        loadError: "",
        onAcknowledgmentNext() {},
        onCloseProfileRoute() {},
        onRetry() {},
        onRetryProfile() {},
        onSkip() {},
        onStart() {},
        onboardingFallback: createElement(
          "div",
          { "data-onboarding-redirect": true },
          "ONBOARDING REDIRECT",
        ),
        profileEditor: null,
        profileLoadError: "",
        questionProps: null,
        redoOnboarding: false,
        started: false,
        ...overrides,
      },
      createElement("div", { "data-lesson": true }, "LESSON CONTENT"),
    ),
  );
}

describe("onboarding and profile gate", () => {
  it("does not sync question state before the initial onboarding load finishes", () => {
    assert.equal(typeof shouldSyncActiveQuestion, "function");
    assert.equal(shouldSyncActiveQuestion(null, null), false);
    assert.equal(shouldSyncActiveQuestion(fullState().profile, null), false);
    assert.equal(shouldSyncActiveQuestion(null, fullState().question), false);
    assert.equal(
      shouldSyncActiveQuestion(fullState().profile, fullState().question),
      true,
    );
  });

  it("routes incomplete learners to onboarding and completed learners away from it", () => {
    const protectedPage = renderGate({
      data: fullState(),
      isOnboardingRoute: false,
    });
    assert.match(protectedPage, /ONBOARDING REDIRECT/);
    assert.doesNotMatch(protectedPage, /LESSON CONTENT|Meet Peppa/);

    const completedOnboarding = renderGate({
      data: fullState({
        canBypass: false,
        profile: {
          ...fullState().profile,
          onboardingStatus: "completed",
        },
      }),
    });
    assert.match(completedOnboarding, /COMPLETED REDIRECT/);
    assert.doesNotMatch(completedOnboarding, /LESSON CONTENT|Meet Peppa/);
  });

  it("routes bypass-only sessions away from onboarding", () => {
    const html = renderGate({
      data: { mode: "bypass-only", canBypass: true },
      isOnboardingRoute: true,
    });
    assert.match(html, /COMPLETED REDIRECT/);
    assert.doesNotMatch(html, /LESSON CONTENT/);
  });

  it("routes bypass-only sessions away from unavailable profile editing", () => {
    const html = renderGate({
      data: { mode: "bypass-only", canBypass: true },
      isOnboardingRoute: false,
      isProfileRoute: true,
    });
    assert.match(html, /COMPLETED REDIRECT/);
    assert.doesNotMatch(html, /LESSON CONTENT/);
  });

  it("keeps profile loading and retry errors on the profile route", () => {
    const loading = renderGate({
      data: fullState({ canBypass: true }),
      isOnboardingRoute: false,
      isProfileLoading: true,
      isProfileRoute: true,
    });
    assert.match(loading, /role="status"/);
    assert.match(loading, /Loading your profile/);
    assert.doesNotMatch(loading, /LESSON CONTENT/);

    const failed = renderGate({
      data: fullState({ canBypass: true }),
      isOnboardingRoute: false,
      isProfileRoute: true,
      profileLoadError: "Profile service is unavailable.",
    });
    assert.match(failed, /role="alert"/);
    assert.match(failed, /Profile service is unavailable\./);
    assert.match(failed, />Retry</);
    assert.match(failed, />Back to main menu</);
    assert.doesNotMatch(failed, /LESSON CONTENT/);
  });

  it("hides lessons behind loading, errors, and explicit Start", () => {
    assert.doesNotMatch(renderGate({ isLoading: true }), /LESSON CONTENT/);
    const failed = renderGate({ loadError: "Questions are unavailable." });
    assert.match(failed, />Retry</);
    assert.match(failed, />Skip for now</);
    assert.doesNotMatch(failed, /LESSON CONTENT/);

    const start = renderGate({ data: fullState() });
    assert.match(start, /Meet Peppa/);
    assert.match(start, /six quick questions/i);
    assert.doesNotMatch(start, /PARROT ENGLISH/);
    assert.doesNotMatch(start, /What&#x27;s your name\?/);
    assert.doesNotMatch(start, /LESSON CONTENT/);
  });

  it("shows acknowledgment before the next question or completed lesson", () => {
    const html = renderGate({
      acknowledgment: {
        acknowledgment: { text: "Mia is a lovely name!", audio: null },
        operationId: 4,
      },
      data: fullState({ canBypass: true }),
      started: true,
    });
    assert.match(html, /Mia is a lovely name!/);
    assert.doesNotMatch(html, /LESSON CONTENT/);
    assert.doesNotMatch(html, /<textarea/);
  });

  it("renders lessons after completion or current-session bypass", () => {
    const html = renderGate({
      data: fullState({
        canBypass: true,
        profile: {
          ...fullState().profile,
          onboardingStatus: "in_progress",
        },
      }),
      isOnboardingRoute: false,
    });
    assert.match(html, /LESSON CONTENT/);
    assert.doesNotMatch(html, /aria-label="Edit learner profile"/);

    const bypass = renderGate({
      data: { mode: "bypass-only", canBypass: true },
      isOnboardingRoute: false,
    });
    assert.match(bypass, /LESSON CONTENT/);
    assert.doesNotMatch(bypass, /Edit learner profile/);
  });

  it("renders the basic profile editor without bypass controls", () => {
    const html = renderGate({
      data: fullState({ canBypass: true }),
      isOnboardingRoute: false,
      isProfileRoute: true,
      profileEditor: {
        drafts: { name: "Mia", age: "I am eight", description: "" },
        fieldErrors: {},
        isSaving: false,
        onCancel() {},
        onClose() {},
        onRedoOnboarding() {},
        onSave() {},
        onValueChange() {},
        pageError: "",
      },
    });
    assert.match(html, /Edit profile/);
    assert.equal((html.match(/<input/g) ?? []).length, 2);
    assert.equal((html.match(/<textarea/g) ?? []).length, 1);
    assert.match(html, /Chat with Peppa again/);
    assert.doesNotMatch(html, /Skip for now/);
    assert.doesNotMatch(html, /LESSON CONTENT/);
  });

  it("derives editable prose from snapshots with canonical prefills", () => {
    const profile = {
      name: "Mia",
      age: 8,
      answers: emptyAnswers({
        favoriteAnimals: {
          question: "What animals do you like?",
          rawAnswer: "I like dinosaurs",
          summary: "Likes dinosaurs.",
          acknowledgment: "Dinosaurs are stompy!",
          enrichmentStatus: "generated",
          answeredAt: "2026-07-06T10:30:00.000Z",
        },
      }),
    };
    assert.equal(answerForQuestion(profile, question({ answerKey: "name" })), "Mia");
    assert.equal(answerForQuestion(profile, question()), "8");
    assert.equal(
      answerForQuestion(profile, question({ answerKey: "favoriteAnimals" })),
      "I like dinosaurs",
    );
  });

  it("uses the server-completed final answer response directly", async () => {
    const completed = fullState({
      canBypass: true,
      question: null,
      profile: {
        ...fullState().profile,
        onboardingStatus: "completed",
      },
      acknowledgment: { text: "Lovely stories!", audio: null },
    });
    let calls = 0;
    const result = await saveQuestionAndAdvance({
      questionKey: "favoriteStoryTopics",
      rawAnswer: "I like space stories",
      async save() {
        calls += 1;
        return completed;
      },
    });
    assert.equal(calls, 1);
    assert.equal(result, completed);
  });

  it("composes route-aware onboarding inside the authenticated shell", () => {
    assert.match(
      appSource,
      /<AuthGate[\s\S]*?compactSessionBar=\{isConversationRoute\}[\s\S]*?signedOutFallback=\{/,
    );
    assert.match(appSource, /<OnboardingGate[\s\S]*?isOnboardingRoute=/);
    assert.match(appSource, /completedOnboardingFallback=/);
    assert.match(appSource, /onboardingFallback=/);
    assert.match(appSource, /isProfileRoute=/);
    assert.match(gateSource, /onOpen:\s*onOpenProfileRoute/);
    assert.match(gateSource, /isProfileRoute[\s\S]*?handleOpenProfile/);
  });

  it("keeps responsive reduced-motion styles", () => {
    assert.match(styles, /\.onboarding-screen\s*\{[^}]*overflow-y:\s*auto/s);
    assert.match(styles, /\.onboarding-(?:next|skip|icon)-button:focus-visible/);
    assert.match(styles, /@media\s*\(max-width:\s*720px\)[\s\S]*onboarding/);
    assert.match(
      styles,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*onboarding/s,
    );
    assert.match(gateSource, /useProfileAccountAction/);
    assert.doesNotMatch(gateSource, /profile-edit-button/);
  });
});
