import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
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
const { ConversationSurface } = await vite.ssrLoadModule(
  "/src/conversation/ConversationSurface.tsx",
);
after(async () => {
  await vite.close();
});

function props(overrides = {}) {
  return {
    canFinish: true,
    error: "",
    liveTranscript: "",
    microphoneEnabled: true,
    onBack() {},
    onFinish() {},
    onPromptStyleChange() {},
    onRepeatAudio() {},
    onStart() {},
    onToggleMicrophone() {},
    purpose: "small-chat",
    promptStyle: "tiny-turns",
    responseLatencyMs: null,
    status: "ready",
    turnReady: true,
    turns: [],
    ...overrides,
  };
}

function render(overrides = {}) {
  return renderToStaticMarkup(
    createElement(ConversationSurface, props(overrides)),
  );
}

describe("accessible realtime conversation surface", () => {
  it("lets a learner choose a prompt style before starting small chat", () => {
    const html = render();

    assert.match(html, /Choose how Peppa talks/);
    assert.match(html, /Chat with Peppa/);
    assert.match(html, /peppa\/peppa-happy\.webp/);
    assert.match(html, /<select[^>]*id="peppa-prompt-style"/);
    assert.match(html, /Tiny turns/);
    assert.match(html, /Gentle guide/);
    assert.match(html, /Playful pal/);
    assert.match(html, /Start chat/);
    assert.match(html, /fewest words/i);
    assert.doesNotMatch(html, /Use the form instead/);
    assert.doesNotMatch(html, /About this chat/);
    assert.doesNotMatch(html, /Finish conversation|Response latency|Timing…/);
  });

  it("keeps a consistent Back action on every conversation state", () => {
    for (const status of [
      "ready",
      "connecting",
      "listening",
      "thinking",
      "speaking",
      "reconnecting",
      "error",
      "saving",
    ]) {
      const html = render({ status });
      assert.match(
        html,
        /<button[^>]*aria-label="Back"[^>]*>/,
        status,
      );
    }
  });

  it("uses purpose-specific framing and completion behavior", () => {
    const smallChat = render({
      microphoneEnabled: false,
      purpose: "small-chat",
      status: "listening",
    });
    assert.match(smallChat, /Chat with Peppa/);
    assert.match(smallChat, /Finish chat/);
    assert.doesNotMatch(
      smallChat,
      /Help Peppa know you|Update my profile|Save and finish|Save changes/,
    );

    const onboarding = render({
      microphoneEnabled: false,
      purpose: "onboarding",
      status: "listening",
    });
    assert.match(onboarding, /Help Peppa know you/);
    assert.match(onboarding, /Save and finish/);
    assert.doesNotMatch(onboarding, /Update my profile|Finish conversation/);

    const profileEdit = render({
      microphoneEnabled: false,
      purpose: "profile-edit",
      status: "listening",
    });
    assert.match(profileEdit, /Update my profile/);
    assert.match(profileEdit, /Save changes/);
    assert.doesNotMatch(profileEdit, /Help Peppa know you|Finish conversation/);
  });

  it("describes the selected style without showing setup in profile flows", () => {
    const guide = render({ promptStyle: "gentle-guide" });
    assert.match(guide, /Simple sentence help and two easy choices/);
    assert.match(guide, /<option value="gentle-guide" selected=""/);

    const onboarding = render({ purpose: "onboarding" });
    assert.match(onboarding, /Getting our chat ready/);
    assert.doesNotMatch(onboarding, /Chat style|Start chat|Gentle guide/);
  });

  it("finishes ordinary chat without claiming to save the profile", () => {
    const html = render({ purpose: "small-chat", status: "saving" });

    assert.match(html, /Conversation ended/);
    assert.match(html, /That was fun/);
    assert.doesNotMatch(html, /remember that|Saving your profile/);
  });

  it("makes a genuine cold-start wait calm, honest, and non-interactive", () => {
    const connecting = render({
      status: "connecting",
      microphoneEnabled: false,
      turnReady: false,
    });
    assert.match(connecting, /Peppa is getting ready/);
    assert.match(connecting, /about 25 seconds/i);
    assert.doesNotMatch(connecting, /Start my turn|End my turn/);
    assert.doesNotMatch(connecting, /Repeat Peppa|Response latency|Timing…/);
    assert.doesNotMatch(connecting, /Type instead|Type your answer|>Send</);
  });

  it("keeps the turn action available while Peppa is talking", () => {
    const learnerTurn = render({
      microphoneEnabled: false,
      status: "listening",
    });
    assert.match(learnerTurn, /aria-pressed="false"/);
    assert.match(learnerTurn, /Start my turn/);
    assert.match(learnerTurn, /Your turn/);
    assert.doesNotMatch(
      learnerTurn,
      /Type instead|Type your answer|>Send<|Mute microphone|Turn microphone on/,
    );

    const activeTurn = render({
      microphoneEnabled: true,
      status: "listening",
    });
    assert.match(activeTurn, /aria-pressed="true"/);
    assert.match(activeTurn, /End my turn/);
    assert.match(activeTurn, /Click or press Space/);

    const openingSpeech = render({
      microphoneEnabled: false,
      status: "speaking",
      turnReady: true,
      turns: [
        { id: "opening", role: "assistant", text: "Hello! I am Peppa." },
      ],
    });
    assert.match(openingSpeech, /Peppa is talking/);
    assert.match(openingSpeech, /Start my turn/);
    assert.doesNotMatch(openingSpeech, /Waiting for Peppa/);

    const reconnecting = render({
      microphoneEnabled: false,
      status: "reconnecting",
    });
    assert.match(reconnecting, /Reconnecting/);
    assert.doesNotMatch(reconnecting, /Start my turn|End my turn/);
  });

  it("uses one caption region for Peppa and the live learner transcript", () => {
    const peppa = render({
      microphoneEnabled: false,
      status: "listening",
      turns: [
        { id: "one", role: "assistant", text: "What do you like to do?" },
      ],
    });
    const activeTurn = render({
      liveTranscript: "My name is Mia",
      microphoneEnabled: true,
      status: "listening",
    });
    const document = new Window().document;
    document.body.innerHTML = peppa;
    const captions = document.querySelector(
      '[aria-label="Conversation captions"]',
    );
    assert.ok(captions);
    assert.match(captions.textContent, /What do you like to do/);

    assert.match(activeTurn, /aria-label="Conversation captions"/);
    assert.match(activeTurn, /aria-label="Live transcript"/);
    assert.match(activeTurn, /aria-live="polite"/);
    assert.match(activeTurn, /You(?:’|&#x27;)re saying/);
    assert.match(activeTurn, /My name is Mia/);

    const endedTurn = render({
      liveTranscript: "My name is Mia",
      microphoneEnabled: false,
      status: "thinking",
    });
    assert.match(endedTurn, /aria-label="Live transcript"/);
    assert.match(endedTurn, /You said/);
    assert.match(endedTurn, /My name is Mia/);
  });

  it("shows a quiet thinking state without exposing a latency badge", () => {
    const html = render({
      microphoneEnabled: false,
      status: "thinking",
      turns: [
        { id: "one", role: "assistant", text: "What do you like to do?" },
        { id: "two", role: "user", text: "I like drawing." },
      ],
    });

    assert.match(html, /role="status"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /Peppa is thinking/);
    assert.match(html, /Waiting for Peppa/);
    assert.doesNotMatch(html, /response latency|Reply:|Timing…/i);
    assert.doesNotMatch(html, /Start my turn|End my turn/);
  });

  it("shows only Peppa's latest speech and removes transcript history and developer controls", () => {
    const html = render({
      microphoneEnabled: false,
      status: "listening",
      turns: [
        { id: "one", role: "assistant", text: "What do you like to do?" },
        { id: "two", role: "user", text: "I like drawing." },
        { id: "three", role: "assistant", text: "Ooh, drawing is brilliant!" },
      ],
    });

    assert.match(html, /Ooh, drawing is brilliant!/);
    assert.doesNotMatch(html, /I like drawing/);
    assert.doesNotMatch(html, /Debug transcript/);
    assert.match(html, /Start my turn/);
    assert.doesNotMatch(html, /Chat with your pig pal/);
  });

  it("offers an accessible repeat action for Peppa's latest completed line", () => {
    const ready = render();
    assert.doesNotMatch(ready, /Repeat Peppa's audio/);

    const listening = render({
      microphoneEnabled: false,
      status: "listening",
      turns: [
        { id: "one", role: "assistant", text: "What do you like to do?" },
      ],
    });
    assert.match(listening, /role="group"/);
    assert.match(listening, /aria-label="Peppa(?:'|&#x27;)s message"/);
    assert.match(listening, /aria-label="Repeat Peppa(?:'|&#x27;)s audio"/);
    assert.doesNotMatch(
      listening,
      /aria-label="Repeat Peppa(?:'|&#x27;)s audio"[^>]*disabled/,
    );

    const speaking = render({
      microphoneEnabled: false,
      status: "speaking",
      turns: [
        { id: "one", role: "assistant", text: "What do you like to do?" },
      ],
    });
    assert.doesNotMatch(speaking, /Repeat Peppa(?:'|&#x27;)s audio/);
  });

  it("keeps recovery clear without bringing back typed input or a second large action", () => {
    const html = render({
      canFinish: false,
      error: "The voice room took a break.",
      status: "error",
    });

    assert.match(html, /The voice room took a break/);
    assert.match(html, /Try again/);
    assert.doesNotMatch(html, /Finish chat|Start my turn|End my turn/);
    assert.doesNotMatch(html, /Type instead|Type your answer|>Send</);
  });

  it("saves the prose profile without showing a review page", () => {
    const html = render({
      purpose: "profile-edit",
      status: "saving",
      candidates: [
        {
          id: "profile-summary",
          factKey: "summary",
          label: "About this learner",
          status: "accepted",
          value: "Mia is seven years old and loves giant pandas.",
        },
      ],
      turns: [
        { id: "heard-one", role: "assistant", text: "How old are you?" },
        { id: "heard-two", role: "user", text: "I am seven." },
      ],
    });

    assert.match(html, /Conversation ended/);
    assert.doesNotMatch(html, /Here’s what I heard/);
    assert.doesNotMatch(html, /aria-label="Edit About this learner"/);
    assert.doesNotMatch(html, /<textarea/);
    assert.doesNotMatch(html, /Save and continue|Keep this|Leave this out/);
    assert.doesNotMatch(html, /Debug transcript|I am seven\./);
  });
});
