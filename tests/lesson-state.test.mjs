import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LessonPhase,
  createInitialLessonState,
  getCurrentScene,
  getCurrentStep,
  reduceLessonState,
} from "../lib/lesson-state.js";

const lesson = {
  childName: "Bella",
  scenes: [
    {
      title: "Practice",
      steps: [
        { speaker: "dolly", dialogue: "Here you are!" },
        {
          speaker: "user",
          dialogue: "Here you are!",
        },
      ],
    },
    {
      title: "Finish",
      steps: [{ speaker: "narrator", dialogue: "Great job, Bella!" }],
    },
  ],
};

function reduce(state, event, currentLesson = lesson) {
  return reduceLessonState(state, event, currentLesson);
}

describe("scene-script lesson state", () => {
  it("automatically advances a join-in beat", () => {
    const started = reduce(createInitialLessonState(), { type: "PLAY_SCENE" });
    const joining = reduce(started, { type: "LINE_DONE" });

    assert.equal(joining.phase, LessonPhase.JoiningIn);
    assert.equal(joining.stepIndex, 1);
    assert.equal(getCurrentScene(joining, lesson).title, "Practice");
    assert.equal(getCurrentStep(joining, lesson).speaker, "user");

    const next = reduce(joining, { type: "JOIN_IN_DONE" });

    assert.equal(next.phase, LessonPhase.Speaking);
    assert.equal(next.sceneIndex, 1);
    assert.equal(next.stepIndex, 0);
  });

  it("starts a user-first scene as a join-in beat", () => {
    const state = reduce(
      createInitialLessonState(),
      { type: "PLAY_SCENE" },
      {
        childName: "Bella",
        scenes: [{ title: "User", steps: [{ speaker: "user", dialogue: "Hello!" }] }],
      },
    );

    assert.equal(state.phase, LessonPhase.JoiningIn);
  });

  it("pauses and resumes scripted speaking without losing its position", () => {
    const speaking = {
      ...createInitialLessonState(),
      phase: LessonPhase.Speaking,
      sceneIndex: 1,
    };
    const paused = reduce(speaking, { type: "PAUSE_SCENE" });
    const resumed = reduce(paused, { type: "PLAY_SCENE" });

    assert.equal(paused.phase, LessonPhase.Paused);
    assert.equal(paused.resumePhase, "speaking");
    assert.equal(resumed.phase, LessonPhase.Speaking);
    assert.equal(resumed.resumePhase, null);
    assert.equal(resumed.sceneIndex, 1);
  });

  it("pauses and resumes a join-in beat without losing its position", () => {
    const joining = {
      ...createInitialLessonState(),
      phase: LessonPhase.JoiningIn,
      stepIndex: 1,
    };
    const paused = reduce(joining, { type: "PAUSE_SCENE" });
    const resumed = reduce(paused, { type: "PLAY_SCENE" });

    assert.equal(paused.phase, LessonPhase.Paused);
    assert.equal(paused.resumePhase, "joining-in");
    assert.equal(resumed.phase, LessonPhase.JoiningIn);
    assert.equal(resumed.resumePhase, null);
    assert.equal(resumed.stepIndex, 1);
  });

  it("starts adjacent scenes from their first scripted step", () => {
    const next = reduce(createInitialLessonState(), { type: "SCENE_NEXT" });
    const previous = reduce(next, { type: "SCENE_PREVIOUS" });

    assert.equal(next.phase, LessonPhase.Speaking);
    assert.equal(next.sceneIndex, 1);
    assert.equal(previous.phase, LessonPhase.Speaking);
    assert.equal(previous.sceneIndex, 0);
  });

  it("does not move beyond the first or final scene", () => {
    const firstScene = createInitialLessonState();
    const finalScene = { ...firstScene, sceneIndex: lesson.scenes.length - 1 };

    assert.strictEqual(reduce(firstScene, { type: "SCENE_PREVIOUS" }), firstScene);
    assert.strictEqual(reduce(finalScene, { type: "SCENE_NEXT" }), finalScene);
  });

  it("replays a finished lesson from the first scene", () => {
    const replaying = reduce(
      { ...createInitialLessonState(), phase: LessonPhase.Finished, sceneIndex: 1 },
      { type: "REPLAY_LESSON" },
    );

    assert.equal(replaying.phase, LessonPhase.Speaking);
    assert.equal(replaying.sceneIndex, 0);
    assert.equal(replaying.stepIndex, 0);
  });

  it("selects a routed scene from the reduced state", () => {
    const selected = reduce(
      { ...createInitialLessonState(), phase: LessonPhase.JoiningIn, stepIndex: 1 },
      { type: "SELECT_SCENE", sceneIndex: 1 },
    );

    assert.deepEqual(selected, { ...createInitialLessonState(), sceneIndex: 1 });
  });

  it("resets the script position", () => {
    const reset = reduce(
      { ...createInitialLessonState(), phase: LessonPhase.JoiningIn, sceneIndex: 1, stepIndex: 2 },
      { type: "RESET" },
    );

    assert.deepEqual(reset, createInitialLessonState());
  });

  it("creates only script and playback state", () => {
    assert.deepEqual(Object.keys(createInitialLessonState()).sort(), [
      "phase",
      "resumePhase",
      "sceneIndex",
      "stepIndex",
    ]);
  });
});
