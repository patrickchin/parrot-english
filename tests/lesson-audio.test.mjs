import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getLessonAudioCompletionEvent,
  getLessonAudioSequence,
} from "../lib/lesson-audio.js";
import { LessonPhase, createInitialLessonState } from "../lib/lesson-state.js";

const step = {
  id: "renamed-greeting-step",
  exampleLine: "Hello, Bella!",
  parrotPromptZh: "佩奇在和你打招呼。我们回答佩奇。",
  parrotModelLine: "Hello, Peppa!",
  childTarget: "Hello, Peppa!",
  audio: {
    example: "example-hello",
    prompt: "turn-hello",
    model: "model-hello",
  },
};

describe("lesson audio", () => {
  it("plays Peppa's example line first", () => {
    const sequence = getLessonAudioSequence(
      { ...createInitialLessonState(), phase: LessonPhase.ExampleSpeaking },
      step
    );

    assert.deepEqual(sequence, [
      {
        audioId: "example-hello",
        audioSrc: "/assets/audio/pig-hello.mp3",
        lang: "en-US",
        style: "character",
        text: "Hello, Bella!",
      },
    ]);
    assert.deepEqual(
      getLessonAudioCompletionEvent({
        ...createInitialLessonState(),
        phase: LessonPhase.ExampleSpeaking,
      }),
      { type: "EXAMPLE_DONE" }
    );
  });

  it("has Polly cue in Chinese and model the English target", () => {
    const sequence = getLessonAudioSequence(
      { ...createInitialLessonState(), phase: LessonPhase.ParrotCoaching },
      step
    );

    assert.deepEqual(sequence.map((line) => line.text), [
      "佩奇在和你打招呼。我们回答佩奇。",
      "Hello, Peppa!",
    ]);
    assert.equal(sequence[0].audioSrc, "/assets/audio/turn-hello.mp3");
    assert.equal(sequence[0].lang, "zh-CN");
    assert.equal(sequence[1].audioSrc, "/assets/audio/parrot-hello.mp3");
    assert.equal(sequence[1].lang, "en-US");
    assert.equal(sequence[1].style, "character");
    assert.deepEqual(
      getLessonAudioCompletionEvent({
        ...createInitialLessonState(),
        phase: LessonPhase.ParrotCoaching,
      }),
      { type: "COACH_DONE" }
    );
  });

  it("adds a short handoff pause after Polly's Chinese coaching cue", () => {
    const hereYouAreStep = {
      ...step,
      id: "renamed-helping-step",
      parrotPromptZh: "多莉把东西给佩奇。跟我说。",
      parrotModelLine: "Here you are!",
      childTarget: "Here you are!",
      audio: {
        example: "example-here-you-are",
        prompt: "turn-here-you-are",
        model: "model-here-you-are",
      },
    };

    const sequence = getLessonAudioSequence(
      { ...createInitialLessonState(), phase: LessonPhase.ParrotCoaching },
      hereYouAreStep
    );

    assert.equal(sequence[0].audioId, "turn-here-you-are");
    assert.equal(sequence[0].pauseAfterMs, 350);
    assert.equal(sequence[1].audioId, "model-here-you-are");
    assert.equal(sequence[1].pauseAfterMs, undefined);
  });

  it("uses the saved Chinese prompt again on retry", () => {
    const sequence = getLessonAudioSequence(
      {
        ...createInitialLessonState(),
        phase: LessonPhase.ParrotCoaching,
        retryCount: 1,
      },
      step
    );

    assert.deepEqual(sequence.map((line) => line.text), [
      "佩奇在和你打招呼。我们回答佩奇。",
      "Hello, Peppa!",
    ]);
  });

  it("has Polly speak feedback before retrying or auto-continuing after a correct answer", () => {
    const retryState = {
      ...createInitialLessonState(),
      phase: LessonPhase.Feedback,
      feedback: "差一点点，听多莉慢慢说，再试一次。",
      lastOutcome: "retry",
    };
    const advanceState = {
      ...createInitialLessonState(),
      phase: LessonPhase.Feedback,
      feedback: "太棒了！我们继续下一句。",
      lastOutcome: "advance",
      lastPassed: true,
    };

    assert.deepEqual(getLessonAudioSequence(retryState, step), [
      {
        audioId: "feedback-retry",
        audioSrc: "/assets/audio/feedback-retry.mp3",
        lang: "zh-CN",
        text: "差一点点，听多莉慢慢说，再试一次。",
      },
    ]);
    assert.deepEqual(getLessonAudioCompletionEvent(retryState), {
      type: "RETRY",
    });
    assert.deepEqual(getLessonAudioCompletionEvent(advanceState), {
      type: "NEXT",
    });
  });

  it("does not auto-continue after an incorrect answer uses the last retry", () => {
    const advanceState = {
      ...createInitialLessonState(),
      phase: LessonPhase.Feedback,
      feedback: "差一点点，听多莉慢慢说，再试一次。",
      lastOutcome: "advance",
      lastPassed: false,
    };

    assert.equal(getLessonAudioCompletionEvent(advanceState), null);
  });

  it("stays silent while the child is speaking or the lesson is idle", () => {
    assert.deepEqual(
      getLessonAudioSequence(
        { ...createInitialLessonState(), phase: LessonPhase.Listening },
        step
      ),
      []
    );
    assert.deepEqual(getLessonAudioSequence(createInitialLessonState(), step), []);
    assert.equal(getLessonAudioCompletionEvent(createInitialLessonState()), null);
  });

  it("requires static audio for feedback", () => {
    assert.throws(
      () =>
        getLessonAudioSequence(
          {
            ...createInitialLessonState(),
            feedback: "New feedback without a saved audio file.",
            phase: LessonPhase.Feedback,
          },
          step
        ),
      /Missing static feedback audio/
    );
  });
});
