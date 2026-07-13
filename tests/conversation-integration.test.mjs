import assert from "node:assert/strict";
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
const { LearnerProfileGateView } = await vite.ssrLoadModule(
  "/src/learner-profile/LearnerProfileGate.tsx",
);
const {
  mergeConversationTurns,
  selectLearnerProfileExperience,
} = await vite.ssrLoadModule("/src/conversation/usePeppaConversation.ts");

after(async () => {
  await vite.close();
});

function fullState(experienceMode) {
  return {
    canBypass: false,
    experienceMode,
    mode: "full",
    profile: {
      age: null,
      answers: {
        legacyAnswers: null,
        questionnaireVersion: 2,
        responses: {},
        schemaVersion: 2,
      },
      completedAt: null,
      currentQuestionKey: "name",
      name: null,
      profileStatus: "not_started",
      questionnaireVersion: 2,
    },
    progress: { answered: 0, current: 1, total: 6 },
    question: {
      answerKey: "name",
      audio: null,
      maxLength: 120,
      position: 1,
      promptEn: "What is your name?",
      promptZh: "你叫什么名字？",
      required: true,
    },
    questionnaire: { version: 2 },
  };
}

function conversationProps(overrides = {}) {
  return {
    error: "",
    microphoneEnabled: true,
    onBack() {},
    onFinish() {},
    onStart() {},
    onToggleMicrophone() {},
    status: "ready",
    turns: [],
    ...overrides,
  };
}

function renderGate(overrides = {}) {
  return renderToStaticMarkup(
    createElement(
      LearnerProfileGateView,
      {
        acknowledgment: null,
        completedLearnerProfileFallback: createElement("p", null, "COMPLETE"),
        conversationProps: null,
        data: fullState("form"),
        isConversationRoute: false,
        isLoading: false,
        isLearnerProfileRoute: true,
        isProfileLoading: false,
        isProfileRoute: false,
        loadError: "",
        onAcknowledgmentNext() {},
        onCloseProfileRoute() {},
        onRetry() {},
        onRetryProfile() {},
        onSkip() {},
        onStart() {},
        learnerProfileFallback: createElement("p", null, "ONBOARD"),
        profileEditor: null,
        profileLoadError: "",
        questionProps: null,
        redoLearnerProfile: false,
        started: false,
        ...overrides,
      },
      createElement("p", null, "LESSON"),
    ),
  );
}

describe("realtime learner-profile gate integration", () => {
  it("selects realtime from the server while keeping form fallback sticky", () => {
    assert.equal(selectLearnerProfileExperience("realtime", false), "realtime");
    assert.equal(selectLearnerProfileExperience("realtime", true), "form");
    assert.equal(selectLearnerProfileExperience("form", false), "form");

    const realtime = renderGate({
      conversationProps: conversationProps(),
      data: fullState("realtime"),
    });
    assert.match(realtime, /Chat with Peppa/);

    const fallback = renderGate({ data: fullState("form") });
    assert.match(fallback, /Meet Peppa/);
    assert.doesNotMatch(fallback, /Chat with Peppa/);
  });

  it("keeps retry and a large finish action visible after a voice-room failure", () => {
    const html = renderGate({
      conversationProps: conversationProps({
        error: "The voice room took a break.",
        status: "error",
      }),
      data: fullState("realtime"),
    });

    assert.match(html, /The voice room took a break/);
    assert.doesNotMatch(html, /Use the form instead/);
    assert.match(html, /Try again/);
    assert.match(html, /Finish conversation/);
    assert.doesNotMatch(html, /Type instead|aria-label="Type your answer"/);
  });

  it("lets a completed learner deliberately start a profile-edit conversation", () => {
    const completed = fullState("realtime");
    completed.profile.profileStatus = "completed";
    completed.profile.completedAt = "2026-07-10T08:00:00.000Z";

    const ordinaryVisit = renderGate({ data: completed });
    assert.match(ordinaryVisit, /COMPLETE/);

    const redoVisit = renderGate({
      conversationProps: conversationProps(),
      data: completed,
      redoLearnerProfile: true,
    });
    assert.match(redoVisit, /Chat with Peppa/);
    assert.doesNotMatch(redoVisit, /COMPLETE/);
  });

  it("renders the same conversation as a standalone feature for a completed learner", () => {
    const completed = fullState("realtime");
    completed.profile.profileStatus = "completed";
    completed.profile.completedAt = "2026-07-10T08:00:00.000Z";

    const html = renderGate({
      conversationProps: conversationProps(),
      data: completed,
      isConversationRoute: true,
      isLearnerProfileRoute: false,
    });

    assert.match(html, /Chat with Peppa/);
    assert.doesNotMatch(html, /LESSON|COMPLETE/);
  });

  it("merges the durable transcript without duplicating live turns", () => {
    assert.deepEqual(
      mergeConversationTurns(
        [{ id: "live", role: "assistant", text: "Hi there!" }],
        [
          { id: "saved", role: "user", text: "My name is Mia." },
          { id: "live", role: "assistant", text: "Hi there!" },
        ],
      ),
      [
        { id: "saved", role: "user", text: "My name is Mia." },
        { id: "live", role: "assistant", text: "Hi there!" },
      ],
    );
  });
});
