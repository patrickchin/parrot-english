import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLessonAudioLine, getLessonSpeechLine } from "../lib/lesson-audio.js";
import { LessonPhase, createInitialLessonState } from "../lib/lesson-state.js";

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
  it("returns source-independent story speech only while speaking", () => {
    assert.deepEqual(
      getLessonSpeechLine(
        { ...createInitialLessonState(), phase: LessonPhase.Speaking },
        lesson,
      ),
      { speaker: "dolly", text: "Here you are!" },
    );
    assert.equal(
      getLessonSpeechLine(
        { ...createInitialLessonState(), phase: LessonPhase.JoiningIn, stepIndex: 1 },
        lesson,
      ),
      null,
    );
  });

  it("resolves the current scripted speaker by exact text", () => {
    assert.deepEqual(
      getLessonAudioLine(
        { ...createInitialLessonState(), phase: LessonPhase.Speaking },
        lesson,
      ),
      {
        audioId: "dolly-here-you-are",
        audioSrc: "/assets/audio/dolly-here-you-are.mp3",
        lang: "en-US",
        speaker: "dolly",
        text: "Here you are!",
      },
    );
  });

  it("stays silent outside automatic story speech", () => {
    for (const phase of [LessonPhase.Idle, LessonPhase.JoiningIn, LessonPhase.Paused, LessonPhase.Finished]) {
      assert.equal(
        getLessonAudioLine(
          { ...createInitialLessonState(), phase, stepIndex: 1 },
          lesson,
        ),
        null,
      );
    }
  });

  it("reports missing cached speech with speaker and text", () => {
    const missingLesson = {
      childName: "Bella",
      scenes: [{ steps: [{ speaker: "narrator", dialogue: "A new line." }] }],
    };

    assert.throws(
      () => getLessonAudioLine(
        { ...createInitialLessonState(), phase: LessonPhase.Speaking },
        missingLesson,
      ),
      /Missing saved audio for narrator: A new line\./,
    );
  });
});
