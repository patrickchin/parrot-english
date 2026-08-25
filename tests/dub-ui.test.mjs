import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { after, afterEach, describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { createServer } from "vite";
import {
  cleanupMountedRoots,
  click,
  installDom,
  mountStrict,
  waitFor,
} from "./helpers/react-lifecycle.mjs";

const restoreDom = installDom();
const originalFetch = globalThis.fetch;
const originalMediaRecorder = globalThis.MediaRecorder;
const originalMediaDevices = navigator.mediaDevices;

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
const { DuckDub, DuckDubView } = dubModule;
const { DuckScene } = sceneModule;

afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
  globalThis.MediaRecorder = originalMediaRecorder;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: originalMediaDevices,
  });
});

after(async () => {
  await vite.close();
  restoreDom();
});

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
  onHearGuide() {},
  onNext() {},
  onRecord() {},
  onRetake() {},
  onSelectLine() {},
  onSaveAgain() {},
  onStopPlayback() {},
  onStopRecording() {},
  onWatch() {},
};

function renderDuckDub(state, viewProps = {}) {
  assert.equal(
    typeof DuckDubView,
    "function",
    "Expected an executable DuckDubView",
  );
  const mergedState = { ...createInitialDubState(), ...state };
  return renderInRouter(
    createElement(DuckDubView, {
      line: DUB_LINES[mergedState.currentLineIndex],
      recordingEnabled: true,
      state: mergedState,
      ...handlers,
      ...viewProps,
    }),
  );
}

function liveStatusText(html) {
  const match = html.match(
    /<div(?=[^>]*aria-atomic="true")(?=[^>]*aria-live="polite")(?=[^>]*role="status")[^>]*>([^<]*)<\/div>/,
  );
  assert.ok(match, "Expected one atomic polite status region");
  return match[1].replace(/\s+/g, " ").trim();
}

describe("duck dubbing presentation", () => {
  it("never asks a learner to claim they are a grown-up", () => {
    const disabled = renderDuckDub({ phase: "intro" }, { recordingEnabled: false });
    assert.match(disabled, /Ask a grown-up to turn on voice dubbing in Guardian mode/);
    assert.match(disabled, /Back home/);
    assert.doesNotMatch(disabled, /checkbox|I’m the grown-up|Grown-up options|Delete my dub/);
    assert.doesNotMatch(disabled, /Start dubbing|Continue dubbing|Record line/);

    const enabled = renderDuckDub({ phase: "intro" });
    assert.match(enabled, />Start dubbing<\/button>/);
    assert.doesNotMatch(enabled, /checkbox|I’m the grown-up/);
  });

  it("clears a revoking save into disabled learner guidance", async () => {
    assert.equal(typeof DuckDub, "function", "Expected an executable DuckDub");
    const track = { stopped: false, stop() { this.stopped = true; } };
    class Recorder {
      static isTypeSupported() { return false; }

      constructor() { this.state = "inactive"; }

      start() { this.state = "recording"; }

      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["take"], { type: "audio/webm" }) });
        this.onstop?.();
      }
    }
    globalThis.MediaRecorder = Recorder;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { async getUserMedia() { return { getTracks: () => [track] }; } },
    });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v1" && !init.method) {
        return Response.json({
          complete: false,
          consentState: "granted",
          dubId: "five-little-ducks-v1",
          guardianConsentVersion: "guardian-voice-r2-v2",
          lines: DUB_LINES.map(({ id }) => ({ id, recordedAt: null, saved: false })),
          recordingEnabled: true,
        });
      }
      if (path === "/api/dubs/five-little-ducks-v1/lines/line-1" && init.method === "PUT") {
        return Response.json({ error: "dub_consent_revoking" }, { status: 409 });
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountStrict(
      createElement(MemoryRouter, { initialEntries: ["/dubs/five-little-ducks"] }, createElement(DuckDub)),
    );
    await waitFor(() => assert.ok([...container.querySelectorAll("button")].some((button) => button.textContent.includes("Start dubbing"))));
    await click([...container.querySelectorAll("button")].find((button) => button.textContent.includes("Start dubbing")));
    await click(container.querySelector('[aria-label="Record line 1"]'));
    await click(container.querySelector('[aria-label="Stop recording line 1"]'));

    await waitFor(() => assert.match(container.textContent, /Ask a grown-up to turn on voice dubbing in Guardian mode/));
    assert.equal(track.stopped, true);
    assert.doesNotMatch(container.textContent, /Save again|Start dubbing|Continue dubbing|Record line/);
  });

  it("makes Record the clear next step and keeps listening optional", () => {
    const html = renderDuckDub({ phase: "line-ready", currentLineIndex: 0 });
    assert.match(html, /Line 1 of 9/);
    assert.match(html, /Five little ducks went out to play\./);
    assert.match(html, /aria-label="Record line 1"/);
    assert.match(html, /aria-label="Hear the line"/);
    assert.doesNotMatch(html, /Hear the line again/);
    assert.doesNotMatch(html, /Watch my dub/);

    const complete = renderDuckDub({
      phase: "line-ready",
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });
    assert.doesNotMatch(complete, /Watch my dub/);
    assert.match(complete, />Back to my dub<\/button>/);
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
    assert.doesNotMatch(failed, />Record again<\/button>/);

    const rejected = renderDuckDub({
      error: "That recording is too long. Try the line again.",
      phase: "save-error",
      saveRecovery: "record",
    });
    assert.match(rejected, /role="alert"/);
    assert.match(rejected, />Record again<\/button>/);
    assert.doesNotMatch(rejected, />Save again<\/button>/);

    const review = renderDuckDub({ phase: "line-review" });
    assert.match(review, />Next line<\/button>/);
    assert.match(review, />Record again<\/button>/);
    assert.doesNotMatch(review, /Hear my take/);
  });

  it("keeps retakes learner-facing but removes destructive management", () => {
    const ready = renderDuckDub({
      currentLineIndex: 4,
      phase: "final-ready",
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });
    assert.match(ready, /Watch my dub<\/button>/);
    assert.match(ready, /All 9 lines recorded/);
    assert.match(ready, /Your dub is ready!/);
    assert.doesNotMatch(ready, /aria-label="Line 5 of 9"/);
    assert.match(ready, /<details(?![^>]*\bopen\b)[^>]*>/);
    assert.match(ready, /<summary[^>]*aria-label="Record another take"/);
    assert.match(ready, />Record another take<\/summary>|>Record another take<span/);
    assert.match(ready, /<label[^>]*>Choose a saved line<\/label>/);
    assert.match(ready, /<select[^>]*aria-label="Choose a saved line"/);
    assert.match(ready, /<option[^>]*value="line-5"[^>]*selected=""[^>]*>Line 5: Three little ducks raced through the reeds\.<\/option>/);
    assert.equal((ready.match(/<option/g) ?? []).length, 9);
    assert.match(ready, />Record selected line<\/button>/);
    assert.doesNotMatch(ready, /Grown-up options|Delete my dub/);
    assert.doesNotMatch(ready, /Your recordings are private/);

    const loading = renderDuckDub({ phase: "final-loading" });
    assert.match(loading, /Getting your dub ready…/);
    assert.match(loading, /disabled/);

    const playing = renderDuckDub({ phase: "final-playing" });
    assert.match(playing, />Stop playback<\/button>/);
  });

  it("shows recurring privacy guidance only at the learner intro", () => {
    const intro = renderDuckDub({ phase: "intro" });
    const ready = renderDuckDub({ phase: "line-ready" });
    const review = renderDuckDub({ phase: "line-review" });
    const complete = renderDuckDub({
      phase: "final-ready",
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });

    assert.match(intro, /Your voice clips stay private in this account/);
    assert.doesNotMatch(ready, /Your recordings are private/);
    assert.doesNotMatch(review, /Your recordings are private/);
    assert.doesNotMatch(complete, /Your recordings are private/);
  });

  it("announces every phase accurately through one atomic polite live region", () => {
    const complete = Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"]));
    const cases = [
      [{ phase: "loading" }, {}, "Loading your private dub."],
      [
        { phase: "loading" },
        { loadError: "Your saved dub could not be loaded." },
        "Loading stopped. Try loading again.",
      ],
      [
        { phase: "loading" },
        { loadError: "A previous action was interrupted." },
        "Loading stopped. Try loading again.",
      ],
      [{ phase: "intro" }, {}, "Choose Start dubbing to begin."],
      [
        { currentLineIndex: 2, phase: "line-ready" },
        {},
        "Line 3 of 9. Ready to hear or record this line.",
      ],
      [
        { currentLineIndex: 2, phase: "mic-opening" },
        {},
        "Line 3 of 9. Opening the microphone.",
      ],
      [
        { currentLineIndex: 2, phase: "recording" },
        {},
        "Line 3 of 9. Recording in progress.",
      ],
      [
        { currentLineIndex: 2, phase: "saving" },
        {},
        "Line 3 of 9. Saving your take.",
      ],
      [
        { currentLineIndex: 2, error: "Not saved.", phase: "save-error" },
        {},
        "Line 3 of 9. Choose Save again.",
      ],
      [
        {
          currentLineIndex: 2,
          error: "Too long.",
          phase: "save-error",
          saveRecovery: "record",
        },
        {},
        "Line 3 of 9. Choose Record again.",
      ],
      [
        { currentLineIndex: 2, phase: "line-review" },
        {},
        "Line 3 of 9. Your take is saved. Choose Next line to continue.",
      ],
      [
        { currentLineIndex: 2, phase: "final-ready", saved: complete },
        {},
        "Your complete dub is ready. Choose Watch my dub.",
      ],
      [
        { currentLineIndex: 2, phase: "final-loading", saved: complete },
        {},
        "Getting your dub ready to play.",
      ],
      [
        { currentLineIndex: 2, phase: "final-playing", saved: complete },
        {},
        "Playing your dub. Line 3 of 9.",
      ],
    ];

    for (const [state, viewProps, expected] of cases) {
      const html = renderDuckDub(state, viewProps);
      assert.equal(liveStatusText(html), expected);
      assert.equal((html.match(/role="status"/g) ?? []).length, 1);
      assert.equal((html.match(/aria-live="polite"/g) ?? []).length, 1);
    }
  });

  it("keeps load recovery learner-safe", () => {
    const ordinary = renderDuckDub(
      { phase: "loading" },
      { loadError: "Your saved dub could not be loaded." },
    );
    assert.match(ordinary, />Try loading again<\/button>/);
    assert.doesNotMatch(ordinary, /Finish deleting my dub/);

    assert.doesNotMatch(ordinary, /Finish deleting my dub|Delete my dub/);
  });

  it("keeps visible progress and recording text accessible but non-live", () => {
    const html = renderDuckDub({ phase: "recording", currentLineIndex: 2 });
    assert.match(html, />Line 3 of 9<\/p>/);
    assert.match(html, />Recording…<\/p>/);
    assert.equal((html.match(/role="status"/g) ?? []).length, 1);
    assert.equal((html.match(/aria-live="polite"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /<p[^>]*(?:aria-live|role="status")[^>]*>[^<]*(?:Line 3|Recording…)/);
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
