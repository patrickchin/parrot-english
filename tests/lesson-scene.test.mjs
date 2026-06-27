import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LessonPhase, createInitialLessonState } from "../lib/lesson-state.js";
import { getLessonScenePresentation } from "../lib/lesson-scene.js";

const step = {
  sceneTitleZh: "多莉打招呼",
  exampleLine: "Hi, Bella! How are you?",
  parrotPromptZh: "轮到你了，跟着佩奇说。",
  childTarget: "Hi, Bella! How are you?",
  tipZh: "先听佩奇打招呼，再跟着说。",
};

describe("lesson scene presentation", () => {
  it("returns separate character bubbles for each scene", () => {
    const scene = getLessonScenePresentation(
      createInitialLessonState(),
      step
    );

    assert.equal(scene.peppaBubble.text, "Hi, Bella! How are you?");
    assert.equal(scene.pollyBubble.text, "轮到你了，跟着佩奇说。");
    assert.equal(scene.peppaBubble.tone, "example");
    assert.equal(scene.pollyBubble.tone, "coach");
    assert.equal(scene.activeSpeaker, null);
  });

  it("marks Peppa active while the example is speaking", () => {
    const scene = getLessonScenePresentation(
      { ...createInitialLessonState(), phase: LessonPhase.ExampleSpeaking },
      step
    );

    assert.equal(scene.activeSpeaker, "peppa");
    assert.equal(scene.peppaBubble.isActive, true);
    assert.equal(scene.pollyBubble.isActive, false);
  });

  it("marks Polly active while the parrot gives the Chinese prompt", () => {
    const scene = getLessonScenePresentation(
      { ...createInitialLessonState(), phase: LessonPhase.ParrotCoaching },
      step
    );

    assert.equal(scene.activeSpeaker, "polly");
    assert.equal(scene.peppaBubble.isActive, false);
    assert.equal(scene.pollyBubble.isActive, true);
    assert.equal(scene.pollyBubble.text, "轮到你了，跟着佩奇说。");
  });

  it("prompts the child in Chinese with the target phrase while listening", () => {
    const scene = getLessonScenePresentation(
      { ...createInitialLessonState(), phase: LessonPhase.Listening },
      step
    );

    assert.equal(scene.activeSpeaker, "child");
    assert.equal(scene.pollyBubble.text, "轮到你：Hi, Bella! How are you?");
    assert.equal(scene.pollyBubble.tone, "listen");
    assert.equal(scene.pollyBubble.isActive, true);
  });

  it("uses live feedback in Polly's bubble after evaluation", () => {
    const scene = getLessonScenePresentation(
      {
        ...createInitialLessonState(),
        phase: LessonPhase.Feedback,
        feedback: "Great try. Say it one more time.",
        transcript: "this is parrot polly",
        lastOutcome: "retry",
      },
      step
    );

    assert.equal(scene.activeSpeaker, "polly");
    assert.equal(scene.pollyBubble.text, "Great try. Say it one more time.");
    assert.equal(scene.pollyBubble.tone, "feedback");
    assert.equal(scene.statusText, "我听到：this is parrot polly");
  });
});
