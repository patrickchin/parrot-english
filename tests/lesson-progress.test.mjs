import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLessonProgressLabel } from "../lib/lesson-progress.js";
import { LessonPhase, createInitialLessonState } from "../lib/lesson-state.js";

describe("lesson progress label", () => {
  it("does not duplicate live retry feedback in the flow banner", () => {
    const feedback = "差一点点，听多莉慢慢说，再试一次。";
    const label = getLessonProgressLabel({
      ...createInitialLessonState(),
      phase: LessonPhase.Feedback,
      feedback,
      lastOutcome: "retry",
    });

    assert.equal(label, "准备再试一次");
    assert.notEqual(label, feedback);
  });

  it("uses a short flow status before advancing", () => {
    const label = getLessonProgressLabel({
      ...createInitialLessonState(),
      phase: LessonPhase.Feedback,
      feedback: "太棒了！我们继续下一句。",
      lastOutcome: "advance",
    });

    assert.equal(label, "准备下一句");
  });
});
