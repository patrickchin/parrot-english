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
    assert.match(feedback("connecting", 0).text, /waking up/i);
    assert.equal(
      feedback("connecting", 4_000).label,
      "Almost ready",
    );
    assert.equal(
      feedback("connecting", 12_000).label,
      "Taking too long",
    );
    assert.equal(feedback("connecting", 12_000).action, "retry");
  });

  it("acknowledges a learner immediately before moving to calm wait copy", () => {
    assert.equal(feedback("thinking", 0).label, "Peppa heard you");
    assert.equal(feedback("thinking", 1_800).label, "Peppa is thinking");
    assert.equal(feedback("thinking", 7_000).label, "Still thinking");
    assert.equal(feedback("thinking", 15_000).action, "retry");
  });

  it("uses the last measured reply only to delay a premature long-wait warning", () => {
    assert.deepEqual(conversationFeedbackMilestones("thinking", 8_000), [
      1_800,
      12_000,
      20_000,
    ]);
    assert.equal(
      feedback("thinking", 8_000, { responseLatencyMs: 8_000 }).label,
      "Peppa is thinking",
    );
    assert.equal(
      feedback("thinking", 12_000, { responseLatencyMs: 8_000 }).label,
      "Still thinking",
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
  });
});
