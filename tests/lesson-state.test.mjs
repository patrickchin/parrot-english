import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LessonPhase,
  createInitialLessonState,
  reduceLessonState,
} from "../lib/lesson-state.js";

const totalSteps = 5;

function reduce(state, event) {
  return reduceLessonState(state, event, totalSteps);
}

describe("lesson state", () => {
  it("starts at the first host line", () => {
    const state = reduce(createInitialLessonState(), { type: "START" });

    assert.equal(state.phase, LessonPhase.HostSpeaking);
    assert.equal(state.stepIndex, 0);
    assert.equal(state.retryCount, 0);
  });

  it("moves from host to parrot to listening", () => {
    const started = reduce(createInitialLessonState(), { type: "START" });
    const parrot = reduce(started, { type: "HOST_DONE" });
    const listening = reduce(parrot, { type: "PARROT_DONE" });

    assert.equal(parrot.phase, LessonPhase.ParrotSpeaking);
    assert.equal(listening.phase, LessonPhase.Listening);
  });

  it("retries one failed phrase", () => {
    const listening = {
      ...createInitialLessonState(),
      phase: LessonPhase.Evaluating,
      stepIndex: 2,
    };
    const evaluated = reduce(listening, {
      type: "EVALUATED",
      passed: false,
      feedbackText: "Try again.",
      transcript: "can help",
    });
    const retry = reduce(evaluated, { type: "RETRY" });

    assert.equal(evaluated.phase, LessonPhase.Feedback);
    assert.equal(evaluated.lastOutcome, "retry");
    assert.equal(evaluated.retryCount, 1);
    assert.equal(retry.phase, LessonPhase.ParrotSpeaking);
    assert.equal(retry.stepIndex, 2);
  });

  it("advances after a passed phrase", () => {
    const listening = {
      ...createInitialLessonState(),
      phase: LessonPhase.Evaluating,
      stepIndex: 1,
    };
    const evaluated = reduce(listening, {
      type: "EVALUATED",
      passed: true,
      feedbackText: "Great.",
      transcript: "oh i cannot reach it",
    });
    const next = reduce(evaluated, { type: "NEXT" });

    assert.equal(evaluated.phase, LessonPhase.Feedback);
    assert.equal(evaluated.lastOutcome, "advance");
    assert.equal(evaluated.stepIndex, 2);
    assert.equal(next.phase, LessonPhase.HostSpeaking);
  });

  it("finishes after the final passed phrase", () => {
    const listening = {
      ...createInitialLessonState(),
      phase: LessonPhase.Evaluating,
      stepIndex: 4,
    };
    const evaluated = reduce(listening, {
      type: "EVALUATED",
      passed: true,
      feedbackText: "Done.",
      transcript: "thank you",
    });

    assert.equal(evaluated.phase, LessonPhase.Finished);
    assert.equal(evaluated.lastOutcome, "finished");
    assert.equal(evaluated.stepIndex, 4);
  });
});
