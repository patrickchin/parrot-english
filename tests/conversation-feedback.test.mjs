import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  conversationFeedbackMilestones,
  selectConversationWaitFeedback,
} from "../src/conversation/conversation-feedback.ts";

function feedback(status, elapsedMs, overrides = {}) {
  return selectConversationWaitFeedback({
    elapsedMs,
    purpose: "small-chat",
    status,
    ...overrides,
  });
}

describe("child-friendly conversation wait feedback", () => {
  it("offers a retry before a young learner waits too long", () => {
    assert.deepEqual(conversationFeedbackMilestones("connecting"), [
      4_000,
      12_000,
    ]);
    assert.equal(feedback("connecting", 0).label, "Getting ready");
    assert.match(feedback("connecting", 0).text, /Starting the voice chat/);
    assert.equal(
      feedback("connecting", 4_000).label,
      "Getting ready",
    );
    assert.equal(
      feedback("connecting", 12_000).label,
      "Chat paused",
    );
    assert.equal(feedback("connecting", 12_000).action, "retry");
    assert.equal(
      feedback("connecting", 12_000, { voiceRetryUsed: true }).action,
      "lesson",
    );
  });

  it("acknowledges a learner immediately before moving to calm wait copy", () => {
    assert.equal(feedback("thinking", 0).label, "Thinking");
    assert.equal(feedback("thinking", 0).showLearnerAnswer, true);
    assert.match(feedback("thinking", 0).text, /Your turn is done/);
    assert.equal(feedback("thinking", 1_800).label, "Thinking");
    assert.equal(feedback("thinking", 1_800).showLearnerAnswer, undefined);
    assert.equal(feedback("thinking", 1_800).text, "Wait for Peppa.");
    assert.equal(feedback("thinking", 7_000).label, "Thinking");
    assert.equal(feedback("thinking", 7_000).text, "Still waiting for Peppa.");
    assert.equal(feedback("thinking", 15_000).action, "retry");
    assert.equal(feedback("thinking", 15_000).label, "Chat paused");
    assert.equal(
      feedback("thinking", 15_000).text,
      "Peppa did not answer.",
    );
    assert.equal(
      feedback("thinking", 15_000, { voiceRetryUsed: true }).action,
      "lesson",
    );
  });

  it("uses the last measured reply only to delay a premature long-wait warning", () => {
    assert.deepEqual(conversationFeedbackMilestones("thinking", 8_000), [
      1_800,
      12_000,
      20_000,
    ]);
    assert.equal(
      feedback("thinking", 8_000, { responseLatencyMs: 8_000 }).label,
      "Thinking",
    );
    assert.equal(
      feedback("thinking", 12_000, { responseLatencyMs: 8_000 }).label,
      "Thinking",
    );
    assert.equal(
      feedback("thinking", 20_000, { responseLatencyMs: 8_000 }).action,
      "retry",
    );
  });

  it("distinguishes ordinary chat finishing from profile saving", () => {
    assert.equal(feedback("saving", 0).label, "Finishing chat");
    assert.equal(
      feedback("saving", 0, { purpose: "onboarding" }).label,
      "Saving your answers",
    );
    assert.equal(feedback("saving", 18_000).action, "leave");
    assert.equal(feedback("reconnecting", 18_000).action, "retry");
    assert.equal(
      feedback("reconnecting", 18_000, { voiceRetryUsed: true }).action,
      "lesson",
    );
    assert.equal(feedback("reconnecting", 0).label, "Trying again");
    assert.equal(feedback("reconnecting", 8_000).label, "Trying again");
    assert.doesNotMatch(feedback("reconnecting", 0).text, /safe|saved/i);
    assert.equal(
      feedback("connecting", 12_000, {
        purpose: "onboarding",
        voiceRetryUsed: true,
      }).action,
      "retry",
    );
  });
});
