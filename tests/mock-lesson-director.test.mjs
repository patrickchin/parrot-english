import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AI_LESSON } from "../lib/ai-lesson-data.js";
import { getMockDirectorPacket } from "../lib/mock-lesson-director.js";
import { validateLessonDirectorResponse } from "../lib/lesson-director-schema.js";

describe("mock lesson director", () => {
  const passedGreetingResult = {
    targetText: "Hello, Peppa!",
    transcript: "hello peppa",
    passed: true,
    similarity: 0.92,
    reason: "matched_target",
  };

  const packetVariantCases = [
    {
      name: "start",
      runtimeState: {
        currentSceneId: "greeting",
        phase: "start_scene",
        attemptNumber: 0,
        successfulRepeats: 0,
        previousTurnSummary: [],
        lastChildResult: null,
      },
    },
    {
      name: "success-repeat",
      runtimeState: {
        currentSceneId: "greeting",
        phase: "after_child_answer",
        attemptNumber: 1,
        successfulRepeats: 0,
        previousTurnSummary: [],
        lastChildResult: passedGreetingResult,
      },
    },
    {
      name: "retry",
      runtimeState: {
        currentSceneId: "greeting",
        phase: "after_child_answer",
        attemptNumber: 1,
        successfulRepeats: 0,
        previousTurnSummary: [],
        lastChildResult: {
          targetText: "Hello, Peppa!",
          transcript: "yellow",
          passed: false,
          similarity: 0.2,
          reason: "below_threshold",
        },
      },
    },
    {
      name: "advance",
      runtimeState: {
        currentSceneId: "greeting",
        phase: "after_child_answer",
        attemptNumber: 2,
        successfulRepeats: 1,
        previousTurnSummary: [],
        lastChildResult: passedGreetingResult,
      },
    },
    {
      name: "finish",
      runtimeState: {
        currentSceneId: "thank-you",
        phase: "after_child_answer",
        attemptNumber: 2,
        successfulRepeats: 1,
        previousTurnSummary: [],
        lastChildResult: {
          targetText: "Thank you!",
          transcript: "thank you",
          passed: true,
          similarity: 0.92,
          reason: "matched_target",
        },
      },
    },
  ];

  for (const { name, runtimeState } of packetVariantCases) {
    it(`returns a schema-valid ${name} packet`, () => {
      const packet = getMockDirectorPacket(AI_LESSON, runtimeState);

      assert.equal(validateLessonDirectorResponse(packet, AI_LESSON).ok, true);
    });
  }

  it("returns a start packet ending with a child prompt", () => {
    const packet = getMockDirectorPacket(AI_LESSON, {
      currentSceneId: "greeting",
      phase: "start_scene",
      attemptNumber: 0,
      successfulRepeats: 0,
      previousTurnSummary: [],
      lastChildResult: null,
    });

    assert.equal(packet.sceneId, "greeting");
    assert.equal(packet.lessonControl.status, "prompt_child");
    assert.equal(packet.childPrompt.targetText, "Hello, Peppa!");
    assert.equal(packet.turns.at(-1).purpose, "prompt_repeat");
    assert.equal(validateLessonDirectorResponse(packet, AI_LESSON).ok, true);
  });

  it("returns success repeat when policy requires it", () => {
    const packet = getMockDirectorPacket(AI_LESSON, {
      currentSceneId: "greeting",
      phase: "after_child_answer",
      attemptNumber: 1,
      successfulRepeats: 0,
      previousTurnSummary: [],
      lastChildResult: {
        targetText: "Hello, Peppa!",
        transcript: "hello peppa",
        passed: true,
        similarity: 0.92,
        reason: "matched_target",
      },
    });

    assert.equal(packet.lessonControl.reason, "success_repeat_required");
    assert.equal(packet.childPrompt.shouldListen, true);
  });

  it("advances after a successful repeat", () => {
    const packet = getMockDirectorPacket(AI_LESSON, {
      currentSceneId: "greeting",
      phase: "after_child_answer",
      attemptNumber: 2,
      successfulRepeats: 1,
      previousTurnSummary: [],
      lastChildResult: {
        targetText: "Hello, Peppa!",
        transcript: "hello peppa",
        passed: true,
        similarity: 0.92,
        reason: "matched_target",
      },
    });

    assert.equal(packet.lessonControl.status, "advance_scene");
    assert.equal(packet.lessonControl.nextSceneId, "cant-reach");
    assert.equal(packet.childPrompt.shouldListen, false);
  });

  it("finishes after the final scene completes", () => {
    const packet = getMockDirectorPacket(AI_LESSON, {
      currentSceneId: "thank-you",
      phase: "after_child_answer",
      attemptNumber: 2,
      successfulRepeats: 1,
      previousTurnSummary: [],
      lastChildResult: {
        targetText: "Thank you!",
        transcript: "thank you",
        passed: true,
        similarity: 0.92,
        reason: "matched_target",
      },
    });

    assert.equal(packet.lessonControl.status, "finish_lesson");
    assert.equal(packet.lessonControl.nextSceneId, null);
    assert.equal(packet.childPrompt.shouldListen, false);
    assert.equal(validateLessonDirectorResponse(packet, AI_LESSON).ok, true);
  });

  it("retries a failed answer with segmented prompt speech", () => {
    const packet = getMockDirectorPacket(AI_LESSON, {
      currentSceneId: "greeting",
      phase: "after_child_answer",
      attemptNumber: 1,
      successfulRepeats: 0,
      previousTurnSummary: [],
      lastChildResult: {
        targetText: "Hello, Peppa!",
        transcript: "yellow",
        passed: false,
        similarity: 0.2,
        reason: "below_threshold",
      },
    });

    const prompt = packet.turns.at(-1);
    assert.equal(packet.lessonControl.status, "prompt_child");
    assert.deepEqual(prompt.speech, [
      { lang: "zh-CN", text: "轮到你说：" },
      { lang: "en-US", text: "Hello, Peppa!" },
    ]);
  });

  it("advances without listening when a failed answer reaches max retries", () => {
    const packet = getMockDirectorPacket(AI_LESSON, {
      currentSceneId: "greeting",
      phase: "after_child_answer",
      attemptNumber: AI_LESSON.teachingPolicy.maxRetriesPerScene,
      successfulRepeats: 0,
      previousTurnSummary: [],
      lastChildResult: {
        targetText: "Hello, Peppa!",
        transcript: "yellow",
        passed: false,
        similarity: 0.2,
        reason: "below_threshold",
      },
    });

    assert.equal(packet.lessonControl.status, "advance_scene");
    assert.equal(packet.lessonControl.nextSceneId, "cant-reach");
    assert.equal(packet.childPrompt.shouldListen, false);
    assert.equal(validateLessonDirectorResponse(packet, AI_LESSON).ok, true);
  });
});
