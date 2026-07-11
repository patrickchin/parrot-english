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

  it("waits for Peppa's opening before enabling learner input", () => {
    const connecting = render({ status: "connecting", microphoneEnabled: false });
    assert.match(
      connecting,
      /<button[^>]+class="conversation-microphone-button"[^>]+disabled=""[\s\S]*Turn microphone on[\s\S]*<\/button>/,
    );
    assert.match(
      connecting,
      /<input[^>]+aria-label="Type your answer"[^>]+disabled=""/i,
    );
    assert.match(connecting, /<button[^>]+disabled=""[^>]*>Send<\/button>/);
  });

  it("keeps typed answers and stop controls available after Peppa opens", () => {
    for (const status of [
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
      assert.match(html, /<summary>[\s\S]*Type instead[\s\S]*<\/summary>/, status);
      assert.match(html, /Finish conversation/, status);
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

    const speechBubble = html.match(
      /<p[^>]*class="conversation-speech-bubble"[^>]*>(.*?)<\/p>/,
    )?.[1];
    assert.match(speechBubble, /Ooh, drawing is brilliant!/);
    assert.doesNotMatch(speechBubble, /I like drawing/);
    assert.match(html, /class="conversation-character-stage"/);
    assert.doesNotMatch(html, /conversation-debug-transcript|Debug transcript/);
    assert.match(html, /Turn microphone on/);
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
    assert.doesNotMatch(html, /Debug transcript|I am seven\./);
  });

  it("gives primary, secondary, and exit actions distinct visual hierarchy", () => {
    assert.match(styles, /\.conversation-shell/);
    assert.match(styles, /\.conversation-character-stage/);
    assert.match(styles, /\.conversation-speech-bubble::after/);
    assert.match(
      styles,
      /\.conversation-microphone-button\s*\{[^}]*background:\s*#ff467b[^}]*color:\s*#fff/s,
    );
    assert.match(
      styles,
      /\.conversation-finish-button\s*\{[^}]*background:\s*transparent[^}]*text-decoration:\s*underline/s,
    );
    assert.match(
      styles,
      /\.conversation-type-panel\s*\{[^}]*background:\s*rgb\(255 255 255 \/ 72%\)/s,
    );
    assert.doesNotMatch(styles, /\.conversation-debug-transcript/);
    assert.match(styles, /\.conversation-[^{]+:focus-visible/);
    assert.match(styles, /@media \(max-height:/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  });
});
