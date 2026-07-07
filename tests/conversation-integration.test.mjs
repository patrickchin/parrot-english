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
const { OnboardingGateView } = await vite.ssrLoadModule(
  "/src/OnboardingGate.tsx",
);
const {
  completeConversationReview,
  mergeConversationTurns,
  selectOnboardingExperience,
  updateConversationCandidateStatus,
} = await vite.ssrLoadModule("/src/useConversationOnboarding.ts");

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
      onboardingStatus: "not_started",
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
    candidates: [],
    error: "",
    microphoneEnabled: true,
    onCandidateChange() {},
    onCandidateStatusChange() {},
    onFinish() {},
    onSendText() {},
    onStart() {},
    onSubmitReview() {},
    onToggleMicrophone() {},
    onTypedValueChange() {},
    onUseForm() {},
    status: "ready",
    turns: [],
    typedValue: "",
    ...overrides,
  };
}

function renderGate(overrides = {}) {
  return renderToStaticMarkup(
    createElement(
      OnboardingGateView,
      {
        acknowledgment: null,
        completedOnboardingFallback: createElement("p", null, "COMPLETE"),
        conversationProps: null,
        data: fullState("form"),
        isLoading: false,
        isOnboardingRoute: true,
        isProfileLoading: false,
        isProfileRoute: false,
        loadError: "",
        onAcknowledgmentNext() {},
        onCloseProfileRoute() {},
        onRetry() {},
        onRetryProfile() {},
        onSkip() {},
        onStart() {},
        onboardingFallback: createElement("p", null, "ONBOARD"),
        profileEditor: null,
        profileLoadError: "",
        questionProps: null,
        started: false,
        ...overrides,
      },
      createElement("p", null, "LESSON"),
    ),
  );
}

describe("realtime onboarding gate integration", () => {
  it("selects realtime from the server while keeping form fallback sticky", () => {
    assert.equal(selectOnboardingExperience("realtime", false), "realtime");
    assert.equal(selectOnboardingExperience("realtime", true), "form");
    assert.equal(selectOnboardingExperience("form", false), "form");

    const realtime = renderGate({
      conversationProps: conversationProps(),
      data: fullState("realtime"),
    });
    assert.match(realtime, /Meet your pig pal/);
    assert.doesNotMatch(realtime, /Meet Peppa/);

    const fallback = renderGate({ data: fullState("form") });
    assert.match(fallback, /Meet Peppa/);
    assert.doesNotMatch(fallback, /Meet your pig pal/);
  });

  it("keeps the accessible form action visible after a voice-room failure", () => {
    const html = renderGate({
      conversationProps: conversationProps({
        error: "The voice room took a break.",
        status: "error",
      }),
      data: fullState("realtime"),
    });

    assert.match(html, /The voice room took a break/);
    assert.match(html, /Use the form instead/);
    assert.match(html, /aria-label="Type your answer"/);
  });

  it("refreshes the existing onboarding gate after successful review", async () => {
    const calls = [];
    const result = await completeConversationReview({
      conversationId: "conversation-1",
      decisions: [{ factId: "name", status: "accepted" }],
      async refresh() {
        calls.push("refresh");
      },
      async review(conversationId, decisions) {
        calls.push([conversationId, decisions]);
        return {
          bypassed: true,
          conversationId,
          profileCompleted: false,
        };
      },
    });

    assert.equal(result.bypassed, true);
    assert.deepEqual(calls, [
      ["conversation-1", [{ factId: "name", status: "accepted" }]],
      "refresh",
    ]);
  });

  it("merges the durable transcript and preserves edits after reject-then-keep", () => {
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

    assert.deepEqual(
      updateConversationCandidateStatus(
        [{ id: "name", status: "rejected", value: "Maya" }],
        "name",
        "accepted",
      ),
      [{ id: "name", status: "edited", value: "Maya" }],
    );
  });
});
