import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { playAudioLine } from "../src/audio-playback.ts";

describe("audio playback", () => {
  it("plays saved audio assets directly", async () => {
    const playedUrls = [];

    await playAudioLine({
      audioId: "turn-hello",
      audioSrc: "/assets/audio/turn-hello.wav",
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

    assert.deepEqual(playedUrls, ["/assets/audio/turn-hello.wav"]);
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
});
