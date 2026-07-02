import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { playAudioLine, playAudioSequence } from "../src/audio-playback.ts";

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
});
