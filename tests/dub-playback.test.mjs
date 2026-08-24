import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DUB_LINES } from "../src/dubbing/dub-script.ts";
import {
  scheduleDubAudio,
  startDubPlayback,
} from "../src/dubbing/dub-playback.ts";

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

function createAudioHarness({
  decodeFailure,
  fetchStatus = 200,
  oscillatorStopFailure,
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
      if (decodeFailure) throw decodeFailure;
      return { duration: bytes.byteLength };
    }

    async resume() {
      this.resumeCalls += 1;
    }
  }

  const fetchCalls = [];
  async function fetch(url, init) {
    fetchCalls.push([url, init]);
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      status: fetchStatus,
    });
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

    assert.deepEqual(starts, [11.8, 17.8, 29.8, 35.8, 41.8, 47.8, 53.8, 59.8]);
    stop();
    stop();
    assert.deepEqual(
      [...sources.values()].map(({ stopCalls }) => stopCalls),
      [1, 1, 1, 1, 1, 1, 1, 1],
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
          `/api/dubs/five-little-ducks-v1/lines/${id}/audio`,
      ),
    );
    assert.ok(
      audio.fetchCalls.every(
        ([, init]) =>
          init.credentials === "same-origin" && init.signal === controller.signal,
      ),
    );

    const startAt = 10.12;
    assert.deepEqual(
      context.sources.map(({ startTimes }) => Number(startTimes[0].toFixed(2))),
      [10.92, 16.92, 22.92, 28.92, 34.92, 40.92, 46.92, 52.92, 58.92],
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

    context.currentTime = startAt + 60;
    raf.runNext();
    assert.deepEqual(ticks, [1500, 56_000]);
    assert.equal(context.closeCalls, 1);
    assert.equal(raf.callbacks.size, 0);

    playback.stop();
    controller.abort();
    await Promise.resolve();
    assert.equal(context.closeCalls, 1);
    assert.ok(context.sources.every(({ stopCalls }) => stopCalls === 1));
    assert.ok(context.oscillators.every(({ stopCalls }) => stopCalls === 2));
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

  it("cleans up fetch and decode failures before rejecting", async () => {
    const cases = [
      ["fetch", createAudioHarness({ fetchStatus: 404 })],
      ["decode", createAudioHarness({ decodeFailure: new Error("corrupt audio") })],
    ];

    for (const [name, audio] of cases) {
      const raf = createRaf();
      await assert.rejects(
        startDubPlayback({
          AudioContext: audio.AudioContext,
          cancelAnimationFrame: raf.cancelAnimationFrame,
          fetch: audio.fetch,
          onTick() {},
          requestAnimationFrame: raf.requestAnimationFrame,
        }),
        Error,
        name,
      );
      assert.equal(audio.contexts[0].closeCalls, 1, name);
      assert.equal(raf.callbacks.size, 0, name);
    }
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
