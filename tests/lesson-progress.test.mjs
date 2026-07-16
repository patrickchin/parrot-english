import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLessonProgressLabel } from "../lib/lesson-progress.js";
import { LessonPhase, createInitialLessonState } from "../lib/lesson-state.js";

describe("lesson progress label", () => {
  it("describes idle and paused playback", () => {
    assert.equal(
      getLessonProgressLabel(createInitialLessonState()),
      "Press Start to begin"
    );
    assert.equal(
      getLessonProgressLabel({
        ...createInitialLessonState(),
        phase: LessonPhase.Paused,
      }),
      "Scene paused — press Play to restart"
    );
  });

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
      [LessonPhase.WaitingForUser, "Tap the microphone to start speaking"],
      [LessonPhase.Recording, "Tap the microphone when you're finished"],
      [LessonPhase.Evaluating, "Checking your speech"],
      [LessonPhase.Finished, "Lesson complete"],
    ];

    for (const [phase, expected] of labels) {
      assert.equal(
        getLessonProgressLabel({ ...createInitialLessonState(), phase }),
        expected
      );
    }
  });

  it("names the scripted responder", () => {
    assert.equal(
      getLessonProgressLabel(
        { ...createInitialLessonState(), phase: LessonPhase.Responding },
        { speaker: "peppa" },
      ),
      "Listen to Peppa",
    );
  });
});
