import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as lessonAudio from "../lib/lesson-audio.js";
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
  it("resolves a quiet group cue for the current join-in target", () => {
    assert.equal(typeof lessonAudio.getLessonJoinInAudioLine, "function");
    const cue = lessonAudio.getLessonJoinInAudioLine(
      { ...createInitialLessonState(), phase: LessonPhase.JoiningIn, stepIndex: 1 },
      lesson,
    );

    assert.equal(cue.text, "Here you are!");
    assert.equal(cue.volume, 0.28);
    assert.match(cue.audioSrc, /lesson-join-in-.*\.mp3$/);
  });

  it("returns source-independent story speech only while speaking", () => {
    assert.deepEqual(
      lessonAudio.getLessonSpeechLine(
        { ...createInitialLessonState(), phase: LessonPhase.Speaking },
        lesson,
      ),
      { speaker: "dolly", text: "Here you are!" },
    );
    assert.equal(
      lessonAudio.getLessonSpeechLine(
        { ...createInitialLessonState(), phase: LessonPhase.JoiningIn, stepIndex: 1 },
        lesson,
      ),
      null,
    );
  });

  it("resolves the current scripted speaker by exact text", () => {
    assert.deepEqual(
      lessonAudio.getLessonAudioLine(
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
        lessonAudio.getLessonAudioLine(
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
      () => lessonAudio.getLessonAudioLine(
        { ...createInitialLessonState(), phase: LessonPhase.Speaking },
        missingLesson,
      ),
      /Missing saved audio for narrator: A new line\./,
    );
  });
});
