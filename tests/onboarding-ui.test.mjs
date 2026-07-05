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
const gateModule = await vite.ssrLoadModule("/src/OnboardingGate.tsx");
const { OnboardingGateView, answerForQuestion, saveQuestionAndAdvance } =
  gateModule;
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
      fieldError: "Please tell me your age using a number from 3 to 17.",
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
        data: null,
        isLoading: false,
        loadError: "",
        onAcknowledgmentNext() {},
        onCloseProfile() {},
        onOpenProfile() {},
        onRetry() {},
        onSkip() {},
        onStart() {},
        profileEditor: null,
        questionProps: null,
        started: false,
        ...overrides,
      },
      createElement("div", { "data-lesson": true }, "LESSON CONTENT"),
    ),
  );
}

describe("onboarding and profile gate", () => {
  it("hides lessons behind loading, errors, and explicit Start", () => {
    assert.doesNotMatch(renderGate({ isLoading: true }), /LESSON CONTENT/);
    const failed = renderGate({ loadError: "Questions are unavailable." });
    assert.match(failed, />Retry</);
    assert.match(failed, />Skip for now</);
    assert.doesNotMatch(failed, /LESSON CONTENT/);

    const start = renderGate({ data: fullState() });
    assert.match(start, /Meet Peppa/);
    assert.match(start, /six quick questions/i);
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
    });
    assert.match(html, /LESSON CONTENT/);
    assert.match(html, /aria-label="Edit learner profile"/);

    const bypass = renderGate({
      data: { mode: "bypass-only", canBypass: true },
    });
    assert.match(bypass, /LESSON CONTENT/);
    assert.doesNotMatch(bypass, /Edit learner profile/);
  });

  it("reuses the prose form for profile editing without bypass controls", () => {
    const html = renderGate({
      data: fullState({ canBypass: true }),
      profileEditor: {
        current: 1,
        total: 6,
        questionProps: questionProps({
          mode: "profile",
          question: fullState().question,
          value: "Mia",
        }),
      },
    });
    assert.match(html, /Edit profile/);
    assert.match(html, /What&#x27;s your name\?/);
    assert.match(html, /<textarea/);
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

  it("composes gates and keeps responsive reduced-motion styles", () => {
    assert.match(
      appSource,
      /<AuthGate>\s*<OnboardingGate>\s*<LessonExperience\s*\/>\s*<\/OnboardingGate>\s*<\/AuthGate>/,
    );
    assert.match(styles, /\.onboarding-screen\s*\{[^}]*overflow-y:\s*auto/s);
    assert.match(styles, /\.onboarding-(?:next|skip|icon)-button:focus-visible/);
    assert.match(styles, /@media\s*\(max-width:\s*720px\)[\s\S]*onboarding/);
    assert.match(
      styles,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*onboarding/s,
    );
  });
});
