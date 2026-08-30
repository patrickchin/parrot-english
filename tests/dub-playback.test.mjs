import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DubNotEnabledError } from "../src/dubbing/dub-api.ts";
import { DUB_LINES } from "../src/dubbing/dub-script.ts";
import {
  OLD_MACDONALD_DUB,
  TWINKLE_TWINKLE_DUB,
} from "../src/dubbing/rhyme-catalog.ts";
import {
  prepareDubLineBacking,
  scheduleDubAudio,
  startDubPlayback,
} from "../src/dubbing/dub-playback.ts";

function abortError() {
  const error = new Error("request aborted");
  error.name = "AbortError";
  return error;
}

function lineIdFromUrl(url) {
  return url.match(/\/lines\/([^/]+)\/audio$/)?.[1]
    ?? url.match(/(five-little-ducks-v2-guide-[^./]+|old-macdonald-v1-guide-[^./]+)\.mp3$/)?.[1]?.replace(/^(five-little-ducks-v2-guide-|old-macdonald-v1-guide-)/, "");
}

function guideUrl(lineId) {
  return `/assets/audio/five-little-ducks-v2-guide-${lineId}.mp3`;
}

function roundedFrequency(oscillator) {
  return Number(oscillator.frequency.value.toFixed(3));
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function createPendingFetch() {
  const abortedLineIds = [];
  const calls = [];
  return {
    abortedLineIds,
    calls,
    fetch(url, init) {
      const lineId = lineIdFromUrl(url);
      calls.push([url, init]);
      return new Promise((_, reject) => {
        const handleAbort = () => {
          abortedLineIds.push(lineId);
          reject(abortError());
        };
        if (init.signal.aborted) handleAbort();
        else init.signal.addEventListener("abort", handleAbort, { once: true });
      });
    },
  };
}

function createRaf() {
  let nextId = 1;
  const callbacks = new Map();
  const cancelled = [];
  return {
    callbacks,
    cancelled,
    cancelAnimationFrame(id) {
      cancelled.push(id);
      callbacks.delete(id);
    },
    requestAnimationFrame(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    runNext() {
      const [id, callback] = callbacks.entries().next().value;
      callbacks.delete(id);
      callback(0);
      return id;
    },
  };
}

function createTimerHarness() {
  const callbacks = [];
  return {
    setTimeout(callback, delay) {
      assert.equal(delay, 0);
      callbacks.push(callback);
      return callbacks.length;
    },
    runNext() {
      callbacks.shift()?.();
    },
  };
}

function trackAbortListeners(signal) {
  const addEventListener = signal.addEventListener.bind(signal);
  const removeEventListener = signal.removeEventListener.bind(signal);
  const calls = { adds: 0, removes: 0 };
  signal.addEventListener = (type, listener, options) => {
    if (type === "abort") calls.adds += 1;
    return addEventListener(type, listener, options);
  };
  signal.removeEventListener = (type, listener, options) => {
    if (type === "abort") calls.removes += 1;
    return removeEventListener(type, listener, options);
  };
  return calls;
}

function createAudioHarness({
  closeDeferred,
  decodeDurations = {},
  decodeFailure,
  decodeFailureLineId,
  decodeNeverLineId,
  oscillatorStopFailure,
  resumeDeferred,
} = {}) {
  const contexts = [];
  const lineMarkers = new Map();
  let nextMarker = 1;

  class FakeParam {
    constructor() {
      this.value = 1;
      this.events = [];
    }

    setValueAtTime(value, time) {
      this.events.push(["set", value, time]);
    }

    linearRampToValueAtTime(value, time) {
      this.events.push(["ramp", value, time]);
    }
  }

  class FakeAudioContext {
    constructor() {
      this.currentTime = 10;
      this.destination = { kind: "destination" };
      this.gains = [];
      this.oscillators = [];
      this.sources = [];
      this.closeCalls = 0;
      this.resumeCalls = 0;
      contexts.push(this);
    }

    async close() {
      this.closeCalls += 1;
      await closeDeferred?.promise;
    }

    createBufferSource() {
      const source = {
        buffer: null,
        connections: [],
        startTimes: [],
        stopCalls: 0,
        connect(output) {
          this.connections.push(output);
        },
        start(when) {
          this.startTimes.push(when);
        },
        stop() {
          this.stopCalls += 1;
          if (this.stopCalls > 1) throw new Error("source stopped twice");
        },
      };
      this.sources.push(source);
      return source;
    }

    createGain() {
      const gain = {
        connections: [],
        gain: new FakeParam(),
        connect(output) {
          this.connections.push(output);
        },
      };
      this.gains.push(gain);
      return gain;
    }

    createOscillator() {
      const oscillator = {
        connections: [],
        frequency: new FakeParam(),
        startTimes: [],
        stopCalls: 0,
        stopTimes: [],
        type: "sine",
        connect(output) {
          this.connections.push(output);
        },
        start(when) {
          this.startTimes.push(when);
        },
        stop(when) {
          this.stopCalls += 1;
          this.stopTimes.push(when);
          if (oscillatorStopFailure && this.stopCalls === 1) {
            throw oscillatorStopFailure;
          }
        },
      };
      this.oscillators.push(oscillator);
      return oscillator;
    }

    async decodeAudioData(bytes) {
      const lineId = lineMarkers.get(new Uint8Array(bytes)[0]) ?? `line-${new Uint8Array(bytes)[0]}`;
      if (lineId === decodeNeverLineId) return new Promise(() => {});
      if (decodeFailure?.(bytes) || lineId === decodeFailureLineId) {
        throw new Error("codec detail");
      }
      return { duration: decodeDurations[lineId] ?? bytes.byteLength };
    }

    async resume() {
      this.resumeCalls += 1;
      await resumeDeferred?.promise;
    }
  }

  const fetchCalls = [];
  async function fetch(url, init) {
    fetchCalls.push([url, init]);
    const lineId = lineIdFromUrl(url);
    const marker = nextMarker++;
    lineMarkers.set(marker, lineId);
    return new Response(new Uint8Array([marker, 2, 3, 4]));
  }

  return { AudioContext: FakeAudioContext, contexts, fetch, fetchCalls };
}

describe("duck dub playback", () => {
  it("schedules available voices from authored cues and stops once", () => {
    const starts = [];
    const sources = new Map(
      DUB_LINES.filter(({ id }) => id !== "line-3").map(({ id }, index) => [
        id,
        {
          duration: 100 + index,
          stopCalls: 0,
          connect() {},
          start(when) {
            starts.push(when);
          },
          stop() {
            this.stopCalls += 1;
            if (this.stopCalls > 1) throw new Error("stopped twice");
          },
        },
      ]),
    );

    const stop = scheduleDubAudio({
      context: { currentTime: 10 },
      lineSources: sources,
      output: {},
      startAt: 11,
    });

    assert.deepEqual(starts, [
      11.8, 15.8, 23.8, 27.8, 31.8, 35.8, 39.8, 43.8,
      47.8, 51.8, 55.8, 59.8, 63.8, 67.8, 71.8, 75.8,
      79.8, 83.8, 87.8, 91.8, 95.8, 99.8, 103.8,
    ]);
    stop();
    stop();
    assert.deepEqual(
      [...sources.values()].map(({ stopCalls }) => stopCalls),
      Array.from({ length: 23 }, () => 1),
    );
  });

  it("prepares an exact two-second line backing without fetching audio", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const line = OLD_MACDONALD_DUB.lines[2];
    let ended = 0;
    const ticks = [];

    const backing = await prepareDubLineBacking({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      definition: OLD_MACDONALD_DUB,
      line,
      onEnded: () => { ended += 1; },
      onTick: (elapsedMs) => ticks.push(elapsedMs),
      requestAnimationFrame: raf.requestAnimationFrame,
    });

    assert.equal(backing.durationMs, 2_000);
    assert.equal(audio.fetchCalls.length, 0);
    assert.equal(audio.contexts[0].oscillators.length, 0);
    backing.start();

    const context = audio.contexts[0];
    const melody = context.oscillators.filter(({ type }) => type === "triangle");
    assert.equal(context.resumeCalls, 1);
    assert.equal(melody[0].startTimes[0], 10);
    context.currentTime = 12;
    raf.runNext();
    assert.equal(ended, 1);
    assert.equal(ticks.at(-1), 2_000);
    assert.equal(context.closeCalls, 1);
  });

  it("closes a prepared line backing once across stop and abort", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const controller = new AbortController();
    const backing = await prepareDubLineBacking({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      line: DUB_LINES[0],
      requestAnimationFrame: raf.requestAnimationFrame,
      signal: controller.signal,
    });

    backing.start();
    backing.stop();
    const scheduledStopCounts = audio.contexts[0].oscillators.map(({ stopCalls }) => stopCalls);
    backing.stop();
    controller.abort();

    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.deepEqual(
      audio.contexts[0].oscillators.map(({ stopCalls }) => stopCalls),
      scheduledStopCounts,
    );
    assert.equal(raf.callbacks.size, 0);
  });

  it("closes the prepared context when melody scheduling fails", async () => {
    const failure = new Error("music setup failed");
    const audio = createAudioHarness({ oscillatorStopFailure: failure });
    const backing = await prepareDubLineBacking({
      AudioContext: audio.AudioContext,
      line: DUB_LINES[0],
    });

    assert.throws(() => backing.start(), /music setup failed/);
    assert.equal(audio.contexts[0].closeCalls, 1);
    backing.stop();
    assert.equal(audio.contexts[0].closeCalls, 1);
  });

  it("does not end a prepared backing when its terminal tick aborts", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const controller = new AbortController();
    let ended = 0;
    const backing = await prepareDubLineBacking({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      line: DUB_LINES[0],
      onEnded: () => { ended += 1; },
      onTick(elapsedMs) {
        if (elapsedMs === 4_000) controller.abort();
      },
      requestAnimationFrame: raf.requestAnimationFrame,
      signal: controller.signal,
    });

    backing.start();
    audio.contexts[0].currentTime = 14;
    raf.runNext();

    assert.equal(ended, 0);
    assert.equal(audio.contexts[0].closeCalls, 1);
  });

  it("cleans up scheduled backing when its initial tick throws", async () => {
    const failure = new Error("initial tick failed");
    const audio = createAudioHarness();
    const backing = await prepareDubLineBacking({
      AudioContext: audio.AudioContext,
      line: DUB_LINES[0],
      onTick() {
        throw failure;
      },
    });

    assert.throws(() => backing.start(), (error) => error === failure);
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.ok(audio.contexts[0].oscillators.every(({ stopCalls }) => stopCalls === 2));
    backing.stop();
    assert.equal(audio.contexts[0].closeCalls, 1);
  });

  it("starts the Five Little Ducks melody and voices on the same phrase beats", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();

    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      lines: DUB_LINES.slice(0, 4),
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
    });

    const context = audio.contexts[0];
    const melody = context.oscillators.filter(({ type }) => type === "triangle");
    assert.deepEqual(
      melody.slice(0, 4).map(roundedFrequency),
      [329.628, 293.665, 293.665, 261.626],
    );
    assert.deepEqual(
      context.sources.map(({ startTimes }) => Number(startTimes[0].toFixed(2))),
      [10.12, 14.12, 18.12, 22.12],
    );
    for (const source of context.sources) {
      assert.ok(melody.some(
        ({ startTimes }) => startTimes[0] === source.startTimes[0],
      ));
    }
  });

  it("starts the Old MacDonald melody and voices on its variable phrase beats", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const lines = OLD_MACDONALD_DUB.lines.slice(0, 7);

    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      definition: OLD_MACDONALD_DUB,
      fetch: audio.fetch,
      lines,
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
    });

    const context = audio.contexts[0];
    const melody = context.oscillators.filter(({ type }) => type === "triangle");
    assert.deepEqual(
      melody.slice(0, 4).map(roundedFrequency),
      [523.251, 523.251, 523.251, 391.995],
    );
    assert.deepEqual(
      context.sources.map(({ startTimes }) => Number(startTimes[0].toFixed(2))),
      [10.12, 18.12, 26.12, 28.12, 30.12, 32.12, 34.12],
    );
    for (const source of context.sources) {
      assert.ok(melody.some(
        ({ startTimes }) => startTimes[0] === source.startTimes[0],
      ));
    }
  });

  it("advances Twinkle's melody through later visual scenes", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const lines = TWINKLE_TWINKLE_DUB.lines.slice(2, 4);

    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      definition: TWINKLE_TWINKLE_DUB,
      fetch: audio.fetch,
      lines,
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
    });

    const context = audio.contexts[0];
    const melody = context.oscillators.filter(({ type }) => type === "triangle");
    assert.deepEqual(
      melody.slice(0, 4).map(roundedFrequency),
      [783.991, 783.991, 698.456, 698.456],
    );
    assert.deepEqual(
      context.sources.map(({ startTimes }) => Number(startTimes[0].toFixed(2))),
      [10.12, 14.12],
    );
    for (const source of context.sources) {
      assert.ok(melody.some(
        ({ startTimes }) => startTimes[0] === source.startTimes[0],
      ));
    }
  });

  it("plays a complete rhyme through a six-second final recording", async () => {
    const lastLine = TWINKLE_TWINKLE_DUB.lines.at(-1);
    const audio = createAudioHarness({
      decodeDurations: { [lastLine.id]: 6 },
    });
    const raf = createRaf();
    const ticks = [];
    let ended = 0;

    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      definition: TWINKLE_TWINKLE_DUB,
      fetch: audio.fetch,
      onEnded: () => { ended += 1; },
      onTick: (elapsedMs) => ticks.push(elapsedMs),
      requestAnimationFrame: raf.requestAnimationFrame,
    });

    const context = audio.contexts[0];
    context.currentTime = 36.121;
    raf.runNext();
    assert.deepEqual(ticks.map(Math.round), [26_001]);
    assert.equal(ended, 0);
    assert.equal(context.closeCalls, 0);

    context.currentTime = 36.921;
    raf.runNext();
    assert.deepEqual(ticks.map(Math.round), [26_001, 26_800]);
    assert.equal(ended, 1);
    assert.equal(context.closeCalls, 1);
  });

  it("rejects undersized and oversized repeating music scores", async () => {
    for (const phraseCount of [1, 3]) {
      const definition = {
        ...TWINKLE_TWINKLE_DUB,
        music: {
          ...TWINKLE_TWINKLE_DUB.music,
          linePhrases: TWINKLE_TWINKLE_DUB.music.linePhrases.slice(0, phraseCount),
        },
      };
      const audio = createAudioHarness();
      const raf = createRaf();

      await assert.rejects(
        startDubPlayback({
          AudioContext: audio.AudioContext,
          cancelAnimationFrame: raf.cancelAnimationFrame,
          definition,
          fetch: audio.fetch,
          lines: definition.lines.slice(0, definition.linesPerScene),
          onTick() {},
          requestAnimationFrame: raf.requestAnimationFrame,
        }),
        /one phrase per line or scene line/,
      );
    }
  });

  it("decodes every private clip before sharing one voice, music, and visual clock", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const ticks = [];
    const controller = new AbortController();
    const playback = await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      onTick: (elapsedMs) => ticks.push(elapsedMs),
      requestAnimationFrame: raf.requestAnimationFrame,
      signal: controller.signal,
    });

    const context = audio.contexts[0];
    assert.equal(context.resumeCalls, 1);
    assert.deepEqual(
      audio.fetchCalls.map(([url]) => url),
      DUB_LINES.map(
        ({ id }) =>
          `/api/dubs/five-little-ducks-v2/lines/${id}/audio`,
      ),
    );
    assert.ok(
      audio.fetchCalls.every(
        ([, init]) =>
          init.credentials === "same-origin" &&
          init.signal === audio.fetchCalls[0][1].signal &&
          init.signal !== controller.signal,
      ),
    );

    const startAt = 10.12;
    assert.deepEqual(
      context.sources.map(({ startTimes }) => Number(startTimes[0].toFixed(2))),
      [
        10.92, 14.92, 18.92, 22.92, 26.92, 30.92, 34.92, 38.92,
        42.92, 46.92, 50.92, 54.92, 58.92, 62.92, 66.92, 70.92,
        74.92, 78.92, 82.92, 86.92, 90.92, 94.92, 98.92, 102.92,
      ],
    );
    assert.equal(context.gains[0].gain.value, 0.95);
    assert.deepEqual(context.gains[0].connections, [context.destination]);
    assert.equal(context.gains[1].gain.value, 0.12);
    assert.deepEqual(context.gains[1].connections, [context.gains[0]]);
    assert.equal(context.oscillators[0].startTimes[0], startAt);
    assert.ok(context.oscillators.length > 0);

    context.currentTime = startAt + 1.5;
    raf.runNext();
    assert.deepEqual(ticks, [1500]);

    context.currentTime = startAt + 100;
    raf.runNext();
    assert.deepEqual(ticks, [1500, 98_000]);
    assert.equal(context.closeCalls, 1);
    assert.equal(raf.callbacks.size, 0);

    playback.stop();
    controller.abort();
    await Promise.resolve();
    assert.equal(context.closeCalls, 1);
    assert.ok(context.sources.every(({ stopCalls }) => stopCalls === 1));
    assert.ok(context.oscillators.every(({ stopCalls }) => stopCalls === 2));
  });

  it("plays one selected verse through its complete six-second final take", async () => {
    const audio = createAudioHarness({ decodeDurations: { "line-8": 6 } });
    const raf = createRaf();
    const ticks = [];
    let ended = 0;
    const playback = await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      lines: DUB_LINES.slice(4, 8),
      onEnded() {
        ended += 1;
      },
      onTick: (elapsedMs) => ticks.push(elapsedMs),
      requestAnimationFrame: raf.requestAnimationFrame,
    });

    const context = audio.contexts[0];
    assert.deepEqual(
      audio.fetchCalls.map(([url]) => lineIdFromUrl(url)),
      ["line-5", "line-6", "line-7", "line-8"],
    );
    assert.deepEqual(
      context.sources.map(({ startTimes }) => Number(startTimes[0].toFixed(2))),
      [10.12, 14.12, 18.12, 22.12],
    );
    assert.ok(context.oscillators.length > 0);

    context.currentTime = 13.62;
    raf.runNext();
    assert.deepEqual(ticks, [3_500]);
    context.currentTime = 28.12;
    raf.runNext();
    assert.deepEqual(ticks, [3_500, 18_000]);
    assert.equal(ended, 1);
    assert.equal(context.closeCalls, 1);
    assert.equal(raf.callbacks.size, 0);

    playback.stop();
    assert.equal(context.closeCalls, 1);
  });

  it("lets the final verse outlive the shorter authored whole-dub tail", async () => {
    const audio = createAudioHarness({ decodeDurations: { "line-24": 6 } });
    const raf = createRaf();
    const ticks = [];
    let ended = 0;
    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      lines: DUB_LINES.slice(20, 24),
      onEnded: () => { ended += 1; },
      onTick: (elapsedMs) => ticks.push(elapsedMs),
      requestAnimationFrame: raf.requestAnimationFrame,
    });

    assert.deepEqual(
      audio.fetchCalls.map(([url]) => lineIdFromUrl(url)),
      ["line-21", "line-22", "line-23", "line-24"],
    );
    const context = audio.contexts[0];
    context.currentTime = 28.12;
    raf.runNext();
    assert.deepEqual(ticks, [18_000]);
    assert.equal(ended, 1);
  });

  it("keeps the final Duck scene on its legacy 17.2-second clock", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const ticks = [];
    let ended = 0;

    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      lines: DUB_LINES.slice(20, 24),
      onEnded: () => { ended += 1; },
      onTick: (elapsedMs) => ticks.push(elapsedMs),
      requestAnimationFrame: raf.requestAnimationFrame,
    });

    audio.contexts[0].currentTime = 27.33;
    raf.runNext();

    assert.deepEqual(ticks, [17_200]);
    assert.equal(ended, 1);
    assert.equal(audio.contexts[0].closeCalls, 1);
  });

  it("plays an Old MacDonald scene from scene-relative zero without treating it as the full rhyme", async () => {
    const audio = createAudioHarness({
      decodeDurations: {
        [OLD_MACDONALD_DUB.lines[13].id]: 6,
      },
    });
    const raf = createRaf();
    const ticks = [];
    let ended = 0;

    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      definition: OLD_MACDONALD_DUB,
      fetch: audio.fetch,
      lines: OLD_MACDONALD_DUB.lines.slice(7, 14),
      onEnded: () => { ended += 1; },
      onTick: (elapsedMs) => ticks.push(elapsedMs),
      requestAnimationFrame: raf.requestAnimationFrame,
    });

    assert.deepEqual(
      audio.fetchCalls.map(([url]) => lineIdFromUrl(url)),
      OLD_MACDONALD_DUB.lines.slice(7, 14).map(({ id }) => id),
    );
    const context = audio.contexts[0];
    assert.deepEqual(
      context.sources.map(({ startTimes }) => Number(startTimes[0].toFixed(2))),
      [10.12, 18.12, 26.12, 28.12, 30.12, 32.12, 34.12],
    );

    context.currentTime = 42.12;
    raf.runNext();

    assert.deepEqual(ticks, [32_000]);
    assert.equal(ended, 1);
  });

  it("keeps every Old MacDonald scene on its complete authored phrase boundary", async () => {
    const expectedDurations = [32_000, 32_000, 32_000, 32_000, 33_200];
    for (const [sceneIndex, sceneStart] of [0, 7, 14, 21, 28].entries()) {
      const lines = OLD_MACDONALD_DUB.lines.slice(sceneStart, sceneStart + 7);
      const audio = createAudioHarness({
        decodeDurations: Object.fromEntries(lines.map(({ id }) => [id, 0.25])),
      });
      const raf = createRaf();
      const ticks = [];
      let ended = 0;

      await startDubPlayback({
        AudioContext: audio.AudioContext,
        cancelAnimationFrame: raf.cancelAnimationFrame,
        definition: OLD_MACDONALD_DUB,
        fetch: audio.fetch,
        lines,
        onEnded: () => { ended += 1; },
        onTick: (elapsedMs) => ticks.push(elapsedMs),
        requestAnimationFrame: raf.requestAnimationFrame,
      });

      const context = audio.contexts[0];
      const expectedDuration = expectedDurations[sceneIndex];
      context.currentTime = 10.12 + (expectedDuration - 1) / 1_000;
      raf.runNext();

      assert.equal(Math.round(ticks[0]), expectedDuration - 1, `scene ${sceneIndex + 1}`);
      assert.equal(ended, 0, `scene ${sceneIndex + 1}`);
      assert.equal(context.closeCalls, 0, `scene ${sceneIndex + 1}`);
      assert.equal(raf.callbacks.size, 1, `scene ${sceneIndex + 1}`);

      context.currentTime = 10.12 + (expectedDuration + 1) / 1_000;
      raf.runNext();

      assert.equal(ticks.at(-1), expectedDuration, `scene ${sceneIndex + 1}`);
      assert.equal(ended, 1, `scene ${sceneIndex + 1}`);
      assert.equal(context.closeCalls, 1, `scene ${sceneIndex + 1}`);
      assert.equal(raf.callbacks.size, 0, `scene ${sceneIndex + 1}`);
      assert.ok(context.sources.every(({ stopCalls }) => stopCalls === 1));
      assert.ok(context.oscillators.every(({ stopCalls }) => stopCalls === 2));
    }
  });

  it("ends full Old MacDonald at the exact 162-second boundary", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const ticks = [];
    let ended = 0;

    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      definition: OLD_MACDONALD_DUB,
      fetch: audio.fetch,
      onEnded: () => { ended += 1; },
      onTick: (elapsedMs) => ticks.push(elapsedMs),
      requestAnimationFrame: raf.requestAnimationFrame,
    });

    const context = audio.contexts[0];
    context.currentTime = 172.119;
    raf.runNext();

    assert.deepEqual(ticks, [161_999]);
    assert.equal(ended, 0);
    assert.equal(context.closeCalls, 0);
    assert.equal(raf.callbacks.size, 1);

    context.currentTime = 172.121;
    raf.runNext();

    assert.deepEqual(ticks, [161_999, 162_000]);
    assert.equal(ended, 1);
    assert.equal(context.closeCalls, 1);
    assert.equal(raf.callbacks.size, 0);
    assert.ok(context.sources.every(({ stopCalls }) => stopCalls === 1));
    assert.ok(context.oscillators.every(({ stopCalls }) => stopCalls === 2));
  });

  it("loads guides for unsaved lines and private audio for saved lines", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const lines = DUB_LINES.slice(0, 2);

    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      lines,
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      resolveAudioSource(line) {
        return line.id === "line-1"
          ? {
              fallbackUrl: guideUrl(line.id),
              preferredUrl: `/api/dubs/five-little-ducks-v2/lines/${line.id}/audio`,
            }
          : { preferredUrl: guideUrl(line.id) };
      },
    });

    assert.deepEqual(
      audio.fetchCalls.map(([url]) => url),
      ["/api/dubs/five-little-ducks-v2/lines/line-1/audio", guideUrl("line-2")],
    );
  });

  it("contains a resolver exception to its line while the remaining animation and music continue", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const unavailable = [];
    const ticks = [];

    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      lines: DUB_LINES.slice(0, 2),
      onLineUnavailable(lineId) {
        unavailable.push(lineId);
      },
      onTick(elapsedMs) {
        ticks.push(elapsedMs);
      },
      requestAnimationFrame: raf.requestAnimationFrame,
      resolveAudioSource(line) {
        if (line.id === "line-1") throw new Error("guide lookup failed");
        return { preferredUrl: guideUrl(line.id) };
      },
    });

    assert.deepEqual(unavailable, ["line-1"]);
    assert.deepEqual(audio.fetchCalls.map(([url]) => url), [guideUrl("line-2")]);
    assert.equal(audio.contexts[0].sources.length, 1);
    assert.ok(audio.contexts[0].oscillators.length > 0);
    audio.contexts[0].currentTime = 11.12;
    raf.runNext();
    assert.deepEqual(ticks, [1_000]);
  });

  it("attempts a saved private source without a guide while another unresolved line is omitted", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const unavailable = [];
    const privateLineOne = "/api/dubs/five-little-ducks-v2/lines/line-1/audio";

    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      lines: DUB_LINES.slice(0, 2),
      onLineUnavailable(lineId) {
        unavailable.push(lineId);
      },
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      resolveAudioSource(line) {
        if (line.id === "line-2") throw new Error("guide lookup failed");
        return { preferredUrl: privateLineOne };
      },
    });

    assert.deepEqual(unavailable, ["line-2"]);
    assert.deepEqual(audio.fetchCalls.map(([url]) => url), [privateLineOne]);
    assert.equal(audio.contexts[0].sources.length, 1);
  });

  it("retries a private fetch with its guide and starts every voice", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const lines = DUB_LINES.slice(0, 2);
    const calls = [];
    const fallbacks = [];

    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      async fetch(url) {
        calls.push(url);
        if (url.includes("/api/dubs/")) return new Response(null, { status: 503 });
        return audio.fetch(url);
      },
      lines,
      onLineFallback(lineId, stage) {
        fallbacks.push([lineId, stage]);
      },
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      resolveAudioSource(line) {
        return line.id === "line-1"
          ? {
              fallbackUrl: guideUrl(line.id),
              preferredUrl: `/api/dubs/five-little-ducks-v2/lines/${line.id}/audio`,
            }
          : { preferredUrl: guideUrl(line.id) };
      },
    });

    assert.deepEqual(fallbacks, [["line-1", "fetch"]]);
    assert.deepEqual(calls, [
      "/api/dubs/five-little-ducks-v2/lines/line-1/audio",
      guideUrl("line-2"),
      guideUrl("line-1"),
    ]);
    assert.deepEqual(
      audio.contexts[0].sources.map(({ startTimes }) => startTimes),
      [[10.12], [14.12]],
    );
  });

  it("retries a private decode with its guide and continues", async () => {
    const audio = createAudioHarness({
      decodeFailure(bytes) {
        const values = new Uint8Array(bytes);
        return values[0] === 1 && values[1] === 9;
      },
    });
    const raf = createRaf();
    const calls = [];
    const fallbacks = [];

    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      async fetch(url, init) {
        calls.push(url);
        if (url.includes("/api/dubs/")) {
          return new Response(new Uint8Array([1, 9, 3, 4]));
        }
        return audio.fetch(url, init);
      },
      lines: DUB_LINES.slice(0, 2),
      onLineFallback(lineId, stage) {
        fallbacks.push([lineId, stage]);
      },
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      resolveAudioSource(line) {
        return line.id === "line-1"
          ? {
              fallbackUrl: guideUrl(line.id),
              preferredUrl: `/api/dubs/five-little-ducks-v2/lines/${line.id}/audio`,
            }
          : { preferredUrl: guideUrl(line.id) };
      },
    });

    assert.deepEqual(fallbacks, [["line-1", "decode"]]);
    assert.deepEqual(calls, [
      "/api/dubs/five-little-ducks-v2/lines/line-1/audio",
      guideUrl("line-2"),
      guideUrl("line-1"),
    ]);
    assert.deepEqual(
      audio.contexts[0].sources.map(({ startTimes }) => startTimes),
      [[10.12], [14.12]],
    );
  });

  it("omits only a line with no decodable source and reports it once", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const calls = [];
    const fallbacks = [];
    const unavailable = [];

    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      async fetch(url, init) {
        calls.push(url);
        if (lineIdFromUrl(url) === "line-1") {
          return new Response(null, { status: 503 });
        }
        return audio.fetch(url, init);
      },
      lines: DUB_LINES.slice(0, 2),
      onLineFallback(lineId, stage) {
        fallbacks.push([lineId, stage]);
      },
      onLineUnavailable(lineId) {
        unavailable.push(lineId);
      },
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      resolveAudioSource(line) {
        return line.id === "line-1"
          ? {
              fallbackUrl: guideUrl(line.id),
              preferredUrl: `/api/dubs/five-little-ducks-v2/lines/${line.id}/audio`,
            }
          : { preferredUrl: guideUrl(line.id) };
      },
    });

    assert.deepEqual(fallbacks, [["line-1", "fetch"]]);
    assert.deepEqual(unavailable, ["line-1"]);
    assert.deepEqual(calls, [
      "/api/dubs/five-little-ducks-v2/lines/line-1/audio",
      guideUrl("line-2"),
      guideUrl("line-1"),
    ]);
    assert.equal(audio.contexts[0].sources.length, 1);
  });

  it("keeps an all-unavailable scene on its authored clock with music", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const fallbacks = [];
    const unavailable = [];
    const ticks = [];
    let ended = 0;

    const playback = await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      async fetch() {
        return new Response(null, { status: 503 });
      },
      lines: DUB_LINES.slice(4, 8),
      onEnded() {
        ended += 1;
      },
      onLineFallback(lineId, stage) {
        fallbacks.push([lineId, stage]);
      },
      onLineUnavailable(lineId) {
        unavailable.push(lineId);
      },
      onTick(elapsedMs) {
        ticks.push(elapsedMs);
      },
      requestAnimationFrame: raf.requestAnimationFrame,
      resolveAudioSource(line) {
        return {
          fallbackUrl: guideUrl(line.id),
          preferredUrl: `/api/dubs/five-little-ducks-v2/lines/${line.id}/audio`,
        };
      },
    });

    const context = audio.contexts[0];
    assert.deepEqual(fallbacks, [
      ["line-5", "fetch"], ["line-6", "fetch"],
      ["line-7", "fetch"], ["line-8", "fetch"],
    ]);
    assert.deepEqual(unavailable, ["line-5", "line-6", "line-7", "line-8"]);
    assert.equal(context.sources.length, 0);
    assert.ok(context.oscillators.length > 0);

    context.currentTime = 18.12;
    raf.runNext();

    assert.deepEqual(ticks.map(Math.round), [8_000]);
    assert.equal(ended, 0);
    assert.equal(raf.callbacks.size, 1);

    context.currentTime = 26.12;
    raf.runNext();

    assert.deepEqual(ticks.map(Math.round), [8_000, 16_000]);
    assert.equal(ended, 1);
    assert.equal(context.closeCalls, 1);
    assert.equal(raf.callbacks.size, 0);
    playback.stop();
    assert.equal(context.closeCalls, 1);
  });

  it("holds a scene through a missing trailing slot and a longer decoded tail", async () => {
    const audio = createAudioHarness({ decodeDurations: { "line-7": 10 } });
    const raf = createRaf();
    const ticks = [];
    let ended = 0;

    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      async fetch(url, init) {
        if (lineIdFromUrl(url) === "line-8") {
          return new Response(null, { status: 503 });
        }
        return audio.fetch(url, init);
      },
      lines: DUB_LINES.slice(4, 8),
      onEnded: () => { ended += 1; },
      onTick: (elapsedMs) => ticks.push(elapsedMs),
      requestAnimationFrame: raf.requestAnimationFrame,
    });

    const context = audio.contexts[0];
    assert.ok(context.oscillators.length > 0);
    context.currentTime = 28.12;
    raf.runNext();

    assert.deepEqual(ticks, [18_000]);
    assert.equal(ended, 1);
  });

  it("classifies a preferred body-read failure as fetch before loading its guide", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const fallbacks = [];
    const privateLineOne = "/api/dubs/five-little-ducks-v2/lines/line-1/audio";

    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      async fetch(url, init) {
        if (url === privateLineOne) {
          return {
            ok: true,
            async arrayBuffer() {
              throw new Error("body detail");
            },
          };
        }
        return audio.fetch(url, init);
      },
      lines: DUB_LINES.slice(0, 2),
      onLineFallback(lineId, stage) {
        fallbacks.push([lineId, stage]);
      },
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      resolveAudioSource(line) {
        return line.id === "line-1"
          ? { fallbackUrl: guideUrl(line.id), preferredUrl: privateLineOne }
          : { preferredUrl: guideUrl(line.id) };
      },
    });

    assert.deepEqual(fallbacks, [["line-1", "fetch"]]);
    assert.deepEqual(
      audio.fetchCalls.map(([url]) => url),
      [guideUrl("line-2"), guideUrl("line-1")],
    );
    assert.deepEqual(
      audio.contexts[0].sources.map(({ startTimes }) => startTimes),
      [[10.12], [14.12]],
    );
  });

  it("cancels a pending frame and playback idempotently", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const playback = await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
    });

    const pendingFrame = [...raf.callbacks.keys()][0];
    playback.stop();
    playback.stop();
    await Promise.resolve();

    assert.deepEqual(raf.cancelled, [pendingFrame]);
    assert.equal(audio.contexts[0].closeCalls, 1);
  });

  it("does not queue another frame when onTick aborts playback", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const controller = new AbortController();
    await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      onTick() {
        controller.abort();
      },
      requestAnimationFrame: raf.requestAnimationFrame,
      signal: controller.signal,
    });
    const context = audio.contexts[0];

    context.currentTime = 11.12;
    raf.runNext();

    assert.equal(raf.callbacks.size, 0);
    assert.equal(context.closeCalls, 1);
    assert.ok(context.sources.every(({ stopCalls }) => stopCalls === 1));
    assert.ok(context.oscillators.every(({ stopCalls }) => stopCalls === 2));
  });

  it("does not queue another frame when onTick stops the returned playback", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    let playback;
    let tickCount = 0;
    playback = await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      onTick() {
        tickCount += 1;
        if (tickCount === 2) playback.stop();
      },
      requestAnimationFrame: raf.requestAnimationFrame,
    });
    const context = audio.contexts[0];

    context.currentTime = 11.12;
    raf.runNext();
    assert.equal(raf.callbacks.size, 1);
    context.currentTime = 12.12;
    raf.runNext();

    assert.equal(tickCount, 2);
    assert.equal(raf.callbacks.size, 0);
    assert.equal(context.closeCalls, 1);
    assert.ok(context.sources.every(({ stopCalls }) => stopCalls === 1));
    assert.ok(context.oscillators.every(({ stopCalls }) => stopCalls === 2));
  });

  it("preserves consent loss instead of falling back to a generated guide", async () => {
    for (const [status, code] of [
      [403, "dubbing_not_enabled"],
      [409, "dub_consent_revoking"],
    ]) {
      const audio = createAudioHarness();
      const raf = createRaf();
      const urls = [];
      const line = DUB_LINES[0];
      const preferredUrl = `/api/dubs/five-little-ducks-v2/lines/${line.id}/audio`;

      const error = await startDubPlayback({
        AudioContext: audio.AudioContext,
        cancelAnimationFrame: raf.cancelAnimationFrame,
        async fetch(url) {
          urls.push(url);
          if (url === preferredUrl) {
            return Response.json({ error: code }, { status });
          }
          return new Response(new Uint8Array([1, 2, 3, 4]));
        },
        lines: [line],
        onTick() {},
        requestAnimationFrame: raf.requestAnimationFrame,
        resolveAudioSource: () => ({
          fallbackUrl: guideUrl(line.id),
          preferredUrl,
        }),
      }).then(
        (playback) => {
          playback.stop();
          return new Error("Playback unexpectedly used the generated guide.");
        },
        (cause) => cause,
      );

      assert.ok(error instanceof DubNotEnabledError, `${status} ${code}`);
      assert.equal(error.code, "dubbing_not_enabled");
      assert.deepEqual(urls, [preferredUrl]);
      assert.equal(audio.contexts[0].closeCalls, 1);
      assert.equal(audio.contexts[0].resumeCalls, 0);
    }
  });

  it("propagates a pending external abort to every load and keeps AbortError", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const controller = new AbortController();
    const request = createPendingFetch();
    const signal = controller.signal;
    const listenerCalls = trackAbortListeners(signal);

    const starting = startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: request.fetch,
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      signal,
    });

    assert.equal(request.calls.length, DUB_LINES.length);
    assert.ok(request.calls.every(([, init]) => init.signal !== signal));
    controller.abort();
    assert.ok(request.calls.every(([, init]) => init.signal.aborted));
    await assert.rejects(starting, { name: "AbortError" });
    assert.deepEqual(
      request.abortedLineIds.sort(),
      DUB_LINES.map(({ id }) => id).sort(),
    );
    assert.equal(listenerCalls.adds, 1);
    assert.equal(listenerCalls.removes, 1);
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.equal(audio.contexts[0].resumeCalls, 0);
    assert.equal(audio.contexts[0].sources.length, 0);
    assert.equal(audio.contexts[0].oscillators.length, 0);
    assert.equal(raf.callbacks.size, 0);
  });

  it("aborts pending private and guide loads and closes once", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const controller = new AbortController();
    const calls = [];
    const fallbacks = [];
    const unavailable = [];
    const privateLineOne = "/api/dubs/five-little-ducks-v2/lines/line-1/audio";
    const fetch = (url, init) => {
      calls.push([url, init]);
      if (url === privateLineOne) {
        return Promise.resolve(new Response(null, { status: 503 }));
      }
      return new Promise((_, reject) => {
        const fail = () => reject(abortError());
        if (init.signal.aborted) fail();
        else init.signal.addEventListener("abort", fail, { once: true });
      });
    };

    const starting = startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch,
      lines: DUB_LINES.slice(0, 2),
      onLineFallback(lineId, stage) {
        fallbacks.push([lineId, stage]);
      },
      onLineUnavailable(lineId) {
        unavailable.push(lineId);
      },
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      resolveAudioSource(line) {
        return {
          fallbackUrl: guideUrl(line.id),
          preferredUrl: `/api/dubs/five-little-ducks-v2/lines/${line.id}/audio`,
        };
      },
      signal: controller.signal,
    });

    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(
      calls.map(([url]) => url),
      [privateLineOne, "/api/dubs/five-little-ducks-v2/lines/line-2/audio", guideUrl("line-1")],
    );
    assert.deepEqual(fallbacks, [["line-1", "fetch"]]);
    fallbacks.length = 0;
    controller.abort();

    await assert.rejects(starting, { name: "AbortError" });
    assert.ok(calls.slice(1).every(([, init]) => init.signal.aborted));
    assert.deepEqual(fallbacks, []);
    assert.deepEqual(unavailable, []);
    assert.equal(audio.contexts[0].closeCalls, 1);
  });

  it("surfaces a scheduler setup failure when context close stalls", async () => {
    const closeDeferred = createDeferred();
    const audio = createAudioHarness({
      closeDeferred,
      oscillatorStopFailure: new Error("music setup failed"),
    });
    const raf = createRaf();
    const timers = createTimerHarness();
    let rejection;

    const starting = startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      setTimeout: timers.setTimeout,
    });
    void starting.catch((error) => {
      rejection = error;
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.equal(audio.contexts[0].closeCalls, 1);

    timers.runNext();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    assert.match(rejection?.message ?? "", /music setup failed/);
    assert.equal(audio.contexts[0].sources[0].stopCalls, 1);
    assert.equal(audio.contexts[0].oscillators[0].stopCalls, 2);
    assert.equal(audio.contexts[0].closeCalls, 1);

    closeDeferred.reject(new Error("late close failure"));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.equal(audio.contexts[0].closeCalls, 1);
  });

  it("lets an external abort win while scheduler cleanup is closing", async () => {
    const closeDeferred = createDeferred();
    const audio = createAudioHarness({
      closeDeferred,
      oscillatorStopFailure: new Error("music setup failed"),
    });
    const raf = createRaf();
    const controller = new AbortController();

    const starting = startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      signal: controller.signal,
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.equal(audio.contexts[0].closeCalls, 1);

    controller.abort();
    closeDeferred.resolve();

    await assert.rejects(starting, { name: "AbortError" });
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.equal(audio.contexts[0].sources[0].stopCalls, 1);
    assert.equal(audio.contexts[0].oscillators[0].stopCalls, 2);
  });

  it("lets a queued external abort win before scheduler cleanup yields", async () => {
    const audio = createAudioHarness({
      oscillatorStopFailure: new Error("music setup failed"),
    });
    const raf = createRaf();
    const timers = createTimerHarness();
    const controller = new AbortController();
    let rejection;

    timers.setTimeout(() => controller.abort(), 0);
    const starting = startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      setTimeout: timers.setTimeout,
      signal: controller.signal,
    });
    void starting.catch((error) => {
      rejection = error;
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.equal(audio.contexts[0].closeCalls, 1);

    timers.runNext();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    assert.equal(rejection?.name, "AbortError");
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.equal(audio.contexts[0].sources[0].stopCalls, 1);
    assert.equal(audio.contexts[0].oscillators[0].stopCalls, 2);
  });

  it("rejects promptly when external abort cannot settle a sibling decode", async () => {
    const audio = createAudioHarness({ decodeNeverLineId: "line-1" });
    const raf = createRaf();
    const controller = new AbortController();
    let rejection;

    const starting = startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      signal: controller.signal,
    });
    void starting.catch((error) => {
      rejection = error;
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    controller.abort();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    assert.equal(rejection?.name, "AbortError");
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.equal(audio.contexts[0].resumeCalls, 0);
    assert.equal(audio.contexts[0].sources.length, 0);
    assert.equal(audio.contexts[0].oscillators.length, 0);
    assert.equal(raf.callbacks.size, 0);
  });

  it("rejects promptly when abort interrupts stalled resume and close", async () => {
    const closeDeferred = createDeferred();
    const resumeDeferred = createDeferred();
    const audio = createAudioHarness({ closeDeferred, resumeDeferred });
    const raf = createRaf();
    const controller = new AbortController();
    const signal = controller.signal;
    const listenerCalls = trackAbortListeners(signal);
    let rejection;

    const starting = startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      signal,
    });
    void starting.catch((error) => {
      rejection = error;
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.equal(audio.contexts[0].resumeCalls, 1);

    controller.abort();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    assert.equal(rejection?.name, "AbortError");
    assert.equal(listenerCalls.adds, 1);
    assert.equal(listenerCalls.removes, 1);
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.ok(audio.fetchCalls.every(([, init]) => init.signal.aborted));
    assert.equal(audio.contexts[0].sources.length, 0);
    assert.equal(audio.contexts[0].gains.length, 0);
    assert.equal(audio.contexts[0].oscillators.length, 0);
    assert.equal(raf.callbacks.size, 0);

    resumeDeferred.reject(new Error("late resume failure"));
    closeDeferred.resolve();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.equal(audio.contexts[0].closeCalls, 1);
  });

  it("cleans up already-started audio when setup fails", async () => {
    const audio = createAudioHarness({
      oscillatorStopFailure: new Error("music setup failed"),
    });
    const raf = createRaf();

    await assert.rejects(
      startDubPlayback({
        AudioContext: audio.AudioContext,
        cancelAnimationFrame: raf.cancelAnimationFrame,
        fetch: audio.fetch,
        onTick() {},
        requestAnimationFrame: raf.requestAnimationFrame,
      }),
      /music setup failed/,
    );

    const context = audio.contexts[0];
    assert.equal(context.sources[0].stopCalls, 1);
    assert.equal(context.oscillators[0].stopCalls, 2);
    assert.equal(context.closeCalls, 1);
    assert.equal(raf.callbacks.size, 0);
  });

  it("rejects an aborted start after closing its audio context", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      startDubPlayback({
        AudioContext: audio.AudioContext,
        cancelAnimationFrame: raf.cancelAnimationFrame,
        fetch: audio.fetch,
        onTick() {},
        requestAnimationFrame: raf.requestAnimationFrame,
        signal: controller.signal,
      }),
      { name: "AbortError" },
    );
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.equal(audio.fetchCalls.length, 0);
  });
});
