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

    assert.equal(result.passed, true);
    assert.equal(result.similarity, 1);
    assert.equal(result.feedbackText, "Great job!");
  });

  it("passes close child transcripts", () => {
    const result = scoreSpeechTranscript("hello peppa", "Hello, Peppa!");

    assert.equal(result.passed, true);
    assert.ok(result.similarity > 0.9);
  });

  it("asks for a retry when the transcript is too different", () => {
    const result = scoreSpeechTranscript("yellow ball", "Thank you!");

    assert.equal(result.passed, false);
    assert.equal(result.retryAllowed, true);
    assert.ok(result.similarity < 0.74);
    assert.equal(result.feedbackText, "Almost! Try again.");
  });

  it("uses English fallback feedback", () => {
    assert.equal(
      scoreSpeechTranscript("", "Thank you!").feedbackText,
      "I couldn't hear you. Please try again."
    );
    assert.equal(
      scoreSpeechTranscript("anything", "").feedbackText,
      "Please choose a phrase to practise."
    );
  });
});
