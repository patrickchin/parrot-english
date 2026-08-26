import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DubNotEnabledError } from "../src/dubbing/dub-api.ts";
import { DUB_LINES, DUB_VERSES } from "../src/dubbing/dub-script.ts";
import {
  scheduleDubAudio,
  startDubPlayback,
} from "../src/dubbing/dub-playback.ts";

function abortError() {
  const error = new Error("request aborted");
  error.name = "AbortError";
  return error;
}

function lineIdFromUrl(url) {
  return url.match(/\/lines\/(line-\d+)\/audio$/)?.[1]
    ?? url.match(/five-little-ducks-v2-guide-(line-\d+)\.mp3$/)?.[1];
}

function guideUrl(lineId) {
  return `/assets/audio/five-little-ducks-v2-guide-${lineId}.mp3`;
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
      const lineId = `line-${new Uint8Array(bytes)[0]}`;
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
    const lineNumber = Number(lineIdFromUrl(url)?.slice("line-".length));
    return new Response(new Uint8Array([lineNumber, 2, 3, 4]));
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
    assert.equal(context.gains[1].gain.value, 0.08);
    assert.deepEqual(context.gains[1].connections, [context.gains[0]]);

    const beatSeconds = 60 / 92;
    assert.equal(context.oscillators[0].type, "sine");
    assert.equal(context.oscillators[0].startTimes[0], startAt);
    assert.ok(Math.abs(context.oscillators[0].frequency.value - 261.625565) < 0.000001);
    assert.equal(context.oscillators[1].type, "triangle");
    assert.equal(context.oscillators[1].startTimes[0], startAt + beatSeconds);
    assert.ok(Math.abs(context.oscillators[1].frequency.value - 329.627557) < 0.000001);
    assert.deepEqual(context.gains[2].gain.events, [
      ["set", 0, startAt],
      ["ramp", 1, startAt + 0.02],
      ["ramp", 0, startAt + beatSeconds * 0.82],
    ]);

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
      lines: DUB_VERSES[1],
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
    assert.equal(context.oscillators.length, 28);

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
      lines: DUB_VERSES[5],
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
      lines: DUB_VERSES[1],
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
    assert.equal(context.oscillators.length, 25);

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
      lines: DUB_VERSES[1],
      onEnded: () => { ended += 1; },
      onTick: (elapsedMs) => ticks.push(elapsedMs),
      requestAnimationFrame: raf.requestAnimationFrame,
    });

    const context = audio.contexts[0];
    assert.equal(context.oscillators.length, 28);
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
