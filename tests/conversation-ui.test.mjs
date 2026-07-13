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
const { ConversationSurface } = await vite.ssrLoadModule(
  "/src/ConversationSurface.tsx",
);
after(async () => {
  await vite.close();
});

function props(overrides = {}) {
  return {
    error: "",
    microphoneEnabled: true,
    onBack() {},
    onFinish() {},
    onRepeatAudio() {},
    onStart() {},
    onToggleMicrophone() {},
    purpose: "small-chat",
    responseLatencyMs: null,
    status: "ready",
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
  it("shows Peppa while the conversation starts automatically", () => {
    const html = render();

    assert.match(html, /Getting our chat ready/);
    assert.match(html, /Chat with Peppa/);
    assert.match(html, /peppa\/peppa-happy\.webp/);
    assert.doesNotMatch(html, /Start talking/);
    assert.doesNotMatch(html, /Use the form instead/);
    assert.doesNotMatch(html, /About this chat/);
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
        /<button aria-label="Back"[^>]*>/,
        status,
      );
    }
  });

  it("finishes ordinary chat without claiming to save the profile", () => {
    const html = render({ purpose: "small-chat", status: "saving" });

    assert.match(html, /That was fun|Finishing your chat/);
    assert.doesNotMatch(html, /remember that|Saving your profile/);
  });

  it("makes joining unmistakable before Peppa enables learner input", () => {
    const connecting = render({ status: "connecting", microphoneEnabled: false });
    assert.match(connecting, /Joining Peppa/);
    assert.match(connecting, /Please wait[^<]*Peppa says hello/i);
    assert.doesNotMatch(connecting, /Start my turn|End my turn/);
    assert.doesNotMatch(connecting, /Type instead|Type your answer|>Send</);
  });

  it("keeps only the two clear conversation actions after Peppa opens", () => {
    for (const status of [
      "listening",
      "speaking",
      "reconnecting",
    ]) {
      const html = render({
        microphoneEnabled: false,
        status,
      });
      assert.match(html, /aria-pressed="false"/, status);
      assert.match(html, /Start my turn/, status);
      assert.match(html, /Finish conversation/, status);
      assert.doesNotMatch(
        html,
        /Type instead|Type your answer|>Send<|Mute microphone|Turn microphone on/,
        status,
      );
      assert.match(html, /aria-live="polite"/, status);
      assert.match(html, /peppa\/peppa-[a-z]+\.webp/, status);
    }

    const activeTurn = render({
      microphoneEnabled: true,
      status: "listening",
    });
    assert.match(activeTurn, /aria-pressed="true"/);
    assert.match(activeTurn, /End my turn/);
    assert.match(activeTurn, /Click or press Space/);
  });

  it("shows that Peppa is preparing a reply after the learner ends their turn", () => {
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
    assert.match(html, /Getting her reply ready/);
    assert.match(html, /Peppa response latency/);
    assert.match(html, /Measuring reply time/);
    assert.doesNotMatch(html, /Start my turn|End my turn/);
    assert.match(html, /Finish conversation/);
  });

  it("shows the completed client-side latency when Peppa starts talking", () => {
    const html = render({
      microphoneEnabled: false,
      responseLatencyMs: 1_254,
      status: "speaking",
    });

    assert.match(html, /Peppa response latency/);
    assert.match(html, /Reply time/);
    assert.match(html, /1\.25 s/);
  });

  it("centers the character, shows only her latest speech, and removes developer controls", () => {
    const html = render({
      microphoneEnabled: false,
      status: "reconnecting",
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
    assert.match(
      speaking,
      /aria-label="Repeat Peppa(?:'|&#x27;)s audio"[^>]*disabled/,
    );
  });

  it("keeps retry and finish available without bringing back typed input", () => {
    const html = render({
      error: "The voice room took a break.",
      status: "error",
    });

    assert.match(html, /The voice room took a break/);
    assert.match(html, /Try again/);
    assert.match(html, /Finish conversation/);
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

    assert.match(html, /Saving your profile/);
    assert.doesNotMatch(html, /Here’s what I heard/);
    assert.doesNotMatch(html, /aria-label="Edit About this learner"/);
    assert.doesNotMatch(html, /<textarea/);
    assert.doesNotMatch(html, /Save and continue|Keep this|Leave this out/);
    assert.doesNotMatch(html, /Debug transcript|I am seven\./);
  });
});
