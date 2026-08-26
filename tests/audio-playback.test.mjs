import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  playAudioLine,
  playAudioSequence,
  waitForAbortableDelay,
} from "../src/media/audio-playback.ts";

describe("audio playback", () => {
  it("plays saved audio assets directly", async () => {
    const playedUrls = [];

    await playAudioLine({
      audioId: "turn-hello",
      audioSrc: "/assets/audio/turn-hello.mp3",
      lang: "zh-CN",
      text: "轮到你了，跟着佩奇说。",
      env: {
        createAudio(url) {
          return {
            play() {
              playedUrls.push(url);
              globalThis.queueMicrotask(() => this.onended?.());
              return Promise.resolve();
            },
          };
        },
      },
    });

    assert.deepEqual(playedUrls, ["/assets/audio/turn-hello.mp3"]);
  });

  it("sets an explicitly requested saved-audio volume", async () => {
    let createdAudio;

    await playAudioLine({
      audioSrc: "/cue.mp3",
      text: "Hello",
      volume: 0.28,
      env: {
        createAudio() {
          createdAudio = {
            play() {
              globalThis.queueMicrotask(() => this.onended?.());
              return Promise.resolve();
            },
          };
          return createdAudio;
        },
      },
    });

    assert.equal(createdAudio.volume, 0.28);
  });

  it("pauses and resumes the same saved-audio instance", async () => {
    const events = [];
    let controls;
    let finish;
    let createdCount = 0;

    const operation = playAudioLine({
      audioSrc: "/assets/audio/story-line.mp3",
      text: "A story line.",
      env: {
        createAudio() {
          createdCount += 1;
          return {
            pause() {
              events.push("pause");
            },
            play() {
              events.push("play");
              finish = () => this.onended?.();
              return Promise.resolve();
            },
          };
        },
      },
      onPlaybackControl(control) {
        if (control) controls = control;
      },
    });

    await Promise.resolve();
    controls.pause();
    controls.resume();
    finish();
    await operation;

    assert.equal(createdCount, 1);
    assert.deepEqual(events, ["play", "pause", "play"]);
  });

  it("cleans up shared media handlers after media and play failures", async () => {
    for (const failure of ["media-error", "async-play-error", "sync-play-error"]) {
      let audio;
      const controls = [];
      const operation = playAudioLine({
        audioSrc: "/assets/audio/peppa-thank-you.mp3",
        text: "Thank you!",
        env: {
          createAudio() {
            audio = {
              play() {
                if (failure === "async-play-error") {
                  return Promise.reject(new Error("Playback was rejected."));
                }
                if (failure === "sync-play-error") {
                  throw new Error("Playback setup failed.");
                }
                return Promise.resolve();
              },
            };
            return audio;
          },
        },
        onPlaybackControl(control) {
          controls.push(control === null ? "cleared" : "ready");
        },
      });

      if (failure === "media-error") {
        audio.onerror?.();
      }

      await assert.rejects(operation, /Audio playback failed|Playback/);
      assert.equal(audio.onended, null, failure);
      assert.equal(audio.onerror, null, failure);
      assert.deepEqual(controls, ["ready", "cleared"], failure);
    }
  });

  it("requires a saved audio source", async () => {
    await assert.rejects(
      playAudioLine({
        audioSrc: "",
        text: "Missing audio should not play.",
        env: {
          createAudio() {
            throw new Error("Audio should not be created");
          },
        },
      }),
      /Static audio source is missing/
    );
  });

  it("waits between saved audio assets when a line has a handoff pause", async () => {
    const events = [];

    await playAudioSequence({
      lines: [
        {
          audioId: "turn-here-you-are",
          audioSrc: "/assets/audio/turn-here-you-are.mp3",
          lang: "zh-CN",
          pauseAfterMs: 350,
          text: "多莉把东西给佩奇。跟我说。",
        },
        {
          audioId: "model-here-you-are",
          audioSrc: "/assets/audio/parrot-here-you-are.mp3",
          lang: "en-US",
          style: "character",
          text: "Here you are!",
        },
      ],
      env: {
        createAudio(url) {
          return {
            play() {
              events.push(`play:${url}`);
              globalThis.queueMicrotask(() => this.onended?.());
              return Promise.resolve();
            },
          };
        },
      },
      wait(durationMs) {
        events.push(`wait:${durationMs}`);
        return Promise.resolve();
      },
    });

    assert.deepEqual(events, [
      "play:/assets/audio/turn-here-you-are.mp3",
      "wait:350",
      "play:/assets/audio/parrot-here-you-are.mp3",
    ]);
  });

  it("cancels a pending visual dwell when the learner leaves", async () => {
    const controller = new AbortController();
    const pending = waitForAbortableDelay(10_000, controller.signal);

    controller.abort();

    await assert.rejects(pending, { name: "AbortError" });
  });
});
