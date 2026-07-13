import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as lessonAudio from "../lib/lesson-audio.js";
import { LessonPhase, createInitialLessonState } from "../lib/lesson-state.js";

const getLessonAudioLine =
  lessonAudio.getLessonAudioLine ?? (() => undefined);
const getLessonSpeechLine =
  lessonAudio.getLessonSpeechLine ?? (() => undefined);
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
  it("returns source-independent speech for on-device My Lesson playback", () => {
    assert.deepEqual(
      getLessonSpeechLine(
        { ...createInitialLessonState(), phase: LessonPhase.Speaking },
        lesson,
      ),
      { speaker: "dolly", text: "Here you are!" },
    );
    assert.deepEqual(
      getLessonSpeechLine(
        {
          ...createInitialLessonState(),
          phase: LessonPhase.Responding,
          response: {
            speaker: "narrator",
            dialogue: "Almost! Try again, Bella.",
            after: "retry",
          },
        },
        lesson,
      ),
      { speaker: "narrator", text: "Almost! Try again, Bella." },
    );
  });

  it("resolves the current scripted speaker by exact text", () => {
    const line = getLessonAudioLine(
      { ...createInitialLessonState(), phase: LessonPhase.Speaking },
      lesson
    );

    assert.deepEqual(line, {
      audioId: "dolly-here-you-are",
      audioSrc: "/assets/audio/dolly-here-you-are.mp3",
      lang: "en-US",
      speaker: "dolly",
      text: "Here you are!",
    });
  });

  it("resolves scripted response audio using its actual speaker", () => {
    const line = getLessonAudioLine(
      {
        ...createInitialLessonState(),
        phase: LessonPhase.Responding,
        response: {
          speaker: "dolly",
          dialogue: "Here you are!",
          after: "retry",
        },
        responseOutcome: "incorrect",
      },
      lesson
    );

    assert.equal(line.speaker, "dolly");
    assert.equal(line.text, "Here you are!");
    assert.equal(line.audioSrc, "/assets/audio/dolly-here-you-are.mp3");
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
