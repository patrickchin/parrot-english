import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyConversationObservation,
  createOnboardingConversationState,
  isConversationTerminal,
  nextConversationPrompt,
  validateCandidateFacts,
} from "../lib/conversation-scenario.js";

describe("bounded onboarding conversation", () => {
  it("collects volunteered core facts in either order", () => {
    const initial = createOnboardingConversationState();
    assert.equal(initial.phase, "core");
    assert.equal(initial.activeObjective, "name");

    const withAge = applyConversationObservation(initial, {
      outcome: "answered",
      facts: [{ key: "age", value: 8 }],
    });
    assert.equal(withAge.activeObjective, "name");

    const withBoth = applyConversationObservation(withAge, {
      outcome: "answered",
      facts: [{ key: "name", value: "Mia" }],
    });
    assert.equal(withBoth.phase, "optional");
    assert.equal(withBoth.activeObjective, "interest");
    assert.deepEqual(withBoth.facts, [
      { key: "age", value: 8 },
      { key: "name", value: "Mia" },
    ]);
  });

  it("allows only one rephrase and marks it as the Chinese rescue turn", () => {
    const initial = createOnboardingConversationState();
    const rephrased = applyConversationObservation(initial, {
      outcome: "unclear",
      facts: [],
    });

    assert.equal(rephrased.rephraseCount.name, 1);
    assert.deepEqual(nextConversationPrompt(rephrased), {
      objective: "name",
      mode: "rephrase",
      includeChineseHint: true,
      mustFinishAfterTurn: false,
    });

    const advanced = applyConversationObservation(rephrased, {
      outcome: "unclear",
      facts: [],
    });
    assert.equal(advanced.activeObjective, "age");
    assert.equal(advanced.rephraseCount.name, 1);
    assert.equal(nextConversationPrompt(advanced).mode, "initial");
  });

  it("accepts uncertainty without spending the rephrase", () => {
    const advanced = applyConversationObservation(
      createOnboardingConversationState(),
      { outcome: "unknown", facts: [] },
    );

    assert.equal(advanced.activeObjective, "age");
    assert.equal(advanced.rephraseCount.name, 0);
  });

  it("closes after at most three optional exchanges", () => {
    let state = applyConversationObservation(
      createOnboardingConversationState(),
      {
        outcome: "answered",
        facts: [
          { key: "name", value: "Mia" },
          { key: "age", value: 8 },
        ],
      },
    );

    for (const [topic, value] of [
      ["animals", "dinosaurs"],
      ["stories", "space adventures"],
      ["activities", "drawing"],
    ]) {
      state = applyConversationObservation(state, {
        outcome: "answered",
        facts: [{ key: "interest", topic, value }],
      });
    }

    assert.equal(state.optionalExchangeCount, 3);
    assert.equal(state.phase, "closing");
    assert.equal(state.finishReason, "max_optional_exchanges");
    assert.equal(isConversationTerminal(state), true);
    assert.deepEqual(nextConversationPrompt(state), {
      objective: "closing",
      mode: "close",
      includeChineseHint: false,
      mustFinishAfterTurn: true,
    });
  });

  it("ends warmly when the child asks to stop", () => {
    const stopped = applyConversationObservation(
      createOnboardingConversationState(),
      { outcome: "stop", facts: [] },
    );

    assert.equal(stopped.phase, "closing");
    assert.equal(stopped.finishReason, "child_stopped");
    assert.throws(
      () =>
        applyConversationObservation(stopped, {
          outcome: "answered",
          facts: [{ key: "name", value: "Late" }],
        }),
      /already terminal/,
    );
  });

  it("rejects unsupported or malformed candidate facts", () => {
    const state = createOnboardingConversationState();

    assert.throws(
      () => validateCandidateFacts(state, [{ key: "email", value: "x@y.z" }]),
      /Unsupported conversation fact/,
    );
    assert.throws(
      () => validateCandidateFacts(state, [{ key: "age", value: 22 }]),
      /Age must be an integer from 3 to 17/,
    );
    assert.throws(
      () => validateCandidateFacts(state, [{ key: "interest", value: "dogs" }]),
      /Interest topic is required/,
    );
  });
});
