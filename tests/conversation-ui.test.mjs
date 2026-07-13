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

  it("makes joining unmistakable before Peppa enables learner input", () => {
    const connecting = render({ status: "connecting", microphoneEnabled: false });
    assert.match(connecting, /class="conversation-joining-notice"/);
    assert.match(connecting, /Joining Peppa/);
    assert.match(connecting, /Please wait[^<]*Peppa says hello/i);
    assert.doesNotMatch(connecting, /conversation-microphone-button/);
    assert.doesNotMatch(connecting, /Type instead|Type your answer|>Send</);
    assert.match(
      styles,
      /\.conversation-joining-notice\s*\{[^}]*background:\s*#173c67[^}]*color:\s*#fff/s,
    );
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
      assert.doesNotMatch(html, /class="conversation-state/, status);
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
    assert.match(html, /Start my turn/);
    assert.doesNotMatch(html, />Reconnecting[^<]*</);
    assert.doesNotMatch(html, /Chat with your pig pal/);
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

  it("makes the screen scrollable and both remaining actions large", () => {
    assert.match(styles, /\.conversation-shell/);
    assert.match(styles, /\.conversation-character-stage/);
    assert.match(styles, /\.conversation-speech-bubble::after/);
    assert.match(
      styles,
      /\.conversation-screen\s*\{[^}]*height:\s*100dvh[^}]*overflow-y:\s*auto/s,
    );
    assert.match(
      styles,
      /\.conversation-turn-button\s*\{[^}]*width:\s*100%[^}]*min-height:\s*64px[^}]*background:\s*#087451[^}]*color:\s*#fff/s,
    );
    assert.match(
      styles,
      /\.conversation-finish-button\s*\{[^}]*width:\s*100%[^}]*min-height:\s*64px[^}]*background:\s*rgb\(255 255 255 \/ 88%\)[^}]*text-decoration:\s*none/s,
    );
    assert.doesNotMatch(styles, /\.conversation-type-panel/);
    assert.doesNotMatch(styles, /\.conversation-debug-transcript/);
    assert.match(styles, /\.conversation-[^{]+:focus-visible/);
    assert.match(styles, /@media \(max-height:/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  });
});
