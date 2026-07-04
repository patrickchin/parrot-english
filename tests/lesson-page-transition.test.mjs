import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LessonPhase,
  createInitialLessonState,
} from "../lib/lesson-state.js";

const transitionModule = await import("../lib/lesson-page-transition.js").catch(
  (error) => {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    return {};
  }
);
const getLessonEventTargetPageIndex =
  transitionModule.getLessonEventTargetPageIndex ?? (() => undefined);
const totalSteps = 5;

function createState(stepIndex, phase = LessonPhase.Idle) {
  return {
    ...createInitialLessonState(stepIndex),
    phase,
  };
}

describe("lesson event page transitions", () => {
  it("targets the next page for NEXT from a middle page", () => {
    assert.equal(
      getLessonEventTargetPageIndex(
        createState(2, LessonPhase.Feedback),
        { type: "NEXT" },
        totalSteps
      ),
      3
    );
  });

  it("does not move SCENE_NEXT beyond the final page", () => {
    assert.equal(
      getLessonEventTargetPageIndex(
        createState(totalSteps - 1),
        { type: "SCENE_NEXT" },
        totalSteps
      ),
      null
    );
  });

  it("does not move SCENE_PREVIOUS before the first page", () => {
    assert.equal(
      getLessonEventTargetPageIndex(
        createState(0),
        { type: "SCENE_PREVIOUS" },
        totalSteps
      ),
      null
    );
  });

  it("targets page zero when START restarts a finished lesson", () => {
    assert.equal(
      getLessonEventTargetPageIndex(
        createState(totalSteps - 1, LessonPhase.Finished),
        { type: "START" },
        totalSteps
      ),
      0
    );
  });

  it("keeps START on the routed idle page", () => {
    assert.equal(
      getLessonEventTargetPageIndex(
        createState(2, LessonPhase.Idle),
        { type: "START" },
        totalSteps
      ),
      null
    );
  });

  it("does not navigate for non-page events", () => {
    assert.equal(
      getLessonEventTargetPageIndex(
        createState(2, LessonPhase.ExampleSpeaking),
        { type: "EXAMPLE_DONE" },
        totalSteps
      ),
      null
    );
  });
});
