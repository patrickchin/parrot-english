import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLessonProgressLabel } from "../lib/lesson-progress.js";
import { LessonPhase, createInitialLessonState } from "../lib/lesson-state.js";

describe("lesson progress label", () => {
  it("describes automatic character and narrator speech", () => {
    const speaking = { ...createInitialLessonState(), phase: LessonPhase.Speaking };

    assert.equal(
      getLessonProgressLabel(speaking, { speaker: "dolly" }),
      "Listen to Dolly"
    );
    assert.equal(
      getLessonProgressLabel(speaking, { speaker: "narrator" }),
      "Listen to the narrator"
    );
  });

  it("describes every user interaction phase in English", () => {
    const labels = [
      [LessonPhase.WaitingForUser, "Hold the microphone to speak"],
      [LessonPhase.Recording, "Keep holding while you speak"],
      [LessonPhase.Evaluating, "Checking your speech"],
      [LessonPhase.Feedback, "Listen to the narrator"],
      [LessonPhase.Finished, "Lesson complete"],
    ];

    for (const [phase, expected] of labels) {
      assert.equal(
        getLessonProgressLabel({ ...createInitialLessonState(), phase }),
        expected
      );
    }
  });
});
