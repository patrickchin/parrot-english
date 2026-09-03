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
const { mergeConversationTurns } = await vite.ssrLoadModule(
  "/src/conversation/usePeppaConversation.ts",
);

after(async () => {
  await vite.close();
});

function fullState() {
  return {
    canBypass: false,
    mode: "full",
    profile: {
      age: null,
      answers: {
        description: null,
        questionnaireVersion: 2,
        responses: {},
        schemaVersion: 2,
      },
      completedAt: null,
      currentQuestionKey: "name",
      name: null,
      profileStatus: "not_started",
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
  };
}

function conversationProps(overrides = {}) {
  return {
    audioPlaybackBlocked: false,
    audioPlaybackBusy: false,
    audioPlaybackError: "",
    canFinish: true,
    error: "",
    liveTranscript: "",
    microphoneBusy: false,
    microphoneEnabled: true,
    onBack() {},
    onChooseLesson() {},
    onFinish() {},
    onRepeatAudio() {},
    onRetryVoice() {},
    onStart() {},
    onStartAudio() {},
    onToggleMicrophone() {},
    purpose: "onboarding",
    recoveryPhase: null,
    responseLatencyMs: null,
    status: "ready",
    turnReady: true,
    turns: [],
    voiceRetryUsed: false,
    waitCycle: 0,
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
        data: fullState(),
        isConversationRoute: false,
        isLoading: false,
        isLearnerProfileRoute: true,
        loadError: "",
        onAcknowledgmentNext() {},
        onCloseConversationRoute() {},
        onRetry() {},
        onSkip() {},
        onStart() {},
        learnerProfileFallback: createElement("p", null, "ONBOARD"),
        questionProps: null,
        started: false,
        ...overrides,
      },
      createElement("p", null, "LESSON"),
    ),
  );
}

describe("realtime learner-profile gate integration", () => {
  it("renders realtime onboarding with the form as its local alternative", () => {
    const realtime = renderGate({
      conversationProps: conversationProps(),
      data: fullState(),
    });
    assert.match(realtime, /Help Peppa know you/);

    const fallback = renderGate({ data: fullState() });
    assert.match(fallback, /Answer 6 questions/);
    assert.doesNotMatch(fallback, /Chat with Peppa/);
  });

  it("keeps one matching retry after a voice-room failure", () => {
    const html = renderGate({
      conversationProps: conversationProps({
        error: "The voice room took a break.",
        recoveryPhase: "restart",
        status: "error",
      }),
      data: fullState(),
    });

    assert.match(html, /The voice room took a break/);
    assert.doesNotMatch(html, /Use the form instead/);
    assert.match(html, /Try again/);
    assert.doesNotMatch(html, /Save and finish/);
    assert.doesNotMatch(html, /Finish conversation/);
    assert.doesNotMatch(html, /Type instead|aria-label="Type your answer"/);
  });

  it("renders the same conversation as a standalone feature for a completed learner", () => {
    const completed = fullState();
    completed.profile.profileStatus = "completed";
    completed.profile.completedAt = "2026-07-10T08:00:00.000Z";

    const html = renderGate({
      conversationProps: conversationProps({ purpose: "small-chat" }),
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
          { id: "saved", role: "user", text: "My name is Mary." },
          { id: "live", role: "assistant", text: "Hi there!" },
        ],
      ),
      [
        { id: "saved", role: "user", text: "My name is Mary." },
        { id: "live", role: "assistant", text: "Hi there!" },
      ],
    );
  });
});
