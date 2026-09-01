import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { after, afterEach, describe, it } from "node:test";
import { act, createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { createServer } from "vite";
import {
  STATIC_MEDIA_ASSETS,
  createStaticMediaPublishPlan,
} from "../scripts/static-media.mjs";
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
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

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
const { DuckDub } = await vite.ssrLoadModule("/src/dubbing/DuckDub.tsx");
const { NurseryRhymeList } = await vite.ssrLoadModule(
  "/src/dubbing/NurseryRhymeList.tsx",
);
const { GuardianLanguageProvider } = await vite.ssrLoadModule(
  "/src/i18n/guardian-language.tsx",
);
const {
  DubLoading,
  resolveGuideOnlyDubLineAudioSource,
  resolveDubLineAudioSource,
} = await vite.ssrLoadModule("/src/dubbing/DubStudio.tsx");
const { DUB_LINES, FIVE_LITTLE_DUCKS_DUB } = await vite.ssrLoadModule("/src/dubbing/dub-script.ts");
const {
  DUB_DEFINITIONS,
  HUMPTY_DUMPTY_DUB,
  OLD_MACDONALD_DUB,
  ROW_ROW_ROW_YOUR_BOAT_DUB,
} = await vite.ssrLoadModule("/src/dubbing/rhyme-catalog.ts");
const { NURSERY_RHYMES_COVER_ARTWORK } = await vite.ssrLoadModule(
  "/src/dubbing/dub-artwork.ts",
);
const staticMediaPlan = createStaticMediaPublishPlan(STATIC_MEDIA_ASSETS, {
  bucket: "parrot-english-media",
  mediaOrigin: "https://media.parrotbook.com",
  sourceVersion: 2,
  targetVersion: 3,
});

afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
  globalThis.Audio = originalAudio;
  globalThis.AudioContext = originalAudioContext;
  globalThis.MediaRecorder = originalMediaRecorder;
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
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

function mountDuckDub(language = "en") {
  return mountStrict(
    createElement(
      GuardianLanguageProvider,
      { initialLanguage: language, storage: null },
      createElement(
        MemoryRouter,
        { initialEntries: ["/dubs/five-little-ducks"] },
        createElement(DuckDub),
      ),
    ),
  );
}

function renderNurseryRhymes(language = "en") {
  return renderToStaticMarkup(
    createElement(
      GuardianLanguageProvider,
      { initialLanguage: language, storage: null },
      createElement(
        MemoryRouter,
        { initialEntries: ["/dubs"] },
        createElement(NurseryRhymeList),
      ),
    ),
  );
}

function installRecordingHarness() {
  return installSynchronizedRecordingHarness().track;
}

function installSynchronizedRecordingHarness({
  decodeError,
  melodyStartError,
  melodyPreparationError,
  rejectMicrophone = false,
} = {}) {
  const events = [];
  const contexts = [];
  const callbacks = new Map();
  const track = { stopped: false, stop() { this.stopped = true; } };
  let failingCallback = null;
  let frameFailure = null;
  let nextFrame = 1;

  globalThis.requestAnimationFrame = (callback) => {
    if (callback === failingCallback) {
      failingCallback = null;
      throw frameFailure;
    }
    const id = nextFrame++;
    callbacks.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => callbacks.delete(id);

  class Recorder {
    static isTypeSupported() { return false; }

    constructor() { this.state = "inactive"; }

    start() {
      this.state = "recording";
      events.push("recorder:start");
    }

    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["take"], { type: "audio/webm" }) });
      this.onstop?.();
    }
  }

  class Param {
    constructor() { this.value = 1; }
    setValueAtTime() {}
    linearRampToValueAtTime() {}
  }

  class AudioContext {
    constructor() {
      this.currentTime = 10;
      this.destination = {};
      this.closeCalls = 0;
      this.decodeCalls = 0;
      this.oscillators = [];
      this.sources = [];
      contexts.push(this);
    }

    close() {
      this.closeCalls += 1;
      return Promise.resolve();
    }

    createAnalyser() {
      return {
        fftSize: 256,
        getFloatTimeDomainData(samples) { samples.fill(0); },
        smoothingTimeConstant: 0,
      };
    }

    createBufferSource() {
      const source = {
        buffer: null,
        connect() {},
        startTimes: [],
        start(when) { this.startTimes.push(when); },
        stop() {},
      };
      this.sources.push(source);
      return source;
    }

    createGain() {
      if (melodyStartError) throw melodyStartError;
      return { connect() {}, gain: new Param() };
    }

    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }

    createOscillator() {
      const oscillator = {
        connect() {},
        frequency: new Param(),
        onended: null,
        startTimes: [],
        stop() {},
        type: "sine",
        start(when) {
          this.startTimes.push(when);
          if (this.type === "triangle") events.push("melody:start");
        },
      };
      this.oscillators.push(oscillator);
      return oscillator;
    }

    decodeAudioData() {
      this.decodeCalls += 1;
      return decodeError ? Promise.reject(decodeError) : Promise.resolve({ duration: 1 });
    }
    resume() {
      return contexts.length === 1 && melodyPreparationError
        ? Promise.reject(melodyPreparationError)
        : Promise.resolve();
    }
  }

  globalThis.AudioContext = AudioContext;
  globalThis.MediaRecorder = Recorder;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      async getUserMedia() {
        if (rejectMicrophone) throw new Error("microphone denied");
        return { getTracks: () => [track] };
      },
    },
  });

  return {
    callbacks,
    contexts,
    events,
    track,
    failBackingProgress(error = new Error("recording progress failed")) {
      const frame = [...callbacks].find(([, callback]) => callback.name === "tick");
      assert.ok(frame, "recording should schedule a presentation frame");
      const [frameId, callback] = frame;
      callbacks.delete(frameId);
      failingCallback = callback;
      frameFailure = error;
      callback(0);
    },
    finishBacking() {
      const backing = contexts.find(({ oscillators }) =>
        oscillators.some(({ type, startTimes }) => type === "triangle" && startTimes[0] === 10),
      );
      assert.ok(backing, "recording should schedule the prepared backing");
      const terminal = backing.oscillators.at(-1);
      assert.equal(typeof terminal.onended, "function");
      terminal.onended();
    },
  };
}

function renderProjectHome(viewProps = {}) {
  return renderToStaticMarkup(createElement(DubProjectHome, {
    activeLine: DUB_LINES[0],
    locked: false,
    needsRetake: {},
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
  it("keeps the nursery-rhyme catalog English with the approved recording caution", () => {
    const html = renderNurseryRhymes("zh-Hans");

    assert.match(html, /<h1[^>]*>Nursery rhymes<\/h1>/);
    assert.match(html, /Ask a grown-up before recording/);
    assert.match(
      html,
      /<span[^>]*lang="zh-Hans"[^>]*>录音前请先征得家长同意。<\/span>/,
    );
    assert.match(html, /aria-label="Back to home"/);
    assert.doesNotMatch(html, /返回首页|童谣/);
  });

  it("keeps optional waveform setup failures from interrupting recording", async () => {
    globalThis.AudioContext = class AudioContext {
      constructor() {
        throw new Error("Audio graph unavailable.");
      }
    };

    const container = await mountStrict(createElement(DubTakeWaveform, {
      blob: null,
      durationMs: 4_000,
      guidePeakBars: [1, ...Array(31).fill(0)],
      recordingElapsedMs: 500,
      recordingStream: { getTracks: () => [] },
    }));

    await waitFor(() => assert.ok(
      container.querySelector('[aria-label="Original audio waveform"]'),
    ));
    assert.equal(
      container.querySelector('[aria-label="Original audio waveform"] rect')?.getAttribute("height"),
      "32",
    );
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
      durationMs: 4_000,
      guidePeakBars: [1, ...Array(31).fill(0)],
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
      durationMs: 4_000,
      guidePeakBars: [1, ...Array(31).fill(0)],
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
        durationMs: 4_000,
        guidePeakBars: [1, ...Array(31).fill(0)],
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

  it("offers responsive resolution candidates for illustrated scenes", () => {
    const html = renderToStaticMarkup(createElement(IllustratedDubScene, {
      definition: FIVE_LITTLE_DUCKS_DUB,
      line: DUB_LINES[0],
    }));
    const expectedSrcSet =
      "https://media.parrotbook.com/assets/v6/dubbing/five-little-ducks/scene-1-five-ducklings-384.webp 384w, " +
      "https://media.parrotbook.com/assets/v6/dubbing/five-little-ducks/scene-1-five-ducklings-768.webp 768w, " +
      "https://media.parrotbook.com/assets/v6/dubbing/five-little-ducks/scene-1-five-ducklings.webp 1536w";

    assert.match(html, new RegExp(`srcSet="${expectedSrcSet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(
      html,
      /sizes="\(max-width: 559px\) calc\(100vw - 1.5rem\), \(min-width: 560px\) and \(max-height: 620px\) 58vw, \(max-width: 767px\) calc\(100vw - 1.5rem\), \(max-width: 1023px\) calc\(100vw - 3rem\), min\(70vw, 70rem\)"/,
    );
  });

  it("offers responsive resolution candidates for v7 line artwork", () => {
    const html = renderToStaticMarkup(createElement(IllustratedDubScene, {
      definition: ROW_ROW_ROW_YOUR_BOAT_DUB,
      line: ROW_ROW_ROW_YOUR_BOAT_DUB.lines[1],
    }));

    assert.match(
      html,
      /srcSet="https:\/\/media\.parrotbook\.com\/assets\/v7\/dubbing\/row-row-row-your-boat\/line-2-gentle-stream-384\.webp 384w, https:\/\/media\.parrotbook\.com\/assets\/v7\/dubbing\/row-row-row-your-boat\/line-2-gentle-stream-768\.webp 768w, https:\/\/media\.parrotbook\.com\/assets\/v7\/dubbing\/row-row-row-your-boat\/line-2-gentle-stream\.webp 1536w"/,
    );
  });

  it("falls back to the original artwork when a responsive candidate fails", async () => {
    const container = await mountStrict(createElement(IllustratedDubScene, {
      definition: FIVE_LITTLE_DUCKS_DUB,
      line: DUB_LINES[0],
    }));
    const image = container.querySelector("img");
    assert.ok(image);
    assert.match(image.srcset, /-384\.webp 384w/);

    image.dispatchEvent(new globalThis.Event("error"));

    assert.equal(image.getAttribute("srcset"), null);
    assert.equal(image.getAttribute("sizes"), null);
    assert.equal(image.src, FIVE_LITTLE_DUCKS_DUB.sceneArtwork[0].src);
  });

  it("offers responsive resolution candidates for scene navigation thumbnails", () => {
    const html = renderProjectHome();

    assert.equal(
      (html.match(/<img[^>]*sizes="[^"]+"[^>]*srcSet="[^"]+"/g) ?? []).length,
      FIVE_LITTLE_DUCKS_DUB.sceneArtwork.length + 1,
    );
    assert.match(
      html,
      /sizes="\(min-width: 560px\) and \(max-height: 620px\) 1px, \(max-width: 1023px\) calc\(\(100vw - 3.75rem\) \/ 2\), 12rem"/,
    );
  });

  it("publishes both responsive widths for every unique dubbing artwork source", () => {
    const artworkSources = new Set([
      NURSERY_RHYMES_COVER_ARTWORK.src,
      ...DUB_DEFINITIONS.flatMap((definition) => [
        ...definition.sceneArtwork.map(({ src }) => src),
        ...(definition.lineArtwork ?? []).map(({ src }) => src),
      ]),
    ]);
    const expectedTargets = new Set();
    assert.equal(artworkSources.size, 25);

    for (const source of artworkSources) {
      const match = /^\/assets\/v(\d+)\/(dubbing\/.+\.webp)$/.exec(
        new URL(source).pathname,
      );
      assert.ok(match, `Expected a versioned dubbing source: ${source}`);
      const [, version, canonicalPath] = match;
      for (const width of [384, 768]) {
        const responsivePath = canonicalPath.replace(/\.webp$/, `-${width}.webp`);
        const targetKey = `assets/v${version}/${responsivePath}`;
        expectedTargets.add(targetKey);
        const planned = staticMediaPlan.find((asset) => asset.targetKey === targetKey);
        assert.equal(planned?.resizeWidth, width);
        assert.equal(planned?.sourceKey, `assets/v${version}/${canonicalPath}`);
      }
    }

    assert.deepEqual(
      new Set(staticMediaPlan
        .filter(({ path, resizeWidth }) =>
          resizeWidth && path.startsWith("dubbing/"),
        )
        .map(({ targetKey }) => targetKey)),
      expectedTargets,
    );
  });

  it("shows one scene while changing artwork for every short-rhyme line", () => {
    for (const definition of [
      ROW_ROW_ROW_YOUR_BOAT_DUB,
      HUMPTY_DUMPTY_DUB,
    ]) {
      const renderedLines = definition.lines.map((line) =>
        renderToStaticMarkup(createElement(IllustratedDubScene, {
          definition,
          line,
          thumbnail: true,
        })),
      );
      const sources = renderedLines.map((html) =>
        /src="([^"]+)"/.exec(html)?.[1],
      );
      assert.equal(new Set(sources).size, 4, definition.id);

      const project = renderProjectHome({
        activeLine: definition.lines[0],
        definition,
      });
      assert.equal(
        (project.match(/aria-label="Scene \d, [^"]+, Ready to start"/g) ?? []).length,
        1,
        definition.id,
      );
    }
  });

  it("renders a selectable six-scene project workspace without line controls", () => {
    const html = renderProjectHome();
    assert.match(html, /aria-label="Full video player"/);
    assert.match(html, /aria-label="Play full video"/);
    assert.match(html, /aria-label="Scene selection"/);
    assert.match(html, /aria-current="step"/);
    assert.doesNotMatch(html, />Choose a scene<\/h2>/);
    assert.match(html, />Start with Scene 1</);
    for (let scene = 1; scene <= 6; scene += 1) {
      assert.match(html, new RegExp(`aria-label="Scene ${scene}, [^"]+, Ready to start"`));
    }
    assert.doesNotMatch(html, /data-status-icon="not-started"/);
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
    const retake = renderProjectHome({ needsRetake: { "line-5": true }, saved });
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
    assert.doesNotMatch(html, /data-status-icon="not-started"/);
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
      needsRetake: { "line-5": true },
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });
    assert.match(html, />Fix Scene 2</);
    assert.match(html, /aria-label="Scene 2, Four little ducks, Needs a new take"/);
  });

  it("shows non-blocking project playback errors and retake status", () => {
    const html = renderProjectHome({
      error: "Scene 2, line 1 could not play. The video will continue without it.",
      needsRetake: { "line-5": true },
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

  it("retries automatic recording from listen-only playback without a guardian gate", async () => {
    let statusLoads = 0;
    let recordingAvailable = false;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        statusLoads += 1;
        return Response.json({
          ...enabledDubStatus(),
          recordingEnabled: recordingAvailable,
        });
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.match(
      container.textContent,
      /You can watch the video now/,
    ));
    assert.ok(container.querySelector('[aria-label="Play full video"]'));
    assert.doesNotMatch(
      container.textContent,
      /ask a grown-up|guardian|permission/i,
    );
    assert.equal(
      [...container.querySelectorAll("button")].filter(({ textContent }) =>
        /Start dubbing|Continue dubbing|Continue Scene/.test(textContent),
      ).length,
      0,
    );

    recordingAvailable = true;
    const loadsBeforeRetry = statusLoads;
    await click(
      [...container.querySelectorAll("button")].find(({ textContent }) =>
        textContent?.includes("Try recording again"),
      ),
    );
    await waitFor(() =>
      assert.ok(container.querySelector('[aria-label="Scene selection"]'))
    );
    assert.equal(statusLoads, loadsBeforeRetry + 1);
  });

  it("starts microphone capture before the selected melody and saves once at phrase end", async () => {
    const audio = installSynchronizedRecordingHarness();
    let uploads = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json(enabledDubStatus());
      }
      if (path === "/api/dubs/five-little-ducks-v2/lines/line-1" && init.method === "PUT") {
        uploads += 1;
        return Response.json({ recordedAt: "2026-08-25T10:00:00.000Z" }, { status: 201 });
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label^="Scene 1,"]')));
    await click(container.querySelector('[aria-label^="Scene 1,"]'));
    await click(container.querySelector('[aria-label="Record line"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Stop recording"]')));

    assert.deepEqual(audio.events.slice(0, 2), ["recorder:start", "melody:start"]);
    assert.equal(
      container.querySelector('[aria-label="Recording time"]')?.getAttribute("aria-valuemax"),
      "4000",
    );

    await act(async () => audio.finishBacking());
    await waitFor(() => assert.equal(uploads, 1));
    assert.equal(audio.contexts[0].closeCalls, 1);
  });

  it("saves a partial take when the learner stops the melody early", async () => {
    const audio = installSynchronizedRecordingHarness();
    let uploads = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) return Response.json(enabledDubStatus());
      if (path === "/api/dubs/five-little-ducks-v2/lines/line-1" && init.method === "PUT") {
        uploads += 1;
        return Response.json({ recordedAt: "2026-08-25T10:00:00.000Z" }, { status: 201 });
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label^="Scene 1,"]')));
    await click(container.querySelector('[aria-label^="Scene 1,"]'));
    await click(container.querySelector('[aria-label="Record line"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Stop recording"]')));
    await click(container.querySelector('[aria-label="Stop recording"]'));

    await waitFor(() => assert.equal(uploads, 1));
    assert.deepEqual(audio.events.slice(0, 2), ["recorder:start", "melody:start"]);
    assert.equal(audio.contexts[0].closeCalls, 1);
  });

  it("discards an active recorder when the backing progress loop fails", async () => {
    const audio = installSynchronizedRecordingHarness();
    let uploads = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) return Response.json(enabledDubStatus());
      if (init.method === "PUT") uploads += 1;
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label^="Scene 1,"]')));
    await click(container.querySelector('[aria-label^="Scene 1,"]'));
    await click(container.querySelector('[aria-label="Record line"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Stop recording"]')));
    await act(async () => audio.failBackingProgress());
    await waitFor(() => assert.match(container.textContent, /melody could not start/i));

    assert.equal(uploads, 0);
    assert.equal(audio.track.stopped, true);
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.ok(container.querySelector('[aria-label="Record line"]'));
  });

  it("discards an active recording and backing on unmount without uploading", async () => {
    const audio = installSynchronizedRecordingHarness();
    let uploads = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) return Response.json(enabledDubStatus());
      if (init.method === "PUT") uploads += 1;
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label^="Scene 1,"]')));
    await click(container.querySelector('[aria-label^="Scene 1,"]'));
    await click(container.querySelector('[aria-label="Record line"]'));
    await waitFor(() => assert.ok(container.querySelector('[aria-label="Stop recording"]')));
    await cleanupMountedRoots();

    assert.equal(uploads, 0);
    assert.deepEqual(audio.events.slice(0, 2), ["recorder:start", "melody:start"]);
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.equal(audio.track.stopped, true);
  });

  it("stops prepared backing when microphone access is rejected", async () => {
    const audio = installSynchronizedRecordingHarness({ rejectMicrophone: true });
    let uploads = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) return Response.json(enabledDubStatus());
      if (init.method === "PUT") uploads += 1;
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label^="Scene 1,"]')));
    await click(container.querySelector('[aria-label^="Scene 1,"]'));
    await click(container.querySelector('[aria-label="Record line"]'));
    await waitFor(() => assert.match(container.textContent, /microphone is off/i));

    assert.equal(uploads, 0);
    assert.equal(audio.contexts[0].closeCalls, 1);
  });

  it("adds Chinese guidance only to the microphone-permission failure", async () => {
    installSynchronizedRecordingHarness({ rejectMicrophone: true });
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json(enabledDubStatus());
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub("zh-Hans");
    await waitFor(() => assert.ok(container.querySelector('[aria-label^="Scene 1,"]')));
    await click(container.querySelector('[aria-label^="Scene 1,"]'));
    await click(container.querySelector('[aria-label="Record line"]'));
    await waitFor(() => assert.match(container.textContent, /microphone is off/i));

    const helper = [...container.querySelectorAll('[lang="zh-Hans"]')].find(
      ({ textContent }) =>
        textContent === "请让家长开启麦克风权限，然后重试。",
    );
    assert.ok(helper);

    await click(container.querySelector('[aria-label="Back to full video"]'));
    await waitFor(() => assert.equal(
      [...container.querySelectorAll('[lang="zh-Hans"]')].filter(
        ({ textContent }) =>
          textContent === "请让家长开启麦克风权限，然后重试。",
      ).length,
      0,
    ));
  });

  it("cancels the microphone session when prepared melody start fails", async () => {
    const audio = installSynchronizedRecordingHarness({ melodyStartError: new Error("melody failed") });
    let uploads = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) return Response.json(enabledDubStatus());
      if (init.method === "PUT") uploads += 1;
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label^="Scene 1,"]')));
    await click(container.querySelector('[aria-label^="Scene 1,"]'));
    await click(container.querySelector('[aria-label="Record line"]'));
    await waitFor(() => assert.match(container.textContent, /melody could not start/i));

    assert.equal(uploads, 0);
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.equal(audio.track.stopped, true);
  });

  it("does not open microphone capture when melody preparation fails", async () => {
    const audio = installSynchronizedRecordingHarness({ melodyPreparationError: new Error("melody unavailable") });
    let uploads = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) return Response.json(enabledDubStatus());
      if (init.method === "PUT") uploads += 1;
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label^="Scene 1,"]')));
    await click(container.querySelector('[aria-label^="Scene 1,"]'));
    await click(container.querySelector('[aria-label="Record line"]'));
    await waitFor(() => assert.match(container.textContent, /melody could not start/i));

    assert.equal(audio.events.includes("recorder:start"), false);
    assert.equal(uploads, 0);
    assert.equal(audio.contexts[0].closeCalls, 1);
  });

  it("synchronizes guide and saved-take voices with their melody", async () => {
    const audio = installSynchronizedRecordingHarness();
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json(enabledFirstSceneStatus());
      }
      if (String(path).endsWith(".mp3") || String(path).endsWith("/audio")) {
        return new Response(new Uint8Array([1, 2, 3]));
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label^="Scene 1,"]')));
    await click(container.querySelector('[aria-label^="Scene 1,"]'));
    const hearLine = () => [...container.querySelectorAll("button")].find(
      ({ textContent }) => textContent?.includes("Hear line"),
    );
    await waitFor(() => assert.ok(hearLine()));
    await click(hearLine());
    await waitFor(() => assert.ok(audio.contexts.some(({ sources }) => sources.length)));
    const guide = audio.contexts.find(({ sources }) => sources.length);
    assert.equal(
      guide.sources[0].startTimes[0],
      guide.oscillators.find(({ type }) => type === "triangle").startTimes[0],
    );

    await click(container.querySelector('[aria-label="Play my recording"]'));
    await waitFor(() => assert.equal(audio.contexts.filter(({ sources }) => sources.length).length, 2));
    const take = audio.contexts.filter(({ sources }) => sources.length)[1];
    assert.equal(
      take.sources[0].startTimes[0],
      take.oscillators.find(({ type }) => type === "triangle").startTimes[0],
    );
  });

  it("does not leave melody playing when a guide cannot decode", async () => {
    const audio = installSynchronizedRecordingHarness({
      decodeError: new Error("guide bytes cannot decode"),
    });
    const guideFetches = [];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json(enabledDubStatus());
      }
      if (String(path).endsWith(".mp3")) {
        guideFetches.push(String(path));
        return new Response(new Uint8Array([1, 2, 3]));
      }
      throw new Error(`Unexpected dub request: ${init.method} ${path}`);
    };

    const container = await mountDuckDub();
    await waitFor(() => assert.ok(container.querySelector('[aria-label^="Scene 1,"]')));
    await click(container.querySelector('[aria-label^="Scene 1,"]'));
    await click([...container.querySelectorAll("button")].find(
      ({ textContent }) => textContent?.includes("Hear line"),
    ));

    await waitFor(() => assert.equal(
      container.querySelector('[role="alert"]')?.textContent,
      "I could not play that example. You can still record the words you see.",
    ));
    assert.equal(guideFetches.length, 1);
    assert.equal(audio.contexts[0].decodeCalls, 1);
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.deepEqual(audio.contexts[0].sources, []);
    assert.deepEqual(audio.contexts[0].oscillators, []);
    assert.ok([...container.querySelectorAll("button")].some(
      ({ textContent }) => textContent?.includes("Hear line"),
    ));
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

  it("plays a previously saved recording directly without using the guide", async () => {
    const audio = installSynchronizedRecordingHarness();
    const fetches = [];
    globalThis.fetch = async (path, init = {}) => {
      fetches.push(String(path));
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json(enabledFirstSceneStatus());
      }
      if (path === "/api/dubs/five-little-ducks-v2/lines/line-1/audio" && !init.method) {
        return new Response(new Uint8Array([1, 2, 3]));
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
    await waitFor(() => assert.ok(audio.contexts.some(({ sources }) => sources.length)));

    assert.equal(fetches.filter((path) => path.endsWith("/lines/line-1/audio")).length, 1);
    assert.equal(fetches.some((path) => path.includes("/assets/audio/")), false);
    assert.ok(container.querySelector('[aria-label="Record again"]'));
    await click(container.querySelector('[aria-label="Stop my recording"]'));
  });

  it("shows listen-only playback immediately when saved recording playback reports consent loss", async () => {
    installSynchronizedRecordingHarness();
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
    const audio = installSynchronizedRecordingHarness();
    let savedTakeRequests = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/dubs/five-little-ducks-v2" && !init.method) {
        return Response.json(enabledFirstSceneStatus());
      }
      if (path === "/api/dubs/five-little-ducks-v2/lines/line-1/audio" && !init.method) {
        savedTakeRequests += 1;
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
    assert.equal(savedTakeRequests, 1);
    assert.equal(audio.contexts[0].decodeCalls, 0);
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.deepEqual(audio.contexts[0].sources, []);
    assert.deepEqual(audio.contexts[0].oscillators, []);
    assert.ok(container.querySelector('[aria-label="Scene video"]'));
    assert.ok(container.querySelector('[aria-label="Record again"]'));
    await click(container.querySelector('[aria-label="Back to full video"]'));
    await waitFor(() => assert.ok(
      container.querySelector('[aria-label="Scene 1, Five little ducks, Needs a new take"]'),
    ));
  });

  it("keeps pending preview playback private-GET free with a separate URL lifetime", async () => {
    const audio = installSynchronizedRecordingHarness();
    const privateFetches = [];
    const revokedUrls = [];
    URL.createObjectURL = () => "blob:pending-take";
    URL.revokeObjectURL = (url) => revokedUrls.push(url);
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
      if (path === "blob:pending-take") return new Response(new Uint8Array([1, 2, 3]));
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
    await waitFor(() => assert.ok(audio.contexts.some(({ sources }) => sources.length)));
    await click(container.querySelector('[aria-label="Stop my recording"]'));

    assert.deepEqual(privateFetches, []);
    assert.deepEqual(revokedUrls, []);
  });

  it("does not start saved playback after its pending request is aborted", async () => {
    const audio = installSynchronizedRecordingHarness();
    let resolveAudioFetch;
    let audioResponseReturned = false;
    const audioResponse = new Promise((resolve) => { resolveAudioFetch = resolve; });
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
    assert.equal(audio.contexts.some(({ sources }) => sources.length), false);
  });

  it("keeps successor saved playback active when an older aborted fetch settles", async () => {
    const audio = installSynchronizedRecordingHarness();
    let audioFetchCount = 0;
    let resolveOlderAudioFetch;
    let olderAudioResponseReturned = false;
    const olderAudioResponse = new Promise((resolve) => { resolveOlderAudioFetch = resolve; });
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
    await waitFor(() => assert.ok(audio.contexts.some(({ sources }) => sources.length)));

    assert.equal(audioFetchCount, 2);

    resolveOlderAudioFetch(new Response(new Blob(["older learner voice"], { type: "audio/webm" })));
    await waitFor(() => assert.equal(olderAudioResponseReturned, true));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    assert.ok(container.querySelector('[aria-label="Stop my recording"]'));

    await click(container.querySelector('[aria-label="Stop my recording"]'));
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
      needsRetake: { "line-5": true },
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
      activeLine: DUB_LINES[0],
    });

    assert.match(html, /Five little ducks went out one day\./);
    assert.match(html, /aria-label="Original audio waveform"/);
    assert.match(html, /aria-label="Record line"/);
  });

  it("derives recording copy and progress from the selected melody phrase", () => {
    const line = OLD_MACDONALD_DUB.lines[2];
    const idle = renderSceneEditor({ activeLine: line, definition: OLD_MACDONALD_DUB });
    const recording = renderSceneEditor({
      activeLine: line,
      definition: OLD_MACDONALD_DUB,
      operation: "recording",
      recordingElapsedMs: 1_500,
      recordingStream: { getTracks: () => [] },
    });

    assert.match(idle, /Melody length: 0:02/);
    assert.match(recording, /Recording with melody/);
    assert.match(recording, /0:01 \/ 0:02/);
    assert.match(recording, /aria-valuemax="2000"/);
    assert.match(recording, /aria-valuenow="1500"/);
  });

  it("turns the phrase-length record action into an immediate stop action with elapsed time", () => {
    const html = renderSceneEditor({
      operation: "recording",
      recordingStream: { getTracks: () => [] },
      recordingElapsedMs: 2_100,
    });
    assert.match(html, /aria-label="Stop recording"/);
    assert.match(html, /role="timer"[\s\S]*?Recording with melody[\s\S]*?0:02 \/ 0:04/);
    assert.match(html, /<div(?=[^>]*aria-label="Recording time")(?=[^>]*aria-valuemax="4000")(?=[^>]*aria-valuenow="2100")(?=[^>]*role="progressbar")[^>]*>/);
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

  it("resolves saved and unsaved playback from explicit line guide metadata", () => {
    const line = {
      id: "line-5",
      guideAudioSrc:
        "/assets/nursery-rhymes/five-little-ducks/guides/five-little-ducks-v2-guide-line-5.mp3",
    };
    assert.deepEqual(
      resolveDubLineAudioSource(line, { "line-5": "saved" }, "five-little-ducks-v2"),
      {
        fallbackUrl: line.guideAudioSrc,
        preferredUrl: "/api/dubs/five-little-ducks-v2/lines/line-5/audio",
      },
    );
    assert.deepEqual(resolveDubLineAudioSource(line, {}, "five-little-ducks-v2"), {
      preferredUrl: line.guideAudioSrc,
    });
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
          preferredUrl: line.guideAudioSrc,
        });
        assert.match(source.preferredUrl, /^\/assets\/nursery-rhymes\//);
        assert.equal(source.preferredUrl.includes("/api/dubs/"), false);
        assert.equal(Object.hasOwn(source, "fallbackUrl"), false);
      }
    }
  });
});
