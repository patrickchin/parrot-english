import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const dubModule = await vite
  .ssrLoadModule("/src/dubbing/DuckDub.tsx")
  .catch(() => ({}));
const sceneModule = await vite
  .ssrLoadModule("/src/dubbing/DuckScene.tsx")
  .catch(() => ({}));
const { DUB_LINES } = await vite.ssrLoadModule(
  "/src/dubbing/dub-script.ts",
);
const { createInitialDubState } = await vite.ssrLoadModule(
  "/src/dubbing/dub-state.ts",
);
const { DuckDubView } = dubModule;
const { DuckScene } = sceneModule;

after(async () => vite.close());

function renderInRouter(element) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/dubs/five-little-ducks"] },
      element,
    ),
  );
}

const handlers = {
  onDelete() {},
  onHearGuide() {},
  onHearTake() {},
  onNext() {},
  onRecord() {},
  onRetake() {},
  onSaveAgain() {},
  onStopPlayback() {},
  onStopRecording() {},
  onWatch() {},
};

function renderDuckDub(state, confirmed = true) {
  assert.equal(
    typeof DuckDubView,
    "function",
    "Expected an executable DuckDubView",
  );
  const mergedState = { ...createInitialDubState(), ...state };
  return renderInRouter(
    createElement(DuckDubView, {
      confirmed,
      line: DUB_LINES[mergedState.currentLineIndex],
      onConfirm() {},
      state: mergedState,
      ...handlers,
    }),
  );
}

describe("duck dubbing presentation", () => {
  it("requires grown-up confirmation and explains private account storage", () => {
    const unchecked = renderDuckDub({ phase: "intro" }, false);
    assert.match(unchecked, /Five Little Ducks/);
    assert.match(unchecked, /Your recordings are private/);
    assert.match(unchecked, /signed-in grown-up(?:&#x27;|')s account/);
    assert.match(
      unchecked,
      /I’m the grown-up and I agree to save these private voice clips\./,
    );
    assert.match(unchecked, /<input[^>]*required/);
    assert.match(unchecked, /<button[^>]*disabled[^>]*>Start dubbing<\/button>/);

    const continued = renderDuckDub(
      { phase: "intro", saved: { "line-1": "saved" } },
      true,
    );
    assert.match(continued, /<button[^>]*>Continue dubbing<\/button>/);
    assert.doesNotMatch(continued, /Continue dubbing<\/button>[^]*disabled/);
  });

  it("renders readable line progress and stable ready controls", () => {
    const html = renderDuckDub({ phase: "line-ready", currentLineIndex: 0 });
    assert.match(html, /Line 1 of 9/);
    assert.match(html, /Five little ducks went out to play\./);
    assert.match(html, /aria-label="Hear the line"/);
    assert.match(html, /aria-label="Record line 1"/);
    assert.doesNotMatch(html, /Watch my dub/);

    const complete = renderDuckDub({
      phase: "line-ready",
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });
    assert.match(complete, />Watch my dub<\/button>/);
  });

  it("keeps recording, saving, failure, and review actions child-readable", () => {
    const opening = renderDuckDub({ phase: "mic-opening" });
    assert.match(opening, /<button[^>]*disabled[^>]*>Opening microphone…<\/button>/);

    const recording = renderDuckDub({ phase: "recording", currentLineIndex: 2 });
    assert.match(recording, /Recording…/);
    assert.match(recording, /aria-label="Stop recording line 3"/);

    const saving = renderDuckDub({ phase: "saving" });
    assert.match(saving, /<button[^>]*disabled[^>]*>Saving your take…<\/button>/);

    const failed = renderDuckDub({
      error: "Your take was not saved. Try again.",
      phase: "save-error",
    });
    assert.match(failed, /role="alert"/);
    assert.match(failed, />Save again<\/button>/);
    assert.match(failed, />Try recording again<\/button>/);

    const review = renderDuckDub({ phase: "line-review" });
    assert.match(review, /aria-label="Hear my take"/);
    assert.match(review, />Next line<\/button>/);
    assert.match(review, />Try again<\/button>/);
  });

  it("renders final replay and delete actions for each final phase", () => {
    const ready = renderDuckDub({ phase: "final-ready" });
    assert.match(ready, /Watch my dub<\/button>/);
    assert.match(ready, />Record a line again<\/button>/);
    assert.match(ready, />Delete my dub<\/button>/);

    const loading = renderDuckDub({ phase: "final-loading" });
    assert.match(loading, /Getting your dub ready…/);
    assert.match(loading, /disabled/);

    const playing = renderDuckDub({ phase: "final-playing" });
    assert.match(playing, />Stop playback<\/button>/);
  });

  it("uses one hidden original SVG with adjacent scene description", () => {
    assert.equal(typeof DuckScene, "function", "Expected an executable DuckScene");
    const html = renderToStaticMarkup(
      createElement(DuckScene, { line: DUB_LINES[2], playing: true }),
    );
    assert.match(html, /<svg[^>]*aria-hidden="true"[^>]*viewBox="0 0 960 540"/);
    assert.match(html, /A frog appears; four ducks continue\./);
    assert.equal((html.match(/<svg/g) ?? []).length, 1);
    assert.doesNotMatch(html, /<img|https?:\/\//);
  });
});
