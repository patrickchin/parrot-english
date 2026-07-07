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
  it("offers a clear start and form fallback before media is requested", () => {
    const html = render();

    assert.match(html, /Meet your pig pal/);
    assert.match(html, /Start talking/);
    assert.match(html, /Use the form instead/);
    assert.match(html, /pig-host\.webp/);
    assert.match(html, /save the words.*not the audio/i);
    assert.doesNotMatch(html, /Peppa/);
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
      assert.match(html, /Finish now/, status);
      assert.match(html, /Use the form instead/, status);
      assert.match(html, /aria-live="polite"/, status);
      assert.doesNotMatch(
        html,
        /<input[^>]+aria-label="Type your answer"[^>]+disabled/i,
        status,
      );
    }
  });

  it("renders captions, transcript roles, microphone state, and reconnecting feedback", () => {
    const html = render({
      microphoneEnabled: false,
      status: "reconnecting",
      turns: [
        { id: "one", role: "assistant", text: "What do you like to do?" },
        { id: "two", role: "user", text: "I like drawing." },
      ],
    });

    assert.match(html, /What do you like to do\?/);
    assert.match(html, /I like drawing\./);
    assert.match(html, /Pig pal/);
    assert.match(html, /You/);
    assert.match(html, /Microphone off/);
    assert.match(html, /Reconnecting/);
  });

  it("renders an editable, confirmable summary without requiring every fact", () => {
    const html = render({
      status: "summary",
      candidates: [
        {
          id: "name",
          factKey: "name",
          label: "Name",
          status: "accepted",
          value: "Mia",
        },
        {
          id: "interest",
          factKey: "interest",
          label: "Likes",
          status: "rejected",
          value: "pandas",
        },
      ],
      turns: [
        { id: "heard-one", role: "assistant", text: "How old are you?" },
        { id: "heard-two", role: "user", text: "I am seven." },
      ],
    });

    assert.match(html, /Here’s what I heard/);
    assert.match(html, /aria-label="Edit Name"/);
    assert.match(html, /aria-label="Edit Likes"/);
    assert.match(html, /value="Mia"/);
    assert.match(html, /value="pandas"/);
    assert.match(html, /Save and continue/);
    assert.match(html, /Keep this/);
    assert.match(html, /Leave this out/);
    assert.match(html, /Conversation transcript/);
    assert.match(html, /How old are you\?/);
    assert.match(html, /I am seven\./);
  });

  it("adds responsive, short-height, focus, transcript, and reduced-motion styles", () => {
    assert.match(styles, /\.conversation-shell/);
    assert.match(styles, /\.conversation-transcript/);
    assert.match(styles, /\.conversation-[^{]+:focus-visible/);
    assert.match(styles, /@media \(max-height:/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  });
});
