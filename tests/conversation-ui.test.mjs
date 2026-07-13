import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
const conversationStylesUrl = new URL(
  "../src/conversation.css",
  import.meta.url,
);
const conversationStyles = existsSync(conversationStylesUrl)
  ? readFileSync(conversationStylesUrl, "utf8")
  : "";

after(async () => {
  await vite.close();
});

function props(overrides = {}) {
  return {
    candidates: [],
    error: "",
    microphoneEnabled: true,
    onBack() {},
    onCandidateChange() {},
    onCandidateStatusChange() {},
    onFinish() {},
    onSendText() {},
    onStart() {},
    onSubmitReview() {},
    onToggleMicrophone() {},
    onTypedValueChange() {},
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

function classNamesFor(html, semanticClass) {
  for (const match of html.matchAll(/class="([^"]*)"/g)) {
    if (match[1].split(/\s+/).includes(semanticClass)) return match[1];
  }

  assert.fail(`Expected rendered class token ${semanticClass}`);
}

describe("accessible realtime conversation surface", () => {
  it("shows Peppa while the conversation starts automatically", () => {
    const html = render();

    classNamesFor(html, "conversation-character-stage");
    assert.match(html, /Getting our chat ready/);
    classNamesFor(html, "conversation-visually-hidden");
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
      "speaking",
      "reconnecting",
      "error",
      "saving",
    ]) {
      const html = render({ status });
      assert.match(
        html,
        /<button aria-label="Back" class="[^"]*\bconversation-back-button\b[^"]*"[^>]*>/,
        status,
      );
      assert.match(html, /lucide-arrow-left/, status);
    }
  });

  it("makes joining unmistakable before Peppa enables learner input", () => {
    const connecting = render({ status: "connecting", microphoneEnabled: false });
    const noticeClasses = classNamesFor(
      connecting,
      "conversation-joining-notice",
    );
    assert.match(connecting, /Joining Peppa/);
    assert.match(connecting, /Please wait[^<]*Peppa says hello/i);
    assert.doesNotMatch(connecting, /conversation-microphone-button/);
    assert.doesNotMatch(connecting, /Type instead|Type your answer|>Send</);
    assert.match(noticeClasses, /\bbg-\[#173c67\](?=\s|$)/);
    assert.match(noticeClasses, /\btext-white\b/);
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
      /<p[^>]*class="[^"]*\bconversation-speech-bubble\b[^"]*"[^>]*>(.*?)<\/p>/,
    )?.[1];
    assert.match(speechBubble, /Ooh, drawing is brilliant!/);
    assert.doesNotMatch(speechBubble, /I like drawing/);
    classNamesFor(html, "conversation-character-stage");
    assert.doesNotMatch(html, /conversation-debug-transcript|Debug transcript/);
    assert.match(html, /Start my turn/);
    assert.doesNotMatch(html, /class="conversation-state/);
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

  it("uses the shared CSS design system for responsive layout and actions", () => {
    const html = render({ microphoneEnabled: false, status: "listening" });
    const screenClasses = classNamesFor(html, "conversation-screen");
    const backClasses = classNamesFor(html, "conversation-back-button");
    const turnClasses = classNamesFor(html, "conversation-turn-button");
    const finishClasses = classNamesFor(html, "conversation-finish-button");
    const bubbleClasses = classNamesFor(html, "conversation-speech-bubble");

    assert.equal(screenClasses, "conversation-screen");
    assert.match(backClasses, /\bapp-header-control\b/);
    assert.match(turnClasses, /\bapp-button\b/);
    assert.match(turnClasses, /\bapp-button--large\b/);
    assert.match(turnClasses, /\bapp-button--success\b/);
    assert.match(finishClasses, /\bapp-button--surface\b/);
    assert.equal(bubbleClasses, "conversation-speech-bubble");
    assert.match(conversationStyles, /height:\s*100dvh/);
    assert.match(conversationStyles, /overflow-y:\s*auto/);
    assert.match(
      conversationStyles,
      /padding-top:\s*var\(--app-header-clearance\)/,
    );
    assert.match(conversationStyles, /\.conversation-speech-bubble::after/);
  });
});
