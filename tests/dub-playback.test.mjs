import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DUB_LINES } from "../src/dubbing/dub-script.ts";
import {
  DubLinePlaybackError,
  scheduleDubAudio,
  startDubPlayback,
} from "../src/dubbing/dub-playback.ts";

function abortError() {
  const error = new Error("request aborted");
  error.name = "AbortError";
  return error;
}

function lineIdFromUrl(url) {
  return url.match(/\/lines\/(line-\d+)\/audio$/)?.[1];
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

function createFailingFetch(failingLineId, responseFactory) {
  const abortedLineIds = [];
  const calls = [];
  return {
    abortedLineIds,
    calls,
    fetch(url, init) {
      const lineId = lineIdFromUrl(url);
      calls.push([url, init]);
      const shouldFail = Array.isArray(failingLineId)
        ? failingLineId.includes(lineId)
        : lineId === failingLineId;
      if (shouldFail) {
        return Promise.resolve(responseFactory(lineId));
      }
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
      if (lineId === decodeFailureLineId) throw new Error("codec detail");
      return { duration: bytes.byteLength };
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
          init.credentials === "same-origin" &&
          init.signal === audio.fetchCalls[0][1].signal &&
          init.signal !== controller.signal,
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

  it("identifies a middle HTTP failure and aborts sibling loads", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const controller = new AbortController();
    const request = createFailingFetch(
      "line-5",
      () => new Response("upstream detail", { status: 503 }),
    );

    const error = await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: request.fetch,
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      signal: controller.signal,
    }).then(
      () => assert.fail("playback should reject"),
      (cause) => cause,
    );

    assert.ok(error instanceof DubLinePlaybackError);
    assert.equal(error.lineId, "line-5");
    assert.equal(error.stage, "fetch");
    assert.equal(error.message, "Your saved dub could not be played. Try again.");
    assert.deepEqual(
      request.abortedLineIds.sort(),
      DUB_LINES.map(({ id }) => id).filter((id) => id !== "line-5").sort(),
    );
    assert.ok(request.calls.every(([, init]) => init.signal.aborted));
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.equal(audio.contexts[0].resumeCalls, 0);
    assert.equal(audio.contexts[0].sources.length, 0);
    assert.equal(audio.contexts[0].oscillators.length, 0);
    assert.equal(raf.callbacks.size, 0);
  });

  it("keeps the first observed network failure when multiple failures race", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const controller = new AbortController();
    const request = createFailingFetch(["line-4", "line-8"], () => {
      throw new Error("socket detail");
    });

    const starting = startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: request.fetch,
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      signal: controller.signal,
    });
    await Promise.resolve();
    await Promise.resolve();
    if (!request.calls[0][1].signal.aborted) controller.abort();
    const error = await starting.then(
      () => assert.fail("playback should reject"),
      (cause) => cause,
    );

    assert.ok(error instanceof DubLinePlaybackError);
    assert.equal(error.lineId, "line-4");
    assert.equal(error.stage, "fetch");
    assert.equal(error.message, "Your saved dub could not be played. Try again.");
    assert.doesNotMatch(error.message, /socket detail/);
    assert.deepEqual(
      request.abortedLineIds.sort(),
      DUB_LINES.map(({ id }) => id)
        .filter((id) => id !== "line-4" && id !== "line-8")
        .sort(),
    );
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.equal(audio.contexts[0].resumeCalls, 0);
    assert.equal(raf.callbacks.size, 0);
  });

  it("maps a middle body-read failure to the fetch stage", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();

    const error = await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      async fetch(url) {
        const lineId = lineIdFromUrl(url);
        const lineNumber = Number(lineId.slice("line-".length));
        return {
          ok: true,
          async arrayBuffer() {
            if (lineId === "line-7") throw new Error("body detail");
            return new Uint8Array([lineNumber, 2, 3, 4]).buffer;
          },
        };
      },
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
    }).then(
      () => assert.fail("playback should reject"),
      (cause) => cause,
    );

    assert.ok(error instanceof DubLinePlaybackError);
    assert.equal(error.lineId, "line-7");
    assert.equal(error.stage, "fetch");
    assert.equal(error.message, "Your saved dub could not be played. Try again.");
    assert.doesNotMatch(error.message, /body detail/);
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.equal(audio.contexts[0].resumeCalls, 0);
    assert.equal(audio.contexts[0].sources.length, 0);
    assert.equal(audio.contexts[0].oscillators.length, 0);
    assert.equal(raf.callbacks.size, 0);
  });

  it("identifies a middle decode failure and closes before starting audio", async () => {
    const audio = createAudioHarness({ decodeFailureLineId: "line-6" });
    const raf = createRaf();

    const error = await startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
    }).then(
      () => assert.fail("playback should reject"),
      (cause) => cause,
    );

    assert.ok(error instanceof DubLinePlaybackError);
    assert.equal(error.lineId, "line-6");
    assert.equal(error.stage, "decode");
    assert.equal(error.message, "Your saved dub could not be played. Try again.");
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.equal(audio.contexts[0].resumeCalls, 0);
    assert.equal(audio.contexts[0].sources.length, 0);
    assert.equal(audio.contexts[0].oscillators.length, 0);
    assert.equal(raf.callbacks.size, 0);
  });

  it("rejects promptly when a sibling decode never settles", async () => {
    const audio = createAudioHarness({
      decodeFailureLineId: "line-5",
      decodeNeverLineId: "line-1",
    });
    const raf = createRaf();
    let rejection;

    void startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: audio.fetch,
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
    }).catch((error) => {
      rejection = error;
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    assert.ok(rejection instanceof DubLinePlaybackError);
    assert.equal(rejection.lineId, "line-5");
    assert.equal(rejection.stage, "decode");
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.equal(audio.contexts[0].resumeCalls, 0);
    assert.equal(audio.contexts[0].sources.length, 0);
    assert.equal(audio.contexts[0].oscillators.length, 0);
    assert.equal(raf.callbacks.size, 0);
  });

  it("propagates a pending external abort to every load and keeps AbortError", async () => {
    const audio = createAudioHarness();
    const raf = createRaf();
    const controller = new AbortController();
    const request = createFailingFetch("line-99", () => assert.fail("unused"));
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

  it("lets caller abort win while failure cleanup is closing the context", async () => {
    const closeDeferred = createDeferred();
    const audio = createAudioHarness({
      closeDeferred,
      decodeFailureLineId: "line-5",
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
    assert.equal(audio.contexts[0].resumeCalls, 0);
    assert.equal(audio.contexts[0].sources.length, 0);
    assert.equal(audio.contexts[0].oscillators.length, 0);
    assert.equal(raf.callbacks.size, 0);
  });

  it("surfaces a typed line failure when context close stalls", async () => {
    const closeDeferred = createDeferred();
    const audio = createAudioHarness({ closeDeferred });
    const raf = createRaf();
    const timers = createTimerHarness();
    const request = createFailingFetch(
      "line-5",
      () => new Response(null, { status: 503 }),
    );
    const controller = new AbortController();
    const signal = controller.signal;
    const listenerCalls = trackAbortListeners(signal);
    let rejection;

    const starting = startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: request.fetch,
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      setTimeout: timers.setTimeout,
      signal,
    });
    void starting.catch((error) => {
      rejection = error;
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.equal(audio.contexts[0].closeCalls, 1);

    timers.runNext();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    assert.ok(rejection instanceof DubLinePlaybackError);
    assert.equal(rejection.lineId, "line-5");
    assert.equal(rejection.stage, "fetch");
    assert.equal(listenerCalls.adds, 1);
    assert.equal(listenerCalls.removes, 1);
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.equal(audio.contexts[0].sources.length, 0);
    assert.equal(audio.contexts[0].gains.length, 0);
    assert.equal(audio.contexts[0].oscillators.length, 0);
    assert.equal(raf.callbacks.size, 0);

    closeDeferred.reject(new Error("late close failure"));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.equal(audio.contexts[0].closeCalls, 1);
  });

  it("lets caller abort win before stalled failure cleanup yields", async () => {
    const closeDeferred = createDeferred();
    const audio = createAudioHarness({ closeDeferred });
    const raf = createRaf();
    const timers = createTimerHarness();
    const request = createFailingFetch(
      "line-5",
      () => new Response(null, { status: 503 }),
    );
    const controller = new AbortController();
    const signal = controller.signal;
    const listenerCalls = trackAbortListeners(signal);
    let rejection;

    const starting = startDubPlayback({
      AudioContext: audio.AudioContext,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      fetch: request.fetch,
      onTick() {},
      requestAnimationFrame: raf.requestAnimationFrame,
      setTimeout: timers.setTimeout,
      signal,
    });
    void starting.catch((error) => {
      rejection = error;
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.equal(audio.contexts[0].closeCalls, 1);

    controller.abort();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    assert.equal(rejection?.name, "AbortError");
    assert.equal(listenerCalls.adds, 1);
    assert.equal(listenerCalls.removes, 1);
    assert.equal(audio.contexts[0].closeCalls, 1);
    assert.equal(audio.contexts[0].sources.length, 0);
    assert.equal(audio.contexts[0].gains.length, 0);
    assert.equal(audio.contexts[0].oscillators.length, 0);
    assert.equal(raf.callbacks.size, 0);

    closeDeferred.reject(new Error("late close failure"));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.equal(audio.contexts[0].closeCalls, 1);
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
