import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLessonProgressLabel } from "../lib/lesson-progress.js";
import { LessonPhase, createInitialLessonState } from "../lib/lesson-state.js";

describe("lesson progress label", () => {
  it("describes idle, paused, and completed playback", () => {
    assert.equal(getLessonProgressLabel(createInitialLessonState()), "Press Start to begin");
    assert.equal(
      getLessonProgressLabel({ ...createInitialLessonState(), phase: LessonPhase.Paused }),
      "Story paused — press Play to resume",
    );
    assert.equal(
      getLessonProgressLabel({ ...createInitialLessonState(), phase: LessonPhase.Finished }),
      "Lesson complete",
    );
  });

  it("describes automatic character and narrator speech", () => {
    const speaking = { ...createInitialLessonState(), phase: LessonPhase.Speaking };

    assert.equal(getLessonProgressLabel(speaking, { speaker: "dolly" }), "Listen to Dolly");
    assert.equal(getLessonProgressLabel(speaking, { speaker: "narrator" }), "Listen to the narrator");
  });

  it("invites the learner to join in", () => {
    assert.equal(
      getLessonProgressLabel({ ...createInitialLessonState(), phase: LessonPhase.JoiningIn }),
      "Join in if you want",
    );
  });
});
