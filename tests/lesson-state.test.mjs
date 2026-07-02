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

  it("starts from the selected idle scene", () => {
    const selectedScene = {
      ...createInitialLessonState(),
      stepIndex: 2,
    };
    const state = reduce(selectedScene, { type: "START" });

    assert.equal(state.phase, LessonPhase.ExampleSpeaking);
    assert.equal(state.stepIndex, 2);
    assert.equal(state.retryCount, 0);
  });

  it("pauses on the current scene and clears active turn state", () => {
    const audioBlob = new Blob(["child audio"], { type: "audio/webm" });
    const activeScene = {
      ...createInitialLessonState(),
      phase: LessonPhase.Evaluating,
      stepIndex: 3,
      retryCount: 1,
      feedback: "Try again.",
      transcript: "wrong words",
      lastOutcome: "retry",
      lastPassed: false,
      pendingAudioBlob: audioBlob,
    };
    const paused = reduce(activeScene, { type: "PAUSE" });

    assert.equal(paused.phase, LessonPhase.Idle);
    assert.equal(paused.stepIndex, 3);
    assert.equal(paused.retryCount, 0);
    assert.equal(paused.feedback, "");
    assert.equal(paused.transcript, "");
    assert.equal(paused.lastOutcome, "idle");
    assert.equal(paused.pendingAudioBlob, null);
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

  it("stores recorded audio when entering evaluation", () => {
    const audioBlob = new Blob(["child audio"], { type: "audio/webm" });
    const listening = {
      ...createInitialLessonState(),
      phase: LessonPhase.Listening,
      stepIndex: 2,
    };
    const evaluating = reduce(listening, {
      type: "RECORDING_DONE",
      audioBlob,
    });

    assert.equal(evaluating.phase, LessonPhase.Evaluating);
    assert.equal(evaluating.pendingAudioBlob, audioBlob);
  });

  it("moves system failures out of active recording and evaluation states", () => {
    const failed = reduce(
      {
        ...createInitialLessonState(),
        phase: LessonPhase.Listening,
        stepIndex: 2,
      },
      {
        type: "SYSTEM_ERROR",
        feedbackText: "无法打开麦克风。请允许浏览器使用麦克风后再试一次。",
      }
    );
    const retry = reduce(failed, { type: "RETRY" });

    assert.equal(failed.phase, LessonPhase.Error);
    assert.equal(failed.lastOutcome, "error");
    assert.equal(failed.feedback, "无法打开麦克风。请允许浏览器使用麦克风后再试一次。");
    assert.equal(failed.pendingAudioBlob, null);
    assert.equal(retry.phase, LessonPhase.ExampleSpeaking);
    assert.equal(retry.stepIndex, 2);
  });

  it("marks correct answers for automatic continuation", () => {
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
    assert.equal(evaluated.lastPassed, true);
    assert.equal(evaluated.pendingAudioBlob, null);
    assert.equal(evaluated.stepIndex, 1);
    assert.equal(next.phase, LessonPhase.ExampleSpeaking);
    assert.equal(next.stepIndex, 2);
  });

  it("does not mark exhausted incorrect answers as correct", () => {
    const listening = {
      ...createInitialLessonState(),
      phase: LessonPhase.Evaluating,
      retryCount: 1,
      stepIndex: 1,
    };
    const evaluated = reduce(listening, {
      type: "EVALUATED",
      passed: false,
      feedbackText: "Try the next one.",
      transcript: "wrong words",
    });

    assert.equal(evaluated.phase, LessonPhase.Feedback);
    assert.equal(evaluated.lastOutcome, "advance");
    assert.equal(evaluated.lastPassed, false);
    assert.equal(evaluated.stepIndex, 1);
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
