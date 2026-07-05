import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as lessonState from "../lib/lesson-state.js";

const {
  LessonPhase,
  createInitialLessonState,
  reduceLessonState,
} = lessonState;
const getCurrentScene = lessonState.getCurrentScene ?? (() => undefined);
const getCurrentStep = lessonState.getCurrentStep ?? (() => undefined);

const lesson = {
  childName: "Bella",
  scenes: [
    {
      title: "Practice",
      steps: [
        { speaker: "dolly", dialogue: "Here you are!" },
        { speaker: "user", dialogue: "Here you are!" },
      ],
    },
    {
      title: "Finish",
      steps: [
        { speaker: "narrator", dialogue: "Great job, Bella!" },
      ],
    },
  ],
};

function reduce(state, event, currentLesson = lesson) {
  return reduceLessonState(state, event, currentLesson);
}

function startAtUser() {
  const started = reduce(createInitialLessonState(), { type: "PLAY_SCENE" });
  return reduce(started, { type: "LINE_DONE" });
}

function releaseRecording(state) {
  const recording = reduce(state, { type: "MIC_STARTED" });
  return reduce(recording, { type: "MIC_RELEASED" });
}

describe("scene-script lesson state", () => {
  it("starts at the first scripted speaker", () => {
    const state = reduce(createInitialLessonState(), { type: "PLAY_SCENE" });

    assert.equal(state.phase, LessonPhase.Speaking);
    assert.equal(state.sceneIndex, 0);
    assert.equal(state.stepIndex, 0);
    assert.equal(getCurrentScene(state, lesson).title, "Practice");
    assert.equal(getCurrentStep(state, lesson).speaker, "dolly");
  });

  it("waits when the first scripted speaker is the user", () => {
    const userFirstLesson = {
      childName: "Bella",
      scenes: [{ title: "User", steps: [{ speaker: "user", dialogue: "Hello!" }] }],
    };
    const state = reduce(
      createInitialLessonState(),
      { type: "PLAY_SCENE" },
      userFirstLesson
    );

    assert.equal(state.phase, LessonPhase.WaitingForUser);
  });

  it("pauses the current scene at its beginning and clears interaction state", () => {
    const paused = reduce(
      {
        ...createInitialLessonState(),
        phase: LessonPhase.Feedback,
        sceneIndex: 1,
        stepIndex: 4,
        attemptCount: 1,
        feedback: "Almost!",
        transcript: "partial response",
        feedbackOutcome: "retry",
      },
      { type: "PAUSE_SCENE" }
    );

    assert.equal(paused.phase, LessonPhase.Paused);
    assert.equal(paused.sceneIndex, 1);
    assert.equal(paused.stepIndex, 0);
    assert.equal(paused.attemptCount, 0);
    assert.equal(paused.feedback, "");
    assert.equal(paused.transcript, "");
    assert.equal(paused.feedbackOutcome, null);
  });

  it("restarts a paused scene from its first scripted speaker", () => {
    const state = reduce(
      {
        ...createInitialLessonState(),
        phase: LessonPhase.Paused,
        sceneIndex: 1,
        stepIndex: 4,
      },
      { type: "PLAY_SCENE" }
    );

    assert.equal(state.phase, LessonPhase.Speaking);
    assert.equal(state.sceneIndex, 1);
    assert.equal(state.stepIndex, 0);
  });

  it("starts adjacent scenes from their first step", () => {
    const next = reduce(createInitialLessonState(), { type: "SCENE_NEXT" });
    const previous = reduce(next, { type: "SCENE_PREVIOUS" });

    assert.equal(next.phase, LessonPhase.Speaking);
    assert.equal(next.sceneIndex, 1);
    assert.equal(next.stepIndex, 0);
    assert.equal(previous.phase, LessonPhase.Speaking);
    assert.equal(previous.sceneIndex, 0);
    assert.equal(previous.stepIndex, 0);
  });

  it("does not move beyond the first or final scene", () => {
    const firstScene = createInitialLessonState();
    const finalScene = { ...firstScene, sceneIndex: lesson.scenes.length - 1 };

    assert.strictEqual(
      reduce(firstScene, { type: "SCENE_PREVIOUS" }),
      firstScene
    );
    assert.strictEqual(reduce(finalScene, { type: "SCENE_NEXT" }), finalScene);
  });

  it("replays a finished lesson from the first scene", () => {
    const replaying = reduce(
      {
        ...createInitialLessonState(),
        phase: LessonPhase.Finished,
        sceneIndex: 1,
      },
      { type: "REPLAY_LESSON" }
    );

    assert.equal(replaying.phase, LessonPhase.Speaking);
    assert.equal(replaying.sceneIndex, 0);
    assert.equal(replaying.stepIndex, 0);
  });

  it("selects a routed scene while clearing transient lesson state", () => {
    const selected = reduce(
      {
        ...createInitialLessonState(),
        phase: LessonPhase.Feedback,
        stepIndex: 1,
        attemptCount: 1,
        feedback: "Almost!",
        transcript: "partial response",
        feedbackOutcome: "retry",
      },
      { type: "SELECT_SCENE", sceneIndex: 1 },
    );

    assert.deepEqual(selected, {
      ...createInitialLessonState(),
      sceneIndex: 1,
    });
  });

  it("preserves state when a routed scene selection is invalid", () => {
    const current = {
      ...createInitialLessonState(),
      phase: LessonPhase.Speaking,
      sceneIndex: 1,
    };

    assert.strictEqual(
      reduce(current, { type: "SELECT_SCENE", sceneIndex: -1 }),
      current,
    );
    assert.strictEqual(
      reduce(current, {
        type: "SELECT_SCENE",
        sceneIndex: lesson.scenes.length,
      }),
      current,
    );
  });

  it("moves from a model line into held recording and evaluation", () => {
    const waiting = startAtUser();
    const recording = reduce(waiting, { type: "MIC_STARTED" });
    const evaluating = reduce(recording, { type: "MIC_RELEASED" });

    assert.equal(waiting.phase, LessonPhase.WaitingForUser);
    assert.equal(waiting.stepIndex, 1);
    assert.equal(recording.phase, LessonPhase.Recording);
    assert.equal(evaluating.phase, LessonPhase.Evaluating);
  });

  it("advances automatically after successful feedback", () => {
    const evaluating = releaseRecording(startAtUser());
    const feedback = reduce(evaluating, {
      type: "EVALUATED",
      passed: true,
      transcript: "here you are",
    });
    const narrator = reduce(feedback, { type: "FEEDBACK_DONE" });
    const finished = reduce(narrator, { type: "LINE_DONE" });

    assert.equal(feedback.phase, LessonPhase.Feedback);
    assert.equal(feedback.feedback, "Great job!");
    assert.equal(feedback.feedbackOutcome, "success");
    assert.equal(narrator.phase, LessonPhase.Speaking);
    assert.equal(narrator.sceneIndex, 1);
    assert.equal(narrator.stepIndex, 0);
    assert.equal(finished.phase, LessonPhase.Finished);
  });

  it("replays the model after the first miss and continues after the second", () => {
    const firstEvaluation = releaseRecording(startAtUser());
    const firstFeedback = reduce(firstEvaluation, {
      type: "EVALUATED",
      passed: false,
      transcript: "here",
    });
    const replayingModel = reduce(firstFeedback, { type: "FEEDBACK_DONE" });
    const waitingAgain = reduce(replayingModel, { type: "LINE_DONE" });
    const secondEvaluation = releaseRecording(waitingAgain);
    const secondFeedback = reduce(secondEvaluation, {
      type: "EVALUATED",
      passed: false,
      transcript: "are",
    });
    const narrator = reduce(secondFeedback, { type: "FEEDBACK_DONE" });

    assert.equal(firstFeedback.feedback, "Almost! Try again, Bella.");
    assert.equal(firstFeedback.feedbackOutcome, "retry");
    assert.equal(firstFeedback.attemptCount, 1);
    assert.equal(replayingModel.phase, LessonPhase.Speaking);
    assert.equal(replayingModel.stepIndex, 0);
    assert.equal(replayingModel.attemptCount, 1);
    assert.equal(waitingAgain.phase, LessonPhase.WaitingForUser);
    assert.equal(waitingAgain.attemptCount, 1);
    assert.equal(secondFeedback.feedback, "Almost! Let's keep going.");
    assert.equal(secondFeedback.feedbackOutcome, "continue");
    assert.equal(narrator.sceneIndex, 1);
    assert.equal(narrator.phase, LessonPhase.Speaking);
  });

  it("returns to the same user step when recording is cancelled", () => {
    const waiting = startAtUser();
    const recording = reduce(waiting, { type: "MIC_STARTED" });
    const cancelled = reduce(recording, { type: "RECORDING_CANCELLED" });

    assert.equal(cancelled.phase, LessonPhase.WaitingForUser);
    assert.equal(cancelled.sceneIndex, waiting.sceneIndex);
    assert.equal(cancelled.stepIndex, waiting.stepIndex);
  });

  it("turns evaluation request failures into one retry", () => {
    const evaluating = releaseRecording(startAtUser());
    const feedback = reduce(evaluating, { type: "EVALUATION_FAILED" });

    assert.equal(feedback.phase, LessonPhase.Feedback);
    assert.equal(feedback.feedback, "I couldn't hear that. Try again, Bella.");
    assert.equal(feedback.feedbackOutcome, "retry");
    assert.equal(feedback.attemptCount, 1);
  });

  it("resets the complete script position", () => {
    const reset = reduce(
      {
        ...createInitialLessonState(),
        phase: LessonPhase.Feedback,
        sceneIndex: 1,
        stepIndex: 2,
        attemptCount: 1,
        feedback: "Almost!",
      },
      { type: "RESET" }
    );

    assert.deepEqual(reset, createInitialLessonState());
  });
});
