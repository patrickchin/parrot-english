import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDirectorSpeechSegmentKey,
  resolveStaticDirectorSpeechSegment,
} from "../lib/director-speech-segments.js";

describe("director speech segments", () => {
  it("creates stable segment keys from speaker language and text", () => {
    assert.equal(
      createDirectorSpeechSegmentKey({
        speaker: "polly",
        lang: "zh-CN",
        text: "轮到你了，跟着佩奇说。",
      }),
      "polly__zh-CN__ea0dc272"
    );
  });

  it("matches existing static audio by exact visible text", () => {
    const result = resolveStaticDirectorSpeechSegment({
      speaker: "peppa",
      lang: "en-US",
      text: "Thank you!",
    });

    assert.equal(result.kind, "static");
    assert.equal(result.audioSrc, "/assets/audio/pig-thank-you.wav");
  });

  it("marks unmatched dynamic text for generated audio", () => {
    const result = resolveStaticDirectorSpeechSegment({
      speaker: "polly",
      lang: "zh-CN",
      text: "太棒了！你回答了佩奇。",
    });

    assert.equal(result.kind, "dynamic");
    assert.equal(result.audioSrc, null);
  });
});
