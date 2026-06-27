import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getDirectorSpeechSegmentSilentDurationMs,
  getDirectorTurnSilentDurationMs,
} from "../src/director-audio-playback.ts";
import { playDirectorTurnForUi } from "../src/director-turn-playback.ts";

const speech = [
  { lang: "zh-CN", text: "轮到你说：" },
  { lang: "en-US", text: "Hello, Peppa!" },
];

describe("director turn UI playback orchestration", () => {
  it("forwards unmuted turn speech to playback and completes after playback", async () => {
    const controller = new AbortController();
    const calls = [];
    const events = [];

    await playDirectorTurnForUi({
      muted: false,
      signal: controller.signal,
      speaker: "polly",
      speech,
      isCancelled: () => false,
      onDone: () => events.push("done"),
      onError: (error) => events.push(["error", error]),
      playTurnSpeech: async (options) => {
        calls.push(options);
        events.push("played");
      },
      waitForMutedTurn: async () => {
        throw new Error("Muted wait should not run");
      },
    });

    assert.deepEqual(calls, [
      {
        speaker: "polly",
        speech,
        signal: controller.signal,
      },
    ]);
    assert.deepEqual(events, ["played", "done"]);
  });

  it("does not complete when playback finishes after cancellation", async () => {
    const events = [];

    await playDirectorTurnForUi({
      muted: false,
      speaker: "polly",
      speech,
      isCancelled: () => true,
      onDone: () => events.push("done"),
      onError: (error) => events.push(["error", error]),
      playTurnSpeech: async () => {
        events.push("played");
      },
      waitForMutedTurn: async () => {
        throw new Error("Muted wait should not run");
      },
    });

    assert.deepEqual(events, ["played"]);
  });

  it("ignores abort-shaped playback errors", async () => {
    const abortError = new Error("cancelled");
    abortError.name = "AbortError";
    const events = [];

    await playDirectorTurnForUi({
      muted: false,
      speaker: "polly",
      speech,
      isCancelled: () => false,
      onDone: () => events.push("done"),
      onError: (error) => events.push(["error", error]),
      playTurnSpeech: async () => {
        throw abortError;
      },
      waitForMutedTurn: async () => {
        throw new Error("Muted wait should not run");
      },
    });

    assert.deepEqual(events, []);
  });

  it("reports non-abort playback errors and still completes", async () => {
    const playbackError = new Error("speaker failed");
    const events = [];

    await playDirectorTurnForUi({
      muted: false,
      speaker: "polly",
      speech,
      isCancelled: () => false,
      onDone: () => events.push("done"),
      onError: (error) => events.push(["error", error]),
      playTurnSpeech: async () => {
        throw playbackError;
      },
      waitForMutedTurn: async () => {
        throw new Error("Muted wait should not run");
      },
    });

    assert.deepEqual(events, [["error", playbackError], "done"]);
  });

  it("uses the muted wait path without calling real playback", async () => {
    const controller = new AbortController();
    const waits = [];
    const events = [];

    await playDirectorTurnForUi({
      muted: true,
      signal: controller.signal,
      speaker: "polly",
      speech,
      isCancelled: () => false,
      onDone: () => events.push("done"),
      onError: (error) => events.push(["error", error]),
      playTurnSpeech: async () => {
        throw new Error("Real playback should not run while muted");
      },
      waitForMutedTurn: async (durationMs, signal) => {
        waits.push({ durationMs, signal });
        events.push("waited");
      },
    });

    assert.deepEqual(waits, [
      {
        durationMs: getDirectorTurnSilentDurationMs(speech),
        signal: controller.signal,
      },
    ]);
    assert.deepEqual(events, ["waited", "done"]);
  });

  it("uses one shared silent duration policy for full muted turns", () => {
    assert.equal(
      getDirectorTurnSilentDurationMs(speech),
      speech.reduce(
        (total, segment) =>
          total + getDirectorSpeechSegmentSilentDurationMs(segment.text),
        0
      )
    );
  });
});
