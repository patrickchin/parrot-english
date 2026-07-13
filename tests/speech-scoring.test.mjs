import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeSpeechText,
  scoreSpeechTranscript,
} from "../lib/speech-scoring.js";

describe("speech scoring", () => {
  it("normalizes punctuation and contractions", () => {
    assert.equal(
      normalizeSpeechText("Oh! I can't reach it."),
      "oh i cannot reach it"
    );
    assert.equal(
      normalizeSpeechText("Can you help me, please?"),
      "can you help me please"
    );
  });

  it("passes exact phrase copies", () => {
    const result = scoreSpeechTranscript(
      "Can you help me please",
      "Can you help me, please?"
    );

    assert.equal(result.outcome, "correct");
    assert.equal(result.similarity, 1);
  });

  it("passes close child transcripts", () => {
    const result = scoreSpeechTranscript("hello peppa", "Hello, Peppa!");

    assert.equal(result.outcome, "correct");
    assert.ok(result.similarity > 0.9);
  });

  it("asks for a retry when the transcript is too different", () => {
    const result = scoreSpeechTranscript("yellow ball", "Thank you!");

    assert.equal(result.outcome, "incorrect");
    assert.ok(result.similarity < 0.74);
  });

  it("distinguishes no input from an incorrect transcript", () => {
    assert.equal(scoreSpeechTranscript("", "Thank you!").outcome, "noInput");
    assert.equal(scoreSpeechTranscript("anything", "").outcome, "incorrect");
  });
});
