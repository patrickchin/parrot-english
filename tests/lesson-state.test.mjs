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
  it("starts at the first example line", () => {
    const state = reduce(createInitialLessonState(), { type: "START" });

    assert.equal(state.phase, LessonPhase.ExampleSpeaking);
    assert.equal(state.stepIndex, 0);
    assert.equal(state.retryCount, 0);
  });

  it("moves from example to parrot coaching to listening", () => {
    const started = reduce(createInitialLessonState(), { type: "START" });
    const parrot = reduce(started, { type: "EXAMPLE_DONE" });
    const listening = reduce(parrot, { type: "COACH_DONE" });

    assert.equal(parrot.phase, LessonPhase.ParrotCoaching);
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
    assert.equal(retry.phase, LessonPhase.ExampleSpeaking);
    assert.equal(retry.stepIndex, 2);
  });

  it("waits on the completed phrase until Next is clicked", () => {
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
    assert.equal(evaluated.stepIndex, 1);
    assert.equal(next.phase, LessonPhase.ExampleSpeaking);
    assert.equal(next.stepIndex, 2);
  });

  it("navigates directly to the next scene", () => {
    const next = reduce(createInitialLessonState(), { type: "SCENE_NEXT" });

    assert.equal(next.phase, LessonPhase.Idle);
    assert.equal(next.stepIndex, 1);
    assert.equal(next.retryCount, 0);
    assert.equal(next.feedback, "");
    assert.equal(next.transcript, "");
  });

  it("navigates directly to the previous scene", () => {
    const current = {
      ...createInitialLessonState(),
      phase: LessonPhase.Feedback,
      stepIndex: 2,
      retryCount: 1,
      feedback: "Try again.",
      transcript: "can help",
    };
    const previous = reduce(current, { type: "SCENE_PREVIOUS" });

    assert.equal(previous.phase, LessonPhase.Idle);
    assert.equal(previous.stepIndex, 1);
    assert.equal(previous.retryCount, 0);
    assert.equal(previous.feedback, "");
    assert.equal(previous.transcript, "");
  });

  it("keeps scene navigation inside the lesson bounds", () => {
    const firstPrevious = reduce(createInitialLessonState(), {
      type: "SCENE_PREVIOUS",
    });
    const finalNext = reduce(
      { ...createInitialLessonState(), stepIndex: totalSteps - 1 },
      { type: "SCENE_NEXT" }
    );

    assert.equal(firstPrevious.stepIndex, 0);
    assert.equal(finalNext.stepIndex, totalSteps - 1);
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
