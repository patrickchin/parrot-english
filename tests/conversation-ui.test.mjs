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
const { ConversationSurface } = await vite.ssrLoadModule(
  "/src/ConversationSurface.tsx",
);
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

after(async () => {
  await vite.close();
});

function props(overrides = {}) {
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

function render(overrides = {}) {
  return renderToStaticMarkup(
    createElement(ConversationSurface, props(overrides)),
  );
}

describe("accessible realtime conversation surface", () => {
  it("shows Peppa while the conversation starts automatically", () => {
    const html = render();

    assert.match(html, /class="conversation-character-stage"/);
    assert.match(html, /Getting our chat ready/);
    assert.match(html, /class="conversation-visually-hidden"/);
    assert.match(html, /peppa\/peppa-happy\.webp/);
    assert.doesNotMatch(html, /Start talking/);
    assert.doesNotMatch(html, /Use the form instead/);
    assert.doesNotMatch(html, /About this chat/);
  });

  it("keeps typed answers and stop controls available in every live state", () => {
    for (const status of [
      "connecting",
      "listening",
      "speaking",
      "reconnecting",
      "error",
    ]) {
      const html = render({
        error: status === "error" ? "The voice room took a break." : "",
        status,
        typedValue: "pandas",
      });
      assert.match(html, /aria-label="Type your answer"/i, status);
      assert.match(html, /value="pandas"/, status);
      assert.match(html, /<summary>Type instead<\/summary>/, status);
      assert.match(html, /Finish now/, status);
      assert.doesNotMatch(html, /Use the form instead/, status);
      assert.match(html, /aria-live="polite"/, status);
      assert.match(html, /peppa\/peppa-[a-z]+\.webp/, status);
      assert.doesNotMatch(
        html,
        /<input[^>]+aria-label="Type your answer"[^>]+disabled/i,
        status,
      );
    }
  });

  it("centers the character, shows only her latest speech, and hides the debug transcript", () => {
    const html = render({
      microphoneEnabled: false,
      status: "reconnecting",
      turns: [
        { id: "one", role: "assistant", text: "What do you like to do?" },
        { id: "two", role: "user", text: "I like drawing." },
        { id: "three", role: "assistant", text: "Ooh, drawing is brilliant!" },
      ],
    });

    const speechBubble = html.match(
      /<p[^>]*class="conversation-speech-bubble"[^>]*>(.*?)<\/p>/,
    )?.[1];
    assert.match(speechBubble, /Ooh, drawing is brilliant!/);
    assert.doesNotMatch(speechBubble, /I like drawing/);
    assert.match(html, /class="conversation-character-stage"/);
    assert.match(
      html,
      /<details class="conversation-debug-transcript"><summary>Debug transcript<\/summary>/,
    );
    assert.doesNotMatch(html, /conversation-debug-transcript" open/);
    assert.match(html, /Peppa/);
    assert.match(html, /You/);
    assert.match(html, /Microphone off/);
    assert.match(html, /Reconnecting/);
    assert.doesNotMatch(html, /Chat with your pig pal/);
  });

  it("saves the prose profile without showing a review page", () => {
    const html = render({
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
    assert.match(html, /Debug transcript/);
    assert.match(html, /How old are you\?/);
    assert.match(html, /I am seven\./);
  });

  it("adds responsive, speech-bubble, debug, focus, and reduced-motion styles", () => {
    assert.match(styles, /\.conversation-shell/);
    assert.match(styles, /\.conversation-character-stage/);
    assert.match(styles, /\.conversation-speech-bubble::after/);
    assert.match(styles, /\.conversation-debug-transcript/);
    assert.match(styles, /\.conversation-transcript/);
    assert.match(styles, /\.conversation-[^{]+:focus-visible/);
    assert.match(styles, /@media \(max-height:/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  });
});
