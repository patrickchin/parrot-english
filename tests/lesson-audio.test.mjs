import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getLessonAudioCompletionEvent,
  getLessonAudioSequence,
} from "../lib/lesson-audio.js";
import { LessonPhase, createInitialLessonState } from "../lib/lesson-state.js";

const step = {
  id: "hello",
  hostLine: "Hi, Bella! How are you?",
  parrotLine: "This is my parrot, Polly!",
  childTarget: "This is my parrot, Polly!",
};

describe("lesson audio", () => {
  it("speaks a Chinese instruction before Peppa's host line", () => {
    const sequence = getLessonAudioSequence(
      { ...createInitialLessonState(), phase: LessonPhase.HostSpeaking },
      step
    );

    assert.deepEqual(sequence, [
      {
        audioId: "instruction-peppa",
        audioSrc: "/assets/audio/instruction-peppa.wav",
        character: "coach",
        engine: "asset",
        lang: "zh-CN",
        slow: false,
        text: "先听佩奇说。",
      },
      {
        audioId: "host-hello",
        audioSrc: "/assets/audio/host-hello.wav",
        character: "peppa",
        engine: "asset",
        lang: "en-US",
        slow: false,
        style: "character",
        text: "Hi, Bella! How are you?",
      },
    ]);
    assert.deepEqual(
      getLessonAudioCompletionEvent({
        ...createInitialLessonState(),
        phase: LessonPhase.HostSpeaking,
      }),
      { type: "HOST_DONE" }
    );
  });

  it("speaks a Chinese turn prompt after Polly's demo line", () => {
    const sequence = getLessonAudioSequence(
      { ...createInitialLessonState(), phase: LessonPhase.ParrotSpeaking },
      step
    );

    assert.deepEqual(sequence.map((line) => line.text), [
      "再听多莉说一遍。",
      "This is my parrot, Polly!",
      "轮到你了，请说：This is my parrot, Polly!",
    ]);
    assert.equal(sequence[0].engine, "asset");
    assert.equal(sequence[1].engine, "asset");
    assert.equal(sequence[1].audioSrc, "/assets/audio/parrot-hello.wav");
    assert.equal(sequence[1].style, "character");
    assert.equal(sequence[2].engine, "asset");
    assert.deepEqual(
      getLessonAudioCompletionEvent({
        ...createInitialLessonState(),
        phase: LessonPhase.ParrotSpeaking,
      }),
      { type: "PARROT_DONE" }
    );
  });

  it("slows Polly's retry line without replaying Peppa", () => {
    const sequence = getLessonAudioSequence(
      {
        ...createInitialLessonState(),
        phase: LessonPhase.ParrotSpeaking,
        retryCount: 1,
      },
      step
    );

    assert.equal(sequence[1].character, "polly");
    assert.equal(sequence[1].slow, true);
    assert.equal(sequence[1].text, "This is my parrot, Polly!");
  });

  it("speaks feedback before retrying or advancing", () => {
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
        character: "polly",
        engine: "asset",
        lang: "zh-CN",
        slow: false,
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
