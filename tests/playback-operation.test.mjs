import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createInitialLessonState,
  reduceLessonState,
} from "../lib/lesson-state.js";
import { createPlaybackOperation } from "../src/playback-operation.ts";

const lesson = {
  childName: "Bella",
  scenes: [
    {
      title: "First scene",
      steps: [{ speaker: "dolly", dialogue: "First line." }],
    },
    {
      title: "Second scene",
      steps: [
        { speaker: "peppa", dialogue: "Second scene, first line." },
        { speaker: "dolly", dialogue: "Second scene, second line." },
      ],
    },
  ],
};

describe("playback operation isolation", () => {
  it("ignores stale outcomes while completing the current operation once", () => {
    const events = [];
    let generation = 1;
    let state = reduceLessonState(
      createInitialLessonState(),
      { type: "PLAY_SCENE" },
      lesson
    );
    const staleOperation = createPlaybackOperation({
      generation,
      getCurrentGeneration: () => generation,
      onCompleted: () => {
        events.push("stale:completed");
        state = reduceLessonState(state, { type: "LINE_DONE" }, lesson);
      },
      onFailed: () => events.push("stale:failed"),
    });

    generation += 1;
    state = reduceLessonState(state, { type: "SCENE_NEXT" }, lesson);
    staleOperation.complete();
    staleOperation.fail(new Error("stale playback failed"));

    assert.equal(state.sceneIndex, 1);
    assert.equal(state.stepIndex, 0);

    const currentOperation = createPlaybackOperation({
      generation,
      getCurrentGeneration: () => generation,
      onCompleted: () => {
        events.push("current:completed");
        state = reduceLessonState(state, { type: "LINE_DONE" }, lesson);
      },
      onFailed: () => events.push("current:failed"),
    });
    currentOperation.complete();
    currentOperation.complete();
    currentOperation.fail(new Error("late current failure"));

    assert.deepEqual(events, ["current:completed"]);
    assert.equal(state.sceneIndex, 1);
    assert.equal(state.stepIndex, 1);
  });
});
