import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { after, afterEach, describe, it } from "node:test";
import { act, createElement, useState } from "react";
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
const originalAudio = globalThis.Audio;
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
const { IllustratedDubScene } = await vite.ssrLoadModule("/src/dubbing/IllustratedDubScene.tsx");
const { DubListenOnly } = await vite.ssrLoadModule("/src/dubbing/DubListenOnly.tsx");
const { DubProjectHome } = await vite.ssrLoadModule("/src/dubbing/DubProjectHome.tsx");
const { DubSceneEditor } = await vite.ssrLoadModule("/src/dubbing/DubSceneEditor.tsx");
const { DubTakeWaveform } = await vite.ssrLoadModule("/src/dubbing/DubTakeWaveform.tsx");
const {
  DuckDub,
  DubLoading,
  resolveGuideOnlyDubLineAudioSource,
  resolveDubLineAudioSource,
} = await vite.ssrLoadModule("/src/dubbing/DuckDub.tsx");
const { DUB_LINES, FIVE_LITTLE_DUCKS_DUB } = await vite.ssrLoadModule("/src/dubbing/dub-script.ts");
const { DUB_DEFINITIONS, OLD_MACDONALD_DUB } = await vite.ssrLoadModule("/src/dubbing/rhyme-catalog.ts");
const { getStaticAudioLineForSpeech } = await vite.ssrLoadModule("/lib/static-audio.js");

afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
  globalThis.Audio = originalAudio;
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

function enabledDubStatus(saved = false) {
  return {
    complete: saved,
    consentState: "granted",
    dubId: "five-little-ducks-v2",
    guardianConsentVersion: "guardian-voice-r2-v2",
    lines: DUB_LINES.map(({ id }) => ({
      id,
      recordedAt: saved ? "2026-08-25T10:00:00.000Z" : null,
      saved,
    })),
    recordingEnabled: true,
  };
}

function enabledDubStatusWith(...savedLineIds) {
  const saved = new Set(savedLineIds);
  return {
    ...enabledDubStatus(),
    complete: saved.size === DUB_LINES.length,
    lines: DUB_LINES.map(({ id }) => ({
      id,
      recordedAt: saved.has(id) ? "2026-08-25T10:00:00.000Z" : null,
      saved: saved.has(id),
    })),
  };
}

function enabledFirstSceneStatus() {
  return enabledDubStatusWith(
    ...DUB_LINES.slice(0, 4).map(({ id }) => id),
  );
}

function mountDuckDub() {
  return mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/dubs/five-little-ducks"] },
      createElement(DuckDub),
    ),
  );
}

function installRecordingHarness() {
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
  return track;
}

function installAudioHarness(playedSources = []) {
  globalThis.Audio = class Audio {
    constructor(src) { this.src = src; }
    pause() {}
    play() {
      playedSources.push(this.src);
      return Promise.resolve();
    }
  };
  return playedSources;
}

function renderProjectHome(viewProps = {}) {
  return renderToStaticMarkup(createElement(DubProjectHome, {
    activeLine: DUB_LINES[0],
    locked: false,
    needsRetake: new Set(),
    onOpenScene() {},
    onTogglePlayback() {},
    playback: "idle",
    saved: {},
    ...viewProps,
  }));
}

function renderSceneEditor(viewProps = {}) {
  return renderToStaticMarkup(createElement(DubSceneEditor, {
    activeLine: DUB_LINES[0],
    activeSceneIndex: 0,
    error: "",
    hasSavedTake: false,
    needsRetake: new Set(),
    onHearGuide() {},
    onHearTake() {},
    onNext() {},
    onPrevious() {},
    onRecord() {},
    onRetrySave() {},
    onSelectLine() {},
    onToggleScenePlayback() {},
    operation: "idle",
    pendingTake: null,
    recordingStream: null,
    recordingElapsedMs: 0,
    locked: false,
    saveRecovery: null,
    saved: {},
    visualLine: DUB_LINES[0],
    ...viewProps,
  }));
}

describe("duck dubbing storyboard presentation", () => {
  it("keeps optional waveform setup failures from interrupting recording", async () => {
    globalThis.AudioContext = class AudioContext {
      constructor() {
        throw new Error("Audio graph unavailable.");
      }
    };

    const container = await mountStrict(createElement(DubTakeWaveform, {
      blob: null,
      guideAudioId: "five-little-ducks-v2-guide-line-1",
      recordingElapsedMs: 500,
      recordingStream: { getTracks: () => [] },
    }));

    await waitFor(() => assert.ok(
      container.querySelector('[aria-label="Original audio waveform"]'),
    ));
    assert.equal(
      container.querySelector('[aria-label="Your live recording waveform"]'),
      null,
    );
  });

  it("samples a broad live window and renders changing microphone peaks", async () => {
    const analysers = [];
    globalThis.AudioContext = class AudioContext {
      close() { return Promise.resolve(); }
      createAnalyser() {
        const analyser = {
          fftSize: 256,
          getFloatTimeDomainData(samples) {
            samples.fill(0);
            samples[Math.floor(samples.length / 2)] = 0.75;
          },
          smoothingTimeConstant: 0,
        };
        analysers.push(analyser);
        return analyser;
      }
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      resume() { return Promise.resolve(); }
    };

    const container = await mountStrict(createElement(DubTakeWaveform, {
      blob: null,
      guideAudioId: "five-little-ducks-v2-guide-line-1",
      recordingElapsedMs: 500,
      recordingStream: { getTracks: () => [] },
    }));

    await waitFor(() => assert.ok(
      container.querySelector('[aria-label="Your live recording waveform"]'),
    ));
    assert.ok(analysers.length > 0);
    assert.ok(analysers.every(({ fftSize }) => fftSize === 16_384));
    const liveBars = [...container.querySelectorAll(
      '[aria-label="Your live recording waveform"] rect',
    )];
    assert.ok(liveBars.some((bar) => Number(bar.getAttribute("height")) > 4));
  });

  it("removes a misleading live overlay when analyser sampling fails", async () => {
    globalThis.AudioContext = class AudioContext {
      close() { return Promise.resolve(); }
      createAnalyser() {
        return {
          fftSize: 256,
          getFloatTimeDomainData() {
            throw new Error("Microphone graph ended.");
          },
          smoothingTimeConstant: 0,
        };
      }
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      resume() { return Promise.resolve(); }
    };

    const container = await mountStrict(createElement(DubTakeWaveform, {
      blob: null,
      guideAudioId: "five-little-ducks-v2-guide-line-1",
      recordingElapsedMs: 500,
      recordingStream: { getTracks: () => [] },
    }));

    await waitFor(() => assert.equal(
      container.querySelector('[aria-label="Your live recording waveform"]'),
      null,
    ));
    assert.ok(container.querySelector('[aria-label="Original audio waveform"]'));
  });

  it("keeps the live overlay absent after audio resume rejection", async () => {
    let advanceElapsed = () => {
      throw new Error("Waveform harness was not mounted.");
    };
    const recordingStream = { getTracks: () => [] };
    globalThis.AudioContext = class AudioContext {
      close() { return Promise.resolve(); }
      createAnalyser() {
        return {
          fftSize: 256,
          getFloatTimeDomainData(samples) { samples.fill(0.5); },
          smoothingTimeConstant: 0,
        };
      }
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      resume() { return Promise.reject(new Error("Audio context stayed suspended.")); }
    };

    function WaveformHarness() {
      const [elapsed, setElapsed] = useState(500);
      advanceElapsed = () => setElapsed((current) => current + 100);
      return createElement(DubTakeWaveform, {
        blob: null,
        guideAudioId: "five-little-ducks-v2-guide-line-1",
        recordingElapsedMs: elapsed,
        recordingStream,
      });
    }

    const container = await mountStrict(createElement(WaveformHarness));
    await waitFor(() => assert.equal(
      container.querySelector('[aria-label="Your live recording waveform"]'),
      null,
    ));
    await act(async () => advanceElapsed());
    await act(async () => advanceElapsed());
    assert.equal(
      container.querySelector('[aria-label="Your live recording waveform"]'),
      null,
    );
  });

  it("maps every line in a verse to that verse's generated scene", () => {
    const first = renderToStaticMarkup(createElement(IllustratedDubScene, {
      definition: FIVE_LITTLE_DUCKS_DUB,
      line: DUB_LINES[0],
      thumbnail: true,
    }));
    const second = renderToStaticMarkup(createElement(IllustratedDubScene, {
      definition: FIVE_LITTLE_DUCKS_DUB,
      line: DUB_LINES[4],
      thumbnail: true,
    }));

    assert.match(first, /five-little-ducks\/scene-1-five-ducklings\.webp/);
    assert.match(second, /five-little-ducks\/scene-2-four-ducklings\.webp/);
    assert.notEqual(first, second);
  });

  it("renders a selectable six-scene project workspace without line controls", () => {
    const html = renderProjectHome();
    assert.match(html, /aria-label="Full video player"/);
    assert.match(html, /aria-label="Play full video"/);
    assert.match(html, /aria-label="Scene selection"/);
    assert.match(html, /aria-current="step"/);
    assert.match(html, />Choose a scene<\/h2>/);
    assert.match(html, />Start with Scene 1</);
    for (let scene = 1; scene <= 6; scene += 1) {
      assert.match(html, new RegExp(`aria-label="Scene ${scene}, [^"]+, Ready to start"`));
    }
    assert.doesNotMatch(html, />Draft<|voice clips recorded/);
    assert.doesNotMatch(html, />0 \/ 4<|>Done<|>Retake</);
    assert.doesNotMatch(html, /waveform|Record line|Next line/i);
    assert.doesNotMatch(html, /Grown-up options|Delete my dub/);
    assert.doesNotMatch(html, /whole rhyme/i);
  });

  it("keeps full figure markup out of the six scene buttons", () => {
    const html = renderProjectHome();
    const sceneButtons = html.match(
      /<button(?=[^>]*aria-label="Scene \d,)[\s\S]*?<\/button>/g,
    ) ?? [];

    assert.equal(sceneButtons.length, 6);
    assert.doesNotMatch(sceneButtons.join(""), /<figure\b/);
  });

  it("guides empty, partial, retake, and complete projects", () => {
    assert.match(renderProjectHome(), /Ready to start/);
    assert.match(renderProjectHome(), />Start with Scene 1</);

    const partial = renderProjectHome({ saved: { "line-1": "saved" } });
    assert.match(partial, /1 of 24 lines ready/);
    assert.match(partial, />Continue with Scene 1</);

    const saved = Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"]));
    const retake = renderProjectHome({ needsRetake: new Set(["line-5"]), saved });
    assert.match(retake, />Fix Scene 2</);
    assert.match(retake, /Scene 2, Four little ducks, Needs a new take/);

    const complete = renderProjectHome({ activeLine: DUB_LINES[23], saved });
    assert.match(complete, /All 24 lines ready/);
    assert.match(complete, /Your video is ready — great singing!/);
    assert.doesNotMatch(complete, /Start with Scene|Continue with Scene|Fix Scene/);
  });

  it("derives the Old MacDonald project home from the passed dub definition", () => {
    const html = renderProjectHome({
      activeLine: OLD_MACDONALD_DUB.lines[0],
      definition: OLD_MACDONALD_DUB,
    });

    assert.match(html, /Old MacDonald Had a Farm/);
    assert.match(html, /aria-label="Project recording progress"[\s\S]*?>Ready to start</);
    assert.equal((html.match(/aria-label="Scene \d, [^"]+, Ready to start"/g) ?? []).length, 5);
    assert.match(html, /aria-label="Scene 1, Cows on the farm, Ready to start"[\s\S]*?>○ Ready to start</);
  });

  it("keeps every scene selectable after all clips are recorded", () => {
    const html = renderProjectHome({
      activeLine: DUB_LINES[23],
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });
    assert.match(html, /All 24 lines ready/);
    assert.match(html, /Your video is ready — great singing!/);
    assert.doesNotMatch(html, /Start with Scene|Continue with Scene|Fix Scene/);
    for (let scene = 1; scene <= 6; scene += 1) {
      assert.match(html, new RegExp(`aria-label="Scene ${scene}, [^"]+, Scene ready"`));
    }
  });

  it("keeps retake status when every clip has a saved object", () => {
    const html = renderProjectHome({
      activeLine: DUB_LINES[4],
      needsRetake: new Set(["line-5"]),
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });
    assert.match(html, />Fix Scene 2</);
    assert.match(html, /aria-label="Scene 2, Four little ducks, Needs a new take"/);
  });

  it("shows non-blocking project playback errors and retake status", () => {
    const html = renderProjectHome({
      error: "Scene 2, line 1 could not play. The video will continue without it.",
      needsRetake: new Set(["line-5"]),
      playback: "playing",
      saved: { "line-5": "saved" },
    });
    assert.match(html, /aria-label="Stop full video"/);
    assert.match(html, /aria-label="Scene 2, Four little ducks, Needs a new take"/);
    assert.match(html, /role="alert"/);
  });

  it("loads an enabled route directly into the project without an entry action", async () => {
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json(enabledDubStatus(true));
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Play full video"]')));
    assert.equal(
      [...container.querySelectorAll("button")].filter(({ textContent }) =>
        /Start dubbing|Continue dubbing|Continue Scene/.test(textContent),
      ).length,
      0,
    );
  });

  it("moves the scene back action into page navigation and restores the project link", async () => {
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json(enabledDubStatus());
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Play full video"]')));
    await click(container.querySelector('[aria-label="Scene 1, Five little ducks, Ready to start"]'));
    await waitFor(() => assert.equal(
      container.querySelectorAll('nav[aria-label="Page navigation"] [aria-label="Back to full video"]')
        .length,
      1,
    ));

    await click(container.querySelector('nav[aria-label="Page navigation"] [aria-label="Back to full video"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Play full video"]')));
    const backToRhymes = container.querySelector('nav[aria-label="Page navigation"] a[aria-label="Back to Nursery rhymes"]');
    assert.ok(backToRhymes);
    assert.equal(backToRhymes.getAttribute("href"), "/dubs");
  });

  it("shows listen-only playback as soon as recording-disabled status loads", async () => {
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json({ ...enabledDubStatus(), recordingEnabled: false });
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.match(
      container.textContent,
      /You can watch the video now/,
    ));
    assert.ok(container.querySelector('[aria-label="Play full video"]'));
    assert.equal(
      [...container.querySelectorAll("button")].filter(({ textContent }) =>
        /Start dubbing|Continue dubbing|Continue Scene/.test(textContent),
      ).length,
      0,
    );
  });

  it("clears a revoking save into listen-only playback", async () => {
    const revokedUrls = [];
    URL.createObjectURL = () => "blob:revoking-take";
    URL.revokeObjectURL = (url) => revokedUrls.push(url);
    const track = installRecordingHarness();
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json(enabledDubStatus());
      }
      if (path === "/api/dubs/five-little-ducks-v2/lines/line-1" && init.method === "PUT") {
        return Response.json({ error: "dub_consent_revoking" }, { status: 409 });
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Play full video"]')));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Scene 1, Five little ducks, Ready to start"]')));
    await click(container.querySelector('[aria-label="Scene 1, Five little ducks, Ready to start"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Record line"]')));
    await click(container.querySelector('[aria-label="Record line"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Stop recording"]')));
    await click(container.querySelector('[aria-label="Stop recording"]'));

    await waitFor(() => assert.match(
      container.textContent,
      /You can watch the video now/,
    ));
    assert.equal(track.stopped, true);
    assert.deepEqual(revokedUrls, ["blob:revoking-take"]);
    assert.ok(container.querySelector('[aria-label="Play full video"]'));
    assert.doesNotMatch(container.textContent, /Save again|Start dubbing|Continue Scene|Record line/);
  });

  it("revokes the current take preview when dubbing unmounts", async () => {
    const revokedUrls = [];
    URL.createObjectURL = () => "blob:saved-take";
    URL.revokeObjectURL = (url) => revokedUrls.push(url);
    installRecordingHarness();
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json(enabledDubStatus());
      }
      if (path === "/api/dubs/five-little-ducks-v2/lines/line-1" && init.method === "PUT") {
        return Response.json({ recordedAt: "2026-08-25T10:00:00.000Z" }, { status: 201 });
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Play full video"]')));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Scene 1, Five little ducks, Ready to start"]')));
    await click(container.querySelector('[aria-label="Scene 1, Five little ducks, Ready to start"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Record line"]')));
    await click(container.querySelector('[aria-label="Record line"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Stop recording"]')));
    await click(container.querySelector('[aria-label="Stop recording"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Your recording waveform"]')));

    assert.deepEqual(revokedUrls, []);
    await cleanupMountedRoots();
    assert.deepEqual(revokedUrls, ["blob:saved-take"]);
  });

  it("loads a previously saved recording as a private blob without using the guide", async () => {
    const clip = new Blob(["saved learner voice"], { type: "audio/webm" });
    const createdBlobs = [];
    const fetches = [];
    const playedSources = installAudioHarness();
    const revokedUrls = [];
    URL.createObjectURL = (blob) => {
      createdBlobs.push(blob);
      return "blob:private-saved-take";
    };
    URL.revokeObjectURL = (url) => revokedUrls.push(url);
    globalThis.fetch = async (path, init = {}) => {
      fetches.push(String(path));
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json(enabledFirstSceneStatus());
      }
      if (path === "/api/dubs/five-little-ducks-v2/lines/line-1/audio" && !init.method) {
        return new Response(clip);
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label^="Scene 1,"]')));
    await click(container.querySelector('[aria-label^="Scene 1,"]'));
    assert.equal(
      container.querySelector("h1")?.textContent,
      "Five little ducks went out one day.",
    );
    assert.ok(container.querySelector('[aria-label="Record again"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Play my recording"]')));
    await click(container.querySelector('[aria-label="Play my recording"]'));
    await waitFor(() => assert.deepEqual(playedSources, ["blob:private-saved-take"]));

    assert.deepEqual(createdBlobs, [clip]);
    assert.equal(fetches.filter((path) => path.endsWith("/lines/line-1/audio")).length, 1);
    assert.equal(fetches.some((path) => path.includes("/assets/audio/")), false);
    assert.ok(container.querySelector('[aria-label="Record again"]'));
    await click(container.querySelector('[aria-label="Stop my recording"]'));
    await waitFor(() => assert.deepEqual(revokedUrls, ["blob:private-saved-take"]));
  });

  it("shows listen-only playback immediately when saved recording playback reports consent loss", async () => {
    let createdObjectUrls = 0;
    URL.createObjectURL = () => {
      createdObjectUrls += 1;
      return "blob:must-not-exist";
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json(enabledFirstSceneStatus());
      }
      if (path === "/api/dubs/five-little-ducks-v2/lines/line-1/audio" && !init.method) {
        return Response.json({ error: "dubbing_not_enabled" }, { status: 403 });
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label^="Scene 1,"]')));
    await click(container.querySelector('[aria-label^="Scene 1,"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Play my recording"]')));
    await click(container.querySelector('[aria-label="Play my recording"]'));

    await waitFor(() => assert.match(
      container.textContent,
      /You can watch the video now/,
    ));
    assert.equal(createdObjectUrls, 0);
    assert.equal(container.querySelector('[aria-label="Record again"]'), null);
    assert.ok(container.querySelector('[aria-label="Play full video"]'));
  });

  it("keeps the editor open and offers Record again when saved recording playback fails", async () => {
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json(enabledFirstSceneStatus());
      }
      if (path === "/api/dubs/five-little-ducks-v2/lines/line-1/audio" && !init.method) {
        return new Response(null, { status: 500 });
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label^="Scene 1,"]')));
    await click(container.querySelector('[aria-label^="Scene 1,"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Play my recording"]')));
    await click(container.querySelector('[aria-label="Play my recording"]'));

    await waitFor(() => assert.equal(
      container.querySelector('[role="alert"]')?.textContent,
      "Your recording could not be played. Record the line again.",
    ));
    assert.ok(container.querySelector('[aria-label="Scene video"]'));
    assert.ok(container.querySelector('[aria-label="Record again"]'));
  });

  it("keeps pending preview playback private-GET free with a separate URL lifetime", async () => {
    const privateFetches = [];
    const revokedUrls = [];
    const playedSources = installAudioHarness();
    URL.createObjectURL = () => "blob:pending-take";
    URL.revokeObjectURL = (url) => revokedUrls.push(url);
    installRecordingHarness();
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json(enabledDubStatus());
      }
      if (path === "/api/dubs/five-little-ducks-v2/lines/line-1" && init.method === "PUT") {
        return Response.json({ recordedAt: "2026-08-25T10:00:00.000Z" }, { status: 201 });
      }
      if (String(path).endsWith("/audio")) {
        privateFetches.push(String(path));
        return new Response(new Blob(["wrong source"]));
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label^="Scene 1,"]')));
    await click(container.querySelector('[aria-label^="Scene 1,"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Record line"]')));
    await click(container.querySelector('[aria-label="Record line"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Stop recording"]')));
    await click(container.querySelector('[aria-label="Stop recording"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Play my recording"]')));
    await click(container.querySelector('[aria-label="Play my recording"]'));
    await waitFor(() => assert.deepEqual(playedSources, ["blob:pending-take"]));
    await click(container.querySelector('[aria-label="Stop my recording"]'));

    assert.deepEqual(privateFetches, []);
    assert.deepEqual(revokedUrls, []);
  });

  it("does not create a fetched object URL after saved recording playback is aborted", async () => {
    const createdBlobs = [];
    let resolveAudioFetch;
    let audioResponseReturned = false;
    const audioResponse = new Promise((resolve) => { resolveAudioFetch = resolve; });
    URL.createObjectURL = (blob) => {
      createdBlobs.push(blob);
      return "blob:stale-take";
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json(enabledFirstSceneStatus());
      }
      if (path === "/api/dubs/five-little-ducks-v2/lines/line-1/audio" && !init.method) {
        const response = await audioResponse;
        audioResponseReturned = true;
        return response;
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label^="Scene 1,"]')));
    await click(container.querySelector('[aria-label^="Scene 1,"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Play my recording"]')));
    await click(container.querySelector('[aria-label="Play my recording"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Stop my recording"]')));
    await click(container.querySelector('[aria-label="Back to full video"]'));
    resolveAudioFetch(new Response(new Blob(["late learner voice"])));
    await waitFor(() => assert.equal(audioResponseReturned, true));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    assert.ok(container.querySelector('[aria-label="Play full video"]'));
    assert.deepEqual(createdBlobs, []);
  });

  it("keeps a successor fetched take URL owned when an older aborted fetch settles", async () => {
    const playedSources = installAudioHarness();
    const createdBlobs = [];
    const revokedUrls = [];
    let audioFetchCount = 0;
    let resolveOlderAudioFetch;
    let olderAudioResponseReturned = false;
    const olderAudioResponse = new Promise((resolve) => { resolveOlderAudioFetch = resolve; });
    URL.createObjectURL = (blob) => {
      createdBlobs.push(blob);
      return "blob:successor-take";
    };
    URL.revokeObjectURL = (url) => revokedUrls.push(url);
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json(enabledFirstSceneStatus());
      }
      if (path === "/api/dubs/five-little-ducks-v2/lines/line-1/audio" && !init.method) {
        audioFetchCount += 1;
        if (audioFetchCount === 1) {
          const response = await olderAudioResponse;
          olderAudioResponseReturned = true;
          return response;
        }
        return new Response(new Blob(["successor learner voice"], { type: "audio/webm" }));
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label^="Scene 1,"]')));
    await click(container.querySelector('[aria-label^="Scene 1,"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Play my recording"]')));

    await click(container.querySelector('[aria-label="Play my recording"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Stop my recording"]')));
    await click(container.querySelector('[aria-label="Stop my recording"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Play my recording"]')));
    await click(container.querySelector('[aria-label="Play my recording"]'));
    await waitFor(() => assert.deepEqual(playedSources, ["blob:successor-take"]));

    assert.equal(audioFetchCount, 2);
    assert.equal(createdBlobs.length, 1);
    assert.deepEqual(revokedUrls, []);

    resolveOlderAudioFetch(new Response(new Blob(["older learner voice"], { type: "audio/webm" })));
    await waitFor(() => assert.equal(olderAudioResponseReturned, true));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    assert.ok(container.querySelector('[aria-label="Stop my recording"]'));
    assert.deepEqual(revokedUrls, []);

    await click(container.querySelector('[aria-label="Stop my recording"]'));
    await waitFor(() => assert.deepEqual(revokedUrls, ["blob:successor-take"]));
  });

  it("clears saved storyboard data when full playback reports consent loss", async () => {
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
          return Response.json(enabledDubStatus(true));
        }
        if (String(path).endsWith("/audio")) {
          return Response.json({ error }, { status });
        }
        throw new Error(`Unexpected dub request: ${init.method} ${path}`);
      };

      const container = await mountDuckDub();
      await waitFor(() => assert.ok(container.querySelector('[aria-label="Play full video"]')));
      await click(container.querySelector('[aria-label="Play full video"]'));
      await waitFor(() => assert.match(
        container.textContent,
        /You can watch the video now/,
      ));
      assert.doesNotMatch(container.textContent, /Continue dubbing|Record line/);
      assert.ok(container.querySelector('[aria-label="Play full video"]'));
      await cleanupMountedRoots();
      document.body.replaceChildren();
    }
  });

  it("uses visible shapes as well as color for scene status", () => {
    const project = renderProjectHome({
      needsRetake: new Set(["line-5"]),
      saved: {
        "line-1": "saved",
        "line-5": "saved",
        "line-9": "saved",
        "line-10": "saved",
        "line-11": "saved",
        "line-12": "saved",
      },
    });
    assert.match(project, /aria-label="Scene 1, Five little ducks, 1 of 4 lines ready"[\s\S]*?data-status-icon="in-progress"[^>]*>◐ 1 of 4 lines ready<\/span>/);
    assert.match(project, /aria-label="Scene 2, Four little ducks, Needs a new take"[\s\S]*?data-status-icon="needs-retake"[^>]*>! Needs a new take<\/span>/);
    assert.match(project, /aria-label="Scene 3, Three little ducks, Scene ready"[\s\S]*?data-status-icon="done"[^>]*>✓ Scene ready<\/span>/);
    assert.match(project, /aria-label="Scene 4, Two little ducks, Ready to start"[\s\S]*?data-status-icon="not-started"[^>]*>○ Ready to start<\/span>/);
  });

  it("renders one Choicer-style line flow without competing editor controls", () => {
    const html = renderSceneEditor();
    assert.match(html, /aria-current="step"[^>]*>Line 1 of 4/);
    assert.match(html, /<h1[^>]*>Five little ducks went out one day\.<\/h1>/);
    assert.match(html, /aria-label="Original audio waveform"/);
    assert.match(html, /Hear line/);
    assert.match(html, /aria-label="Record line"/);
    assert.match(html, /aria-label="Next line"/);
    assert.ok(html.indexOf("Hear line") < html.indexOf('aria-label="Record line"'));
    assert.ok(html.indexOf('aria-label="Record line"') < html.indexOf('aria-label="Next line"'));
    assert.doesNotMatch(html, /Scene line selectors|Play scene|Scene recording progress|0 \/ 4|Five little ducks<\/h1>/);
    assert.doesNotMatch(html, /<details|<summary|aria-label="Listen"/);
  });

  it("offers replay and record-again for a previously saved line", () => {
    const html = renderSceneEditor({ hasSavedTake: true });
    assert.match(html, /aria-label="Play my recording"/);
    assert.match(html, />Record again</);
  });

  it("renders previous and next navigation without a content-level back control", () => {
    const first = renderSceneEditor({ activeLine: DUB_LINES[0] });
    assert.match(first, /<button(?=[^>]*aria-label="Previous line")(?=[^>]*\sdisabled(?:=""|(?=[\s>])))[^>]*>/);
    assert.match(first, /aria-label="Next line"/);
    assert.doesNotMatch(first, /aria-label="Back to full video"/);

    const middle = renderSceneEditor({ activeLine: DUB_LINES[1] });
    assert.match(middle, /aria-label="Previous line"/);
    assert.doesNotMatch(middle, /<button(?=[^>]*aria-label="Previous line")(?=[^>]*\sdisabled(?:=""|(?=[\s>])))[^>]*>/);

    const final = renderSceneEditor({ activeLine: DUB_LINES[3] });
    assert.match(final, /aria-label="Next, finish scene"/);
    assert.doesNotMatch(final, /<button(?=[^>]*aria-label="Previous line")(?=[^>]*\sdisabled(?:=""|(?=[\s>])))[^>]*>/);
  });

  it("locks both directions during unsafe and unsaved operations", () => {
    for (const props of [
      { locked: true, operation: "mic-opening" },
      { locked: false, operation: "recording" },
      { locked: true, operation: "saving" },
      { locked: false, operation: "idle", saveRecovery: "save" },
    ]) {
      const html = renderSceneEditor({ activeLine: DUB_LINES[1], ...props });
      assert.match(html, /<button(?=[^>]*aria-label="Previous line")(?=[^>]*\sdisabled(?:=""|(?=[\s>])))[^>]*>/);
      assert.match(html, /<button(?=[^>]*aria-label="Next line")(?=[^>]*\sdisabled(?:=""|(?=[\s>])))[^>]*>/);
    }
  });

  it("keeps the selected line synchronized with its visual and prompt", () => {
    const html = renderSceneEditor({
      activeLine: DUB_LINES[1],
    });
    assert.match(html, /aria-current="step"[^>]*>Line 2 of 4/);
    assert.match(html, /<h1[^>]*>Over the hill and far away\.<\/h1>/);
    assert.match(html, /Five yellow ducklings leave their mother beside a bright spring pond\./);
  });

  it("derives the scene editor line count from the passed dub definition", () => {
    const html = renderSceneEditor({
      activeLine: OLD_MACDONALD_DUB.lines[1],
      definition: OLD_MACDONALD_DUB,
    });

    assert.match(html, /aria-current="step"[^>]*>Line 2 of 7/);
    assert.match(html, /<h1[^>]*>And on his farm he had some cows, E-I-E-I-O!<\/h1>/);
  });

  it("keeps recording available when a guide waveform asset is missing", () => {
    const html = renderSceneEditor({
      activeLine: { ...DUB_LINES[0], text: "A newly authored duck line." },
    });

    assert.match(html, /A newly authored duck line\./);
    assert.match(html, /aria-label="Original audio waveform"/);
    assert.match(html, /aria-label="Record line"/);
  });

  it("turns the fixed record action into an immediate stop action with elapsed time", () => {
    const html = renderSceneEditor({
      operation: "recording",
      recordingStream: { getTracks: () => [] },
      recordingElapsedMs: 2_100,
    });
    assert.match(html, /aria-label="Stop recording"/);
    assert.match(html, /role="timer"[\s\S]*?Recording[\s\S]*?0:02 \/ 0:06/);
    assert.match(html, /<div(?=[^>]*aria-label="Recording time")(?=[^>]*aria-valuemax="6000")(?=[^>]*aria-valuenow="2100")(?=[^>]*role="progressbar")[^>]*>/);
    assert.match(html, /aria-label="Original audio waveform"/);
    assert.match(html, /aria-label="Next line"/);
    assert.doesNotMatch(html, /countdown|Get ready/i);
  });

  it("makes microphone startup and saving visible in the fixed record slot", () => {
    const opening = renderSceneEditor({ operation: "mic-opening" });
    const saving = renderSceneEditor({ operation: "saving" });

    assert.match(opening, /<button(?=[^>]*aria-label="Starting microphone")(?=[^>]*disabled)[^>]*>/);
    assert.match(opening, />Starting…</);
    assert.match(opening, /<button(?=[^>]*aria-label="Next line")(?=[^>]*disabled)[^>]*>/);
    assert.match(saving, /<button(?=[^>]*aria-label="Saving recording")(?=[^>]*disabled)[^>]*>/);
    assert.match(saving, />Saving…</);
    assert.match(saving, /<button(?=[^>]*aria-label="Next line")(?=[^>]*disabled)[^>]*>/);
  });

  it("preserves a retryable take while locking navigation", () => {
    const html = renderSceneEditor({
      error: "Your take was not saved.",
      pendingTake: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
      saveRecovery: "save",
    });
    assert.match(html, /aria-label="Your recording waveform"/);
    assert.match(html, />Not saved</);
    assert.doesNotMatch(html, />Saved ✓</);
    assert.match(html, /aria-label="Save again"/);
    assert.match(html, /<button(?=[^>]*aria-label="Next line")(?=[^>]*disabled)[^>]*>/);
    assert.match(html, /role="alert"/);
  });

  it("keeps replay controls visible but disabled during a retry save", () => {
    const html = renderSceneEditor({
      operation: "saving",
      pendingTake: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
      saveRecovery: "save",
    });
    assert.match(html, /<button[^>]*disabled[^>]*>[^<]*<svg[^>]*>.*Hear line<\/button>/s);
    assert.match(html, /<button(?=[^>]*aria-label="Play my recording")(?=[^>]*disabled)[^>]*>/);
    assert.match(html, /<button(?=[^>]*aria-label="Save again")(?=[^>]*disabled)[^>]*>/);
  });

  it("exposes an accurate full-video loading name", () => {
    const projectLoading = renderProjectHome({ playback: "loading" });
    assert.match(projectLoading, /aria-label="Loading full video…"[^>]*disabled/);
    assert.doesNotMatch(projectLoading, /aria-label="Play full video"/);
  });

  it("keeps load recovery learner-safe", () => {
    assert.equal(typeof DubLoading, "function", "DubLoading must be renderable for route-shell checks");
    const loading = renderToStaticMarkup(createElement(DubLoading, {
      error: "Your saved dub could not be loaded.",
      onRetryLoad() {},
    }));
    assert.match(loading, /role="alert"/);
    assert.match(loading, />Try loading again<\/button>/);
    assert.doesNotMatch(loading, /Finish deleting|Delete my dub|Grown-up options/);
  });

  it("discards rejected-take preview and exposes one Record again action", () => {
    const html = renderSceneEditor({
      error: "That recording is too long.",
      pendingTake: null,
      saveRecovery: "record",
    });
    assert.match(html, /aria-label="Record again"/);
    assert.equal((html.match(/Record again/g) ?? []).length, 2);
    assert.doesNotMatch(html, /Your recording waveform|Save again/);
  });

  it("names playing full and local-take controls as stop actions", () => {
    assert.match(renderProjectHome({ playback: "playing" }), /aria-label="Stop full video"/);
    assert.match(renderSceneEditor({
      operation: "take-playing",
      pendingTake: new Blob([new Uint8Array([1])], { type: "audio/webm" }),
    }), /aria-label="Stop my recording"/);
  });

  it("keeps private playback resolvable when a saved line has no guide", () => {
    const source = resolveDubLineAudioSource(
      DUB_LINES[4],
      { "line-5": "saved" },
      () => { throw new Error("guide missing"); },
    );
    assert.deepEqual(source, {
      preferredUrl: "/api/dubs/five-little-ducks-v2/lines/line-5/audio",
    });
    assert.throws(
      () => resolveDubLineAudioSource(DUB_LINES[5], {}, () => {
        throw new Error("guide missing");
      }),
      /guide missing/,
    );
  });

  it("shows public video playback without private or recording controls", () => {
    const html = renderToStaticMarkup(createElement(DubListenOnly, {
      definition: FIVE_LITTLE_DUCKS_DUB,
      error: "",
      onTogglePlayback() {},
      playback: "idle",
      visualLine: DUB_LINES[0],
    }));
    assert.match(html, /You can watch the video now/);
    assert.match(html, /aria-label="Play full video"/);
    assert.doesNotMatch(
      html,
      /Record again|Record line|Play my recording|Save again|Guardian|Delete/,
    );
  });

  it("resolves every listen-only line to its public guide and never private audio", () => {
    for (const definition of DUB_DEFINITIONS) {
      for (const line of definition.lines) {
        const source = resolveGuideOnlyDubLineAudioSource(line);
        assert.deepEqual(source, {
          preferredUrl: getStaticAudioLineForSpeech("narrator", line.text).src,
        });
        assert.equal(source.preferredUrl.includes("/api/dubs/"), false);
        assert.equal(Object.hasOwn(source, "fallbackUrl"), false);
      }
    }
  });
});
