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

const check = {
  maxAttempts: 2,
  correct: {
    speaker: "peppa",
    dialogue: "Well done!",
    emotes: { peppa: "happy" },
    after: "continue",
  },
  incorrect: {
    speaker: "dolly",
    dialogue: "Almost! Try again.",
    after: "retry",
  },
  incorrectFinal: {
    speaker: "peppa",
    dialogue: "Good try! Let's continue.",
    after: "continue",
  },
};

const lesson = {
  childName: "Bella",
  scenes: [
    {
      title: "Practice",
      steps: [
        { speaker: "dolly", dialogue: "Here you are!" },
        { speaker: "user", dialogue: "Here you are!", check },
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
        phase: LessonPhase.Responding,
        sceneIndex: 1,
        stepIndex: 4,
        attemptCount: 1,
        response: check.incorrect,
        transcript: "partial response",
        responseOutcome: "incorrect",
      },
      { type: "PAUSE_SCENE" }
    );

    assert.equal(paused.phase, LessonPhase.Paused);
    assert.equal(paused.sceneIndex, 1);
    assert.equal(paused.stepIndex, 0);
    assert.equal(paused.attemptCount, 0);
    assert.equal(paused.response, null);
    assert.equal(paused.transcript, "");
    assert.equal(paused.responseOutcome, null);
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
        phase: LessonPhase.Responding,
        stepIndex: 1,
        attemptCount: 1,
        response: check.incorrect,
        transcript: "partial response",
        responseOutcome: "incorrect",
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

  it("plays the scripted responder and advances after a correct check", () => {
    const evaluating = releaseRecording(startAtUser());
    const responding = reduce(evaluating, {
      type: "EVALUATED",
      outcome: "correct",
      transcript: "here you are",
    });
    const nextScene = reduce(responding, { type: "RESPONSE_DONE" });
    const finished = reduce(nextScene, { type: "LINE_DONE" });

    assert.equal(responding.phase, LessonPhase.Responding);
    assert.strictEqual(responding.response, check.correct);
    assert.equal(responding.responseOutcome, "correct");
    assert.equal(nextScene.phase, LessonPhase.Speaking);
    assert.equal(nextScene.sceneIndex, 1);
    assert.equal(nextScene.stepIndex, 0);
    assert.equal(finished.phase, LessonPhase.Finished);
  });

  it("replays the model after the first miss and continues after the second", () => {
    const firstEvaluation = releaseRecording(startAtUser());
    const firstResponse = reduce(firstEvaluation, {
      type: "EVALUATED",
      outcome: "incorrect",
      transcript: "here",
    });
    const replayingModel = reduce(firstResponse, { type: "RESPONSE_DONE" });
    const waitingAgain = reduce(replayingModel, { type: "LINE_DONE" });
    const secondEvaluation = releaseRecording(waitingAgain);
    const secondResponse = reduce(secondEvaluation, {
      type: "EVALUATED",
      outcome: "incorrect",
      transcript: "are",
    });
    const nextScene = reduce(secondResponse, { type: "RESPONSE_DONE" });

    assert.strictEqual(firstResponse.response, check.incorrect);
    assert.equal(firstResponse.responseOutcome, "incorrect");
    assert.equal(firstResponse.attemptCount, 1);
    assert.equal(replayingModel.phase, LessonPhase.Speaking);
    assert.equal(replayingModel.stepIndex, 0);
    assert.equal(replayingModel.attemptCount, 1);
    assert.equal(waitingAgain.phase, LessonPhase.WaitingForUser);
    assert.equal(waitingAgain.attemptCount, 1);
    assert.strictEqual(secondResponse.response, check.incorrectFinal);
    assert.equal(secondResponse.responseOutcome, "incorrectFinal");
    assert.equal(nextScene.sceneIndex, 1);
    assert.equal(nextScene.phase, LessonPhase.Speaking);
  });

  it("retries a checked user-first step without waiting for model playback", () => {
    const userFirstLesson = {
      childName: "Bella",
      scenes: [
        {
          title: "User",
          steps: [{ speaker: "user", dialogue: "Hello!", check }],
        },
      ],
    };
    const waiting = reduce(
      createInitialLessonState(),
      { type: "PLAY_SCENE" },
      userFirstLesson,
    );
    const recording = reduce(
      waiting,
      { type: "MIC_STARTED" },
      userFirstLesson,
    );
    const evaluating = reduce(
      recording,
      { type: "MIC_RELEASED" },
      userFirstLesson,
    );
    const responding = reduce(
      evaluating,
      { type: "EVALUATED", outcome: "incorrect", transcript: "" },
      userFirstLesson,
    );
    const retrying = reduce(
      responding,
      { type: "RESPONSE_DONE" },
      userFirstLesson,
    );

    assert.equal(retrying.phase, LessonPhase.WaitingForUser);
    assert.equal(retrying.stepIndex, 0);
    assert.equal(retrying.attemptCount, 1);
  });

  it("uses no-input handlers when present and incorrect handlers as fallbacks", () => {
    const noInputResponse = {
      speaker: "narrator",
      dialogue: "I couldn't hear you. Try again.",
      after: "retry",
    };
    const explicitLesson = JSON.parse(JSON.stringify(lesson));
    explicitLesson.scenes[0].steps[1].check.noInput = noInputResponse;
    const explicit = reduce(
      releaseRecording(startAtUser()),
      { type: "EVALUATED", outcome: "noInput", transcript: "" },
      explicitLesson,
    );
    const fallback = reduce(releaseRecording(startAtUser()), {
      type: "EVALUATED",
      outcome: "noInput",
      transcript: "",
    });

    assert.strictEqual(explicit.response, noInputResponse);
    assert.equal(explicit.responseOutcome, "noInput");
    assert.strictEqual(fallback.response, check.incorrect);
    assert.equal(fallback.responseOutcome, "noInput");
  });

  it("advances an unchecked user step without entering evaluation", () => {
    const uncheckedLesson = JSON.parse(JSON.stringify(lesson));
    delete uncheckedLesson.scenes[0].steps[1].check;
    const waiting = startAtUser();
    const recording = reduce(waiting, { type: "MIC_STARTED" }, uncheckedLesson);
    const advanced = reduce(recording, { type: "MIC_RELEASED" }, uncheckedLesson);

    assert.equal(advanced.phase, LessonPhase.Speaking);
    assert.equal(advanced.sceneIndex, 1);
    assert.equal(advanced.stepIndex, 0);
  });

  it("returns to the same user step when recording is cancelled", () => {
    const waiting = startAtUser();
    const recording = reduce(waiting, { type: "MIC_STARTED" });
    const cancelled = reduce(recording, { type: "RECORDING_CANCELLED" });

    assert.equal(cancelled.phase, LessonPhase.WaitingForUser);
    assert.equal(cancelled.sceneIndex, waiting.sceneIndex);
    assert.equal(cancelled.stepIndex, waiting.stepIndex);
  });

  it("returns to the same user step after an evaluation service failure", () => {
    const evaluating = releaseRecording(startAtUser());
    const waiting = reduce(evaluating, { type: "EVALUATION_FAILED" });

    assert.equal(waiting.phase, LessonPhase.WaitingForUser);
    assert.equal(waiting.stepIndex, evaluating.stepIndex);
    assert.equal(waiting.attemptCount, 0);
  });

  it("resets the complete script position", () => {
    const reset = reduce(
      {
        ...createInitialLessonState(),
        phase: LessonPhase.Responding,
        sceneIndex: 1,
        stepIndex: 2,
        attemptCount: 1,
        response: check.incorrect,
      },
      { type: "RESET" }
    );

    assert.deepEqual(reset, createInitialLessonState());
  });
});
