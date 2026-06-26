import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { playSpokenLine } from "../src/tts-playback.ts";

describe("TTS playback", () => {
  it("plays static audio assets without calling Worker TTS", async () => {
    const playedUrls = [];
    const revokedUrls = [];

    const result = await playSpokenLine({
      audioId: "instruction-peppa",
      audioSrc: "/assets/audio/instruction-peppa.wav",
      character: "coach",
      engine: "asset",
      lang: "zh-CN",
      previousAudioUrl: "blob:old",
      slow: false,
      text: "先听佩奇说。",
      env: {
        fetch() {
          throw new Error("static audio should not call Worker TTS");
        },
        createObjectURL() {
          throw new Error("static audio should not create object URLs");
        },
        revokeObjectURL(url) {
          revokedUrls.push(url);
        },
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

    assert.deepEqual(playedUrls, ["/assets/audio/instruction-peppa.wav"]);
    assert.deepEqual(revokedUrls, ["blob:old"]);
    assert.deepEqual(result, { audioUrl: null, source: "asset" });
  });

  it("rejects non-static spoken lines in the live app", async () => {
    await assert.rejects(
      playSpokenLine({
        character: "polly",
        engine: "worker",
        previousAudioUrl: null,
        slow: false,
        text: "Dynamic feedback should not play live.",
        env: {
          fetch() {
            throw new Error("/api/tts should not be called");
          },
          createObjectURL() {
            throw new Error("object URLs should not be created");
          },
          revokeObjectURL() {},
          createAudio() {
            throw new Error("Audio should not be used");
          },
        },
      }),
      /Static audio is required/
    );
  });
});
