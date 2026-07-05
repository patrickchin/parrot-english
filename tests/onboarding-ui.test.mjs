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
const gateModule = await vite.ssrLoadModule("/src/OnboardingGate.tsx");
const {
  OnboardingGateView,
  addArrayAnswer,
  answerForQuestion,
  saveQuestionAndAdvance,
  submissionValue,
  toggleArrayAnswer,
} = gateModule;
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

after(async () => {
  await vite.close();
});

function question(overrides = {}) {
  return {
    answerKey: "age",
    position: 1,
    promptEn: "How old are you?",
    promptZh: "你几岁了？",
    answerType: "number",
    cardinality: "scalar",
    required: true,
    options: null,
    validation: { min: 3, max: 17 },
    audio: {
      id: "onboarding-age",
      src: "/assets/audio/onboarding-age.mp3",
      text: "How old are you?",
    },
    ...overrides,
  };
}

function renderQuestion(overrides = {}) {
  return renderToStaticMarkup(
    createElement(OnboardingQuestionView, {
      fieldError: "",
      mode: "onboarding",
      onAddPending() {},
      onPendingChange() {},
      onRemoveValue() {},
      onReplay() {},
      onSkip() {},
      onSkipQuestion() {},
      onSubmit() {},
      onToggleOption() {},
      onTranscribe() {},
      pendingValue: "",
      progress: { answered: 0, current: 1, total: 5 },
      question: question(),
      status: "idle",
      value: "",
      ...overrides,
    }),
  );
}

describe("one-question onboarding view", () => {
  it("renders one accessible scalar form with permanent typed and voice controls", () => {
    const html = renderQuestion();

    assert.equal((html.match(/<h1/g) ?? []).length, 1);
    assert.match(html, /How old are you\?/);
    assert.match(html, /你几岁了？/);
    assert.match(html, /Question 1 of 5/);
    assert.match(html, /type="number"/);
    assert.match(html, /min="3"/);
    assert.match(html, /max="17"/);
    assert.match(html, /aria-label="Replay question"/);
    assert.match(html, /aria-label="Speak your answer"/);
    assert.match(html, />Next</);
    assert.match(html, />Skip for now</);
  });

  it("renders array chips, one editable pending value, and toggle suggestions", () => {
    const html = renderQuestion({
      pendingValue: "Paw Patrol",
      question: question({
        answerKey: "favoriteCartoons",
        promptEn: "Which cartoons do you like?",
        promptZh: "你喜欢哪些动画片？",
        answerType: "text",
        cardinality: "array",
        options: ["Bluey", "Paw Patrol", "Peppa Pig"],
        validation: { maxItems: 4, maxLength: 50 },
      }),
      value: ["Bluey"],
    });

    assert.match(html, /aria-label="Remove Bluey"/);
    assert.match(html, /value="Paw Patrol"/);
    assert.match(html, /aria-label="Add answer"/);
    assert.match(html, /aria-pressed="true"[^>]*>Bluey</);
    assert.match(html, /aria-pressed="false"[^>]*>Peppa Pig</);
    assert.equal(
      (html.match(/<h1[^>]*class="onboarding-question-title"/g) ?? []).length,
      1,
    );
  });

  it("keeps field errors visible, locks saving controls, and omits Skip in profile mode", () => {
    const html = renderQuestion({
      fieldError: "Please enter a number from 3 to 17.",
      mode: "profile",
      status: "saving",
      value: 99,
    });

    assert.match(html, /role="alert"/);
    assert.match(html, /Please enter a number from 3 to 17\./);
    assert.match(html, /disabled=""/);
    assert.match(html, />Saving…</);
    assert.doesNotMatch(html, /Skip for now/);
  });

  it("shows microphone progress without removing the editable form fallback", () => {
    const recording = renderQuestion({ status: "recording" });
    assert.match(recording, /Listening…/);
    assert.match(recording, /type="number"/);

    const transcribing = renderQuestion({ status: "transcribing" });
    assert.match(transcribing, /Writing what I heard…/);
    assert.match(transcribing, /type="number"/);
  });

  it("offers a per-question skip only for optional onboarding questions", () => {
    const optional = renderQuestion({
      question: question({ required: false }),
    });
    assert.match(optional, />Skip question</);

    assert.doesNotMatch(renderQuestion(), />Skip question</);
    assert.doesNotMatch(
      renderQuestion({
        mode: "profile",
        question: question({ required: false }),
      }),
      />Skip question</,
    );
  });
});

describe("onboarding audio and transcription helpers", () => {
  it("plays introduction then the first question only after Start", async () => {
    const lines = [];
    const introduction = {
      id: "onboarding-introduction",
      src: "/assets/audio/onboarding-introduction.mp3",
      text: "Hi! I'm Peppa.",
    };
    const questionAudio = question().audio;

    await playOnboardingStart({
      introduction,
      questionAudio,
      async playSequence(options) {
        lines.push(...options.lines);
      },
    });

    assert.deepEqual(
      lines.map(({ audioSrc, text }) => ({ audioSrc, text })),
      [
        { audioSrc: introduction.src, text: introduction.text },
        { audioSrc: questionAudio.src, text: questionAudio.text },
      ],
    );
  });

  it("replays only the current question", async () => {
    const calls = [];
    await replayOnboardingQuestion(question().audio, {
      async playLine(options) {
        calls.push(options);
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].audioSrc, "/assets/audio/onboarding-age.mp3");
  });

  it("returns one editable transcript without persisting it", async () => {
    const audio = new Blob(["audio"], { type: "audio/webm" });
    let transcribedAudio;
    let saveCalls = 0;

    const transcript = await captureOnboardingAnswer({
      async record() {
        return audio;
      },
      async transcribe(value) {
        transcribedAudio = value;
        return { transcript: "Paw Patrol" };
      },
      save() {
        saveCalls += 1;
      },
    });

    assert.equal(transcribedAudio, audio);
    assert.equal(transcript, "Paw Patrol");
    assert.equal(saveCalls, 0);
  });
});

function renderGate(overrides = {}) {
  return renderToStaticMarkup(
    createElement(
      OnboardingGateView,
      {
        data: null,
        isLoading: false,
        loadError: "",
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
  const incompleteData = {
    mode: "full",
    profile: {
      name: "Mia",
      age: null,
      answers: { name: "Mia" },
      questionnaireVersion: 1,
      currentQuestionKey: null,
      onboardingStatus: "not_started",
      completedAt: null,
    },
    questionnaire: {
      version: 1,
      introductionAudio: {
        id: "onboarding-introduction",
        src: "/assets/audio/onboarding-introduction.mp3",
        text: "Hi! I'm Peppa.",
      },
    },
    question: question(),
    progress: { answered: 0, current: 1, total: 5 },
    canBypass: false,
  };

  it("hides lesson children behind loading and retryable error states", () => {
    const loading = renderGate({ isLoading: true });
    assert.match(loading, /Loading your questions…/);
    assert.doesNotMatch(loading, /LESSON CONTENT/);

    const failed = renderGate({ loadError: "Questions are unavailable." });
    assert.match(failed, /role="alert"/);
    assert.match(failed, />Retry</);
    assert.match(failed, />Skip for now</);
    assert.doesNotMatch(failed, /LESSON CONTENT/);
  });

  it("requires an explicit Start before showing the first or resumed question", () => {
    const start = renderGate({ data: incompleteData });
    assert.match(start, /Meet Peppa/);
    assert.match(start, />Start</);
    assert.doesNotMatch(start, /How old are you\?/);
    assert.doesNotMatch(start, /LESSON CONTENT/);

    const questionHtml = renderGate({
      data: incompleteData,
      started: true,
      questionProps: {
        fieldError: "",
        mode: "onboarding",
        onAddPending() {},
        onPendingChange() {},
        onRemoveValue() {},
        onReplay() {},
        onSkip() {},
        onSkipQuestion() {},
        onSubmit() {},
        onToggleOption() {},
        onTranscribe() {},
        onValueChange() {},
        pendingValue: "",
        progress: incompleteData.progress,
        question: incompleteData.question,
        status: "idle",
        value: "",
      },
    });
    assert.match(questionHtml, /How old are you\?/);
    assert.doesNotMatch(questionHtml, /LESSON CONTENT/);
  });

  it("renders lesson children after completion or current-session skip", () => {
    const html = renderGate({
      data: {
        ...incompleteData,
        canBypass: true,
        profile: {
          ...incompleteData.profile,
          onboardingStatus: "in_progress",
        },
      },
    });

    assert.match(html, /LESSON CONTENT/);
    assert.match(html, /aria-label="Edit learner profile"/);
    assert.doesNotMatch(html, />Start</);
  });

  it("renders bypass-only lessons without unavailable profile editing", () => {
    const html = renderGate({
      data: { mode: "bypass-only", canBypass: true },
    });

    assert.match(html, /LESSON CONTENT/);
    assert.doesNotMatch(html, /aria-label="Edit learner profile"/);
  });

  it("reuses the one-question form for profile editing without introduction or Skip", () => {
    const html = renderGate({
      data: { ...incompleteData, canBypass: true },
      profileEditor: {
        current: 1,
        total: 6,
        questionProps: {
          fieldError: "",
          mode: "profile",
          onAddPending() {},
          onPendingChange() {},
          onRemoveValue() {},
          onReplay() {},
          onSkip() {},
          onSkipQuestion() {},
          onSubmit() {},
          onToggleOption() {},
          onTranscribe() {},
          onValueChange() {},
          pendingValue: "",
          progress: { answered: 0, current: 1, total: 6 },
          question: question({
            answerKey: "name",
            promptEn: "What name would you like us to use?",
            audio: null,
          }),
          status: "idle",
          value: "Mia",
        },
      },
    });

    assert.match(html, /Edit profile/);
    assert.match(html, /What name would you like us to use\?/);
    assert.match(html, /aria-label="Close profile editor"/);
    assert.doesNotMatch(html, /Meet Peppa/);
    assert.doesNotMatch(html, /Skip for now/);
    assert.doesNotMatch(html, /LESSON CONTENT/);
  });

  it("derives editable drafts and unique array updates without splitting phrases", () => {
    const profile = {
      name: "Mia",
      age: 8,
      answers: {
        name: "Mia",
        age: 8,
        favoriteCartoons: ["Bluey"],
      },
    };
    assert.equal(answerForQuestion(profile, question()), 8);
    assert.deepEqual(
      answerForQuestion(
        profile,
        question({ answerKey: "favoriteCartoons", cardinality: "array" }),
      ),
      ["Bluey"],
    );
    assert.deepEqual(addArrayAnswer(["Bluey"], " Paw Patrol "), [
      "Bluey",
      "Paw Patrol",
    ]);
    assert.deepEqual(addArrayAnswer(["Bluey"], "bluey"), ["Bluey"]);
    assert.deepEqual(toggleArrayAnswer(["Bluey"], "bluey"), []);
    assert.deepEqual(toggleArrayAnswer(["Bluey"], "Paw Patrol"), [
      "Bluey",
      "Paw Patrol",
    ]);
    assert.equal(submissionValue(question(), "8"), 8);
    assert.equal(submissionValue(question(), "eight"), "eight");
  });

  it("uses the server-completed final answer response directly", async () => {
    let saveCalls = 0;
    let completeCalls = 0;
    const completedState = {
      ...incompleteData,
      canBypass: true,
      question: null,
      profile: {
        ...incompleteData.profile,
        onboardingStatus: "completed",
      },
    };

    const result = await saveQuestionAndAdvance({
      questionKey: "favoriteStoryTopics",
      value: ["space"],
      async save() {
        saveCalls += 1;
        return completedState;
      },
      async complete() {
        completeCalls += 1;
        return completedState;
      },
    });

    assert.equal(saveCalls, 1);
    assert.equal(completeCalls, 0);
    assert.equal(result, completedState);
  });

  it("composes AuthGate, OnboardingGate, then LessonExperience", () => {
    assert.match(
      appSource,
      /<AuthGate>\s*<OnboardingGate>\s*<LessonExperience\s*\/>\s*<\/OnboardingGate>\s*<\/AuthGate>/,
    );
  });

  it("provides scroll-safe responsive layout and reduced-motion behavior", () => {
    assert.match(styles, /\.onboarding-screen\s*\{[^}]*overflow-y:\s*auto/s);
    assert.match(styles, /\.onboarding-(?:next|skip|icon)-button:focus-visible/);
    assert.match(styles, /@media\s*\(max-width:\s*720px\)[\s\S]*onboarding/);
    assert.match(
      styles,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*onboarding/s,
    );
  });
});
