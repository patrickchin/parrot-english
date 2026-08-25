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
const originalAudioContext = globalThis.AudioContext;
const originalMediaRecorder = globalThis.MediaRecorder;
const originalMediaDevices = navigator.mediaDevices;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

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
  globalThis.AudioContext = originalAudioContext;
  globalThis.MediaRecorder = originalMediaRecorder;
  URL.createObjectURL = originalCreateObjectUrl;
  URL.revokeObjectURL = originalRevokeObjectUrl;
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
  onHearTake() {},
  onNext() {},
  onRecord() {},
  onRetake() {},
  onSelectLine() {},
  onSaveAgain() {},
  onStopPlayback() {},
  onStopRecording() {},
  onStopTake() {},
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

function buttonWithText(container, label) {
  return [...container.querySelectorAll("button")].find((candidate) =>
    candidate.textContent.includes(label)
  );
}

function liveStatusText(html) {
  const match = html.match(
    /<div(?=[^>]*aria-atomic="true")(?=[^>]*aria-live="polite")(?=[^>]*role="status")[^>]*>([^<]*)<\/div>/,
  );
  assert.ok(match, "Expected one atomic polite status region");
  return match[1].replace(/\s+/g, " ").trim();
}

function buttonTag(html, accessibleName) {
  const match = html.match(
    new RegExp(`<button(?=[^>]*aria-label="${accessibleName}")[^>]*>`),
  );
  assert.ok(match, `Expected button named ${accessibleName}`);
  return match[0];
}

function buttonDisabled(html, accessibleName) {
  return /\sdisabled=""/.test(buttonTag(html, accessibleName));
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
    const revokedUrls = [];
    URL.createObjectURL = () => "blob:revoking-take";
    URL.revokeObjectURL = (url) => revokedUrls.push(url);
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
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json({
          complete: false,
          consentState: "granted",
          dubId: "five-little-ducks-v2",
          guardianConsentVersion: "guardian-voice-r2-v2",
          lines: DUB_LINES.map(({ id }) => ({ id, recordedAt: null, saved: false })),
          recordingEnabled: true,
        });
      }
      if (path === "/api/dubs/five-little-ducks-v2/lines/line-1" && init.method === "PUT") {
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
    assert.deepEqual(revokedUrls, ["blob:revoking-take"]);
    assert.doesNotMatch(container.textContent, /Save again|Start dubbing|Continue dubbing|Record line/);
  });

  it("revokes the current take preview when dubbing unmounts", async () => {
    const revokedUrls = [];
    let createdUrls = 0;
    URL.createObjectURL = () => `blob:take-${++createdUrls}`;
    URL.revokeObjectURL = (url) => revokedUrls.push(url);
    const track = { stop() {} };
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
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json({
          complete: false,
          consentState: "granted",
          dubId: "five-little-ducks-v2",
          guardianConsentVersion: "guardian-voice-r2-v2",
          lines: DUB_LINES.map(({ id }) => ({ id, recordedAt: null, saved: false })),
          recordingEnabled: true,
        });
      }
      if (path === "/api/dubs/five-little-ducks-v2/lines/line-1" && init.method === "PUT") {
        return Response.json({ recordedAt: "2026-08-25T10:00:00.000Z" }, { status: 201 });
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountStrict(
      createElement(MemoryRouter, { initialEntries: ["/dubs/five-little-ducks"] }, createElement(DuckDub)),
    );
    await waitFor(() => assert.ok(buttonWithText(container, "Start dubbing")));
    await click(buttonWithText(container, "Start dubbing"));
    await click(container.querySelector('[aria-label="Record line 1"]'));
    await click(container.querySelector('[aria-label="Stop recording line 1"]'));
    await waitFor(() =>
      assert.ok(container.querySelector('[aria-label="Next line"]')),
    );

    assert.equal(createdUrls, 1);
    assert.deepEqual(revokedUrls, []);
    await cleanupMountedRoots();
    assert.deepEqual(revokedUrls, ["blob:take-1"]);
  });

  it("clears a complete dub when final playback reports consent loss", async () => {
    assert.equal(typeof DuckDub, "function", "Expected an executable DuckDub");
    class AudioContext {
      close() { return Promise.resolve(); }
    }
    globalThis.AudioContext = AudioContext;

    for (const [status, error] of [
      [403, "dubbing_not_enabled"],
      [409, "dub_consent_revoking"],
    ]) {
      globalThis.fetch = async (path, init = {}) => {
        if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
          return Response.json({
            complete: true,
            consentState: "granted",
            dubId: "five-little-ducks-v2",
            guardianConsentVersion: "guardian-voice-r2-v2",
            lines: DUB_LINES.map(({ id }) => ({
              id,
              recordedAt: "2026-08-25T10:00:00.000Z",
              saved: true,
            })),
            recordingEnabled: true,
          });
        }
        if (String(path).endsWith("/audio")) {
          return Response.json({ error }, { status });
        }
        throw new Error(`Unexpected dub request: ${init.method} ${path}`);
      };

      const container = await mountStrict(
        createElement(
          MemoryRouter,
          { initialEntries: ["/dubs/five-little-ducks"] },
          createElement(DuckDub),
        ),
      );
      await waitFor(() => assert.ok(
        [...container.querySelectorAll("button")].some((button) =>
          /Start dubbing|Continue dubbing/.test(button.textContent)
        ),
      ));
      await click([...container.querySelectorAll("button")].find((button) =>
        /Start dubbing|Continue dubbing/.test(button.textContent)
      ));
      await waitFor(() => assert.ok(
        [...container.querySelectorAll("button")].some((button) =>
          button.textContent.includes("Watch my dub")
        ),
      ));
      await click([...container.querySelectorAll("button")].find((button) =>
        button.textContent.includes("Watch my dub")
      ));

      await waitFor(() => assert.match(
        container.textContent,
        /Ask a grown-up to turn on voice dubbing in Guardian mode/,
      ));
      assert.doesNotMatch(
        container.textContent,
        /Watch my dub|Try again|Record selected line/,
      );
      await cleanupMountedRoots();
      document.body.replaceChildren();
    }
  });

  it("makes the current lyric unmistakable and keeps the saved guide replayable", () => {
    const html = renderDuckDub({ phase: "line-ready", currentLineIndex: 0 });
    assert.match(html, /Verse 1 of 6 · Line 1 of 4/);
    assert.doesNotMatch(html, /Line 1 of 24/);
    assert.match(html, /aria-valuetext="Verse 1 of 6, line 1 of 4"/);
    assert.match(html, /Now read/);
    assert.match(html, /Five little ducks went out one day\./);
    assert.match(html, /aria-label="Record line 1"/);
    assert.equal(buttonDisabled(html, "Next line"), true);
    assert.ok(
      html.indexOf('aria-label="Record line 1"') < html.indexOf('aria-label="Next line"'),
    );
    assert.match(html, /aria-label="Replay example"/);
    assert.doesNotMatch(html, /aria-label="Hear the line"/);
    assert.doesNotMatch(html, /Watch my dub/);

    const complete = renderDuckDub({
      phase: "line-ready",
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });
    assert.doesNotMatch(complete, /Watch my dub/);
    assert.doesNotMatch(complete, /Back to my dub/);
    assert.equal(buttonDisabled(complete, "Next line"), false);
  });

  it("keeps recording, saving, failure, and review actions child-readable", () => {
    const opening = renderDuckDub({ phase: "mic-opening" });
    assert.match(opening, /Opening microphone…/);
    assert.equal(buttonDisabled(opening, "Record line 1"), true);
    assert.equal(buttonDisabled(opening, "Next line"), true);

    const recording = renderDuckDub({ phase: "recording", currentLineIndex: 2 });
    assert.match(recording, /Recording…/);
    assert.match(recording, /aria-label="Stop recording line 3"/);
    assert.equal(buttonDisabled(recording, "Next line"), true);

    const saving = renderDuckDub({ phase: "saving" });
    assert.match(saving, /Saving your take…/);
    assert.equal(buttonDisabled(saving, "Record line 1"), true);
    assert.equal(buttonDisabled(saving, "Next line"), true);

    const failed = renderDuckDub({
      error: "Your take was not saved. Try again.",
      phase: "save-error",
    });
    assert.match(failed, /role="alert"/);
    assert.match(failed, />Save again<\/button>/);
    assert.match(failed, /aria-label="Record again line 1"/);
    assert.equal(buttonDisabled(failed, "Next line"), true);

    const rejected = renderDuckDub({
      error: "That recording is too long. Try the line again.",
      phase: "save-error",
      saveRecovery: "record",
    });
    assert.match(rejected, /role="alert"/);
    assert.match(rejected, />Record again<\/button>/);
    assert.doesNotMatch(rejected, />Save again<\/button>/);

    const review = renderDuckDub(
      { phase: "line-review" },
      { takeBlob: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }) },
    );
    assert.match(review, /Your voice/);
    assert.match(review, /aria-label="Your recording waveform"/);
    assert.match(review, /aria-label="Hear my voice"/);
    assert.equal(buttonDisabled(review, "Next line"), false);
    assert.match(review, /aria-label="Record again line 1"/);
    assert.ok(
      review.indexOf('aria-label="Record again line 1"') < review.indexOf('aria-label="Next line"'),
    );

    const playingTake = renderDuckDub(
      { phase: "line-review" },
      {
        takeBlob: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
        takePlaying: true,
      },
    );
    assert.match(playingTake, /aria-label="Stop my voice"/);

    const versePlaying = renderDuckDub({
      currentLineIndex: 3,
      phase: "verse-playing",
      saved: Object.fromEntries(DUB_LINES.slice(0, 4).map(({ id }) => [id, "saved"])),
    });
    assert.match(versePlaying, />Your verse</);
    assert.match(versePlaying, />Playing verse 1…</);
    assert.equal(buttonDisabled(versePlaying, "Record line 4"), true);
    assert.equal(buttonDisabled(versePlaying, "Next line"), false);
  });

  it("keeps retakes learner-facing but removes destructive management", () => {
    const ready = renderDuckDub({
      currentLineIndex: 4,
      phase: "final-ready",
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });
    assert.match(ready, /Watch my dub<\/button>/);
    assert.match(ready, /All 6 verses recorded/);
    assert.match(ready, /Your dub is ready!/);
    assert.doesNotMatch(ready, /aria-label="Verse 2 of 6, line 1 of 4"/);
    assert.match(ready, /<details(?![^>]*\bopen\b)[^>]*>/);
    assert.match(ready, /<summary[^>]*aria-label="Record another take"/);
    assert.match(ready, />Record another take<\/summary>|>Record another take<span/);
    assert.match(ready, /<label[^>]*>Choose a saved line<\/label>/);
    assert.match(ready, /<select[^>]*aria-label="Choose a saved line"/);
    assert.match(ready, /<option[^>]*value="line-5"[^>]*selected=""[^>]*>Line 5: Four little ducks went out one day\.<\/option>/);
    assert.equal((ready.match(/<option/g) ?? []).length, 24);
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
        "Verse 1 of 6, line 3 of 4. Listen to the example, then record this line.",
      ],
      [
        { currentLineIndex: 2, phase: "mic-opening" },
        {},
        "Verse 1 of 6, line 3 of 4. Opening the microphone.",
      ],
      [
        { currentLineIndex: 2, phase: "recording" },
        {},
        "Verse 1 of 6, line 3 of 4. Recording in progress.",
      ],
      [
        { currentLineIndex: 2, phase: "saving" },
        {},
        "Verse 1 of 6, line 3 of 4. Saving your take.",
      ],
      [
        { currentLineIndex: 2, error: "Not saved.", phase: "save-error" },
        {},
        "Verse 1 of 6, line 3 of 4. Choose Save again.",
      ],
      [
        {
          currentLineIndex: 2,
          error: "Too long.",
          phase: "save-error",
          saveRecovery: "record",
        },
        {},
        "Verse 1 of 6, line 3 of 4. Choose Record again.",
      ],
      [
        { currentLineIndex: 2, phase: "line-review" },
        {},
        "Verse 1 of 6, line 3 of 4. Your take is saved. Hear your voice or choose Next line.",
      ],
      [
        { currentLineIndex: 3, phase: "verse-loading" },
        {},
        "Getting verse 1 of 6 ready. Next skips the preview.",
      ],
      [
        { currentLineIndex: 3, phase: "verse-playing" },
        {},
        "Playing verse 1 of 6. Next skips to the next verse.",
      ],
      [
        { currentLineIndex: 23, phase: "verse-loading" },
        {},
        "Getting verse 6 of 6 ready. Next skips to your completed dub.",
      ],
      [
        { currentLineIndex: 23, phase: "verse-playing" },
        {},
        "Playing verse 6 of 6. Next skips to your completed dub.",
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
        "Playing your dub. Verse 1 of 6, line 3 of 4.",
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
    assert.match(html, />Verse 1 of 6 · Line 3 of 4<\/p>/);
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
    assert.doesNotMatch(html, /frog/i);
    assert.match(html, /Mother duck calls/);
    assert.equal((html.match(/<svg/g) ?? []).length, 1);
    assert.doesNotMatch(html, /<img|https?:\/\//);
  });
});
