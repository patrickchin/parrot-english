import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getLessonAudioCompletionEvent,
  getLessonAudioSequence,
} from "../lib/lesson-audio.js";
import { LessonPhase, createInitialLessonState } from "../lib/lesson-state.js";

const step = {
  id: "hello",
  exampleLine: "Hi, Bella! How are you?",
  parrotPromptZh: "轮到你了，跟着佩奇说。",
  childTarget: "Hi, Bella! How are you?",
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
        audioSrc: "/assets/audio/pig-hello.wav",
        lang: "en-US",
        style: "character",
        text: "Hi, Bella! How are you?",
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

  it("has Polly tell the child what to do in Chinese", () => {
    const sequence = getLessonAudioSequence(
      { ...createInitialLessonState(), phase: LessonPhase.ParrotCoaching },
      step
    );

    assert.deepEqual(sequence.map((line) => line.text), [
      "轮到你了，跟着佩奇说。",
    ]);
    assert.equal(sequence[0].audioSrc, "/assets/audio/turn-hello.wav");
    assert.equal(sequence[0].lang, "zh-CN");
    assert.deepEqual(
      getLessonAudioCompletionEvent({
        ...createInitialLessonState(),
        phase: LessonPhase.ParrotCoaching,
      }),
      { type: "COACH_DONE" }
    );
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

    assert.equal(sequence.length, 1);
    assert.equal(sequence[0].text, "轮到你了，跟着佩奇说。");
  });

  it("has Polly speak feedback before retrying or waiting for manual next", () => {
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
    };

    assert.deepEqual(getLessonAudioSequence(retryState, step), [
      {
        audioId: "feedback-retry",
        audioSrc: "/assets/audio/feedback-retry.wav",
        lang: "zh-CN",
        text: "差一点点，听多莉慢慢说，再试一次。",
      },
    ]);
    assert.deepEqual(getLessonAudioCompletionEvent(retryState), {
      type: "RETRY",
    });
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
