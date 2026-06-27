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

    assert.deepEqual(result, {
      kind: "static",
      key: "peppa__en-US__fd18b61b",
      audioId: "example-thank-you",
      audioSrc: "/assets/audio/pig-thank-you.wav",
      lang: "en-US",
      text: "Thank you!",
    });
  });

  it("does not match another speaker's static audio by text collision", () => {
    const result = resolveStaticDirectorSpeechSegment({
      speaker: "polly",
      lang: "en-US",
      text: "Thank you!",
    });

    assert.deepEqual(result, {
      kind: "dynamic",
      key: "polly__en-US__fd18b61b",
      audioId: null,
      audioSrc: null,
      lang: "en-US",
      text: "Thank you!",
    });
  });

  it("matches duplicate Polly Chinese prompt text to the canonical saved asset", () => {
    const result = resolveStaticDirectorSpeechSegment({
      speaker: "polly",
      lang: "zh-CN",
      text: "轮到你了，跟着佩奇说。",
    });

    assert.deepEqual(result, {
      kind: "static",
      key: "polly__zh-CN__ea0dc272",
      audioId: "turn-hello",
      audioSrc: "/assets/audio/turn-hello.wav",
      lang: "zh-CN",
      text: "轮到你了，跟着佩奇说。",
    });
  });

  it("does not match static audio when the segment language differs", () => {
    const result = resolveStaticDirectorSpeechSegment({
      speaker: "polly",
      lang: "en-US",
      text: "轮到你了，跟着佩奇说。",
    });

    assert.deepEqual(result, {
      kind: "dynamic",
      key: "polly__en-US__ea0dc272",
      audioId: null,
      audioSrc: null,
      lang: "en-US",
      text: "轮到你了，跟着佩奇说。",
    });
  });

  it("marks unmatched dynamic text for generated audio", () => {
    const result = resolveStaticDirectorSpeechSegment({
      speaker: "polly",
      lang: "zh-CN",
      text: "太棒了！你回答了佩奇。",
    });

    assert.deepEqual(result, {
      kind: "dynamic",
      key: "polly__zh-CN__f9daafb6",
      audioId: null,
      audioSrc: null,
      lang: "zh-CN",
      text: "太棒了！你回答了佩奇。",
    });
  });
});
