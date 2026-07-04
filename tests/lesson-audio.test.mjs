import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as lessonAudio from "../lib/lesson-audio.js";
import { LessonPhase, createInitialLessonState } from "../lib/lesson-state.js";

const getLessonAudioLine =
  lessonAudio.getLessonAudioLine ?? (() => undefined);
const lesson = {
  childName: "Bella",
  scenes: [
    {
      steps: [
        { speaker: "dolly", dialogue: "Here you are!" },
        { speaker: "user", dialogue: "Here you are!" },
      ],
    },
  ],
};

describe("lesson audio", () => {
  it("resolves the current scripted speaker by exact text", () => {
    const line = getLessonAudioLine(
      { ...createInitialLessonState(), phase: LessonPhase.Speaking },
      lesson
    );

    assert.deepEqual(line, {
      audioId: "dolly-here-you-are",
      audioSrc: "/assets/audio/dolly-here-you-are.wav",
      lang: "en-US",
      speaker: "dolly",
      text: "Here you are!",
    });
  });

  it("uses narrator cache entries for runner feedback", () => {
    const line = getLessonAudioLine(
      {
        ...createInitialLessonState(),
        phase: LessonPhase.Feedback,
        feedback: "Almost! Try again, Bella.",
        feedbackOutcome: "retry",
      },
      lesson
    );

    assert.equal(line.speaker, "narrator");
    assert.equal(line.text, "Almost! Try again, Bella.");
    assert.equal(line.audioSrc, "/assets/audio/narrator-retry-bella.wav");
  });

  it("stays silent for user interaction and idle phases", () => {
    for (const phase of [
      LessonPhase.Idle,
      LessonPhase.WaitingForUser,
      LessonPhase.Recording,
      LessonPhase.Evaluating,
      LessonPhase.Finished,
    ]) {
      assert.equal(
        getLessonAudioLine(
          { ...createInitialLessonState(), phase, stepIndex: 1 },
          lesson
        ),
        null
      );
    }
  });

  it("reports missing cached speech with speaker and text", () => {
    const missingLesson = {
      childName: "Bella",
      scenes: [{ steps: [{ speaker: "narrator", dialogue: "A new line." }] }],
    };

    assert.throws(
      () =>
        getLessonAudioLine(
          { ...createInitialLessonState(), phase: LessonPhase.Speaking },
          missingLesson
        ),
      /Missing saved audio for narrator: A new line\./
    );
  });
});
