import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyConversationObservation,
  createLearnerProfileConversationState,
  isConversationTerminal,
  nextConversationPrompt,
} from "../lib/conversation-scenario.js";

function answered(summary, learnedName, learnedAge, profileAge = 8) {
  return {
    outcome: "answered",
    summary,
    learnedName,
    learnedAge,
    profileName: learnedName ? "Mia" : null,
    profileAge: learnedAge ? profileAge : null,
  };
}

describe("bounded onboarding conversation", () => {
  it("starts redo conversations from the confirmed saved profile", () => {
    const state = createLearnerProfileConversationState({
      profileAge: 30,
      profileName: "Mia",
      profileSummary: "Mia is thirty and loves fast red cars.",
    });

    assert.deepEqual(state, {
      phase: "optional",
      activeObjective: "interest",
      rephraseCount: { name: 0, age: 0, interest: 0 },
      optionalExchangeCount: 0,
      profileSummary: "Mia is thirty and loves fast red cars.",
      profileName: "Mia",
      profileAge: 30,
      learnedName: true,
      learnedAge: true,
      finishReason: null,
    });
  });

  it("tracks required details while storing only one cumulative prose summary", () => {
    const initial = createLearnerProfileConversationState();
    assert.equal(initial.activeObjective, "name");
    assert.equal(initial.profileSummary, "");
    assert.equal(initial.learnedName, false);
    assert.equal(initial.learnedAge, false);
    assert.equal("facts" in initial, false);

    const withAge = applyConversationObservation(
      initial,
      answered("The learner is eight years old.", false, true),
    );
    assert.equal(withAge.activeObjective, "name");

    const withBoth = applyConversationObservation(
      withAge,
      answered("Mia is eight years old.", true, true),
    );
    assert.equal(withBoth.phase, "optional");
    assert.equal(withBoth.activeObjective, "interest");
    assert.equal(withBoth.profileSummary, "Mia is eight years old.");
  });

  it("accepts adult ages without an upper age cap", () => {
    const state = applyConversationObservation(
      createLearnerProfileConversationState(),
      answered("Mia is thirty years old.", true, true, 30),
    );

    assert.equal(state.profileAge, 30);
    assert.equal(state.learnedAge, true);
  });

  it("allows only one rephrase and keeps the rescue turn English-only", () => {
    const initial = createLearnerProfileConversationState();
    const rephrased = applyConversationObservation(initial, {
      outcome: "unclear",
    });

    assert.equal(rephrased.rephraseCount.name, 1);
    assert.deepEqual(nextConversationPrompt(rephrased), {
      objective: "name",
      mode: "rephrase",
      mustFinishAfterTurn: false,
    });

    const advanced = applyConversationObservation(rephrased, {
      outcome: "unclear",
    });
    assert.equal(advanced.activeObjective, "age");
  });

  it("follows a different relevant interest by updating the prose", () => {
    const optional = applyConversationObservation(
      createLearnerProfileConversationState(),
      answered("Mia is eight years old.", true, true),
    );
    const followedInterest = applyConversationObservation(
      optional,
      answered(
        "Mia is eight years old and gets excited about red racing cars.",
        true,
        true,
      ),
    );

    assert.equal(
      followedInterest.profileSummary,
      "Mia is eight years old and gets excited about red racing cars.",
    );
    assert.equal(followedInterest.optionalExchangeCount, 1);
  });

  it("accepts uncertainty without spending the rephrase", () => {
    const advanced = applyConversationObservation(
      createLearnerProfileConversationState(),
      { outcome: "unknown" },
    );

    assert.equal(advanced.activeObjective, "age");
    assert.equal(advanced.rephraseCount.name, 0);
  });

  it("closes after at most three optional prose updates", () => {
    let state = applyConversationObservation(
      createLearnerProfileConversationState(),
      answered("Mia is eight years old.", true, true),
    );

    for (const summary of [
      "Mia is eight years old and likes dinosaurs.",
      "Mia is eight years old, likes dinosaurs, and enjoys space stories.",
      "Mia is eight years old, likes dinosaurs and space stories, and loves drawing.",
    ]) {
      state = applyConversationObservation(state, answered(summary, true, true));
    }

    assert.equal(state.optionalExchangeCount, 3);
    assert.equal(state.phase, "closing");
    assert.equal(isConversationTerminal(state), true);
  });

  it("ends warmly when the child asks to stop", () => {
    const stopped = applyConversationObservation(
      createLearnerProfileConversationState(),
      { outcome: "stop" },
    );

    assert.equal(stopped.phase, "closing");
    assert.equal(stopped.finishReason, "child_stopped");
    assert.throws(
      () =>
        applyConversationObservation(
          stopped,
          answered("This is too late.", true, true),
        ),
      /already terminal/,
    );
  });

  it("requires a bounded paragraph for answered turns", () => {
    const state = createLearnerProfileConversationState();
    assert.throws(
      () => applyConversationObservation(state, answered(" ", true, false)),
      /summary must be a non-empty paragraph/i,
    );
    assert.throws(
      () =>
        applyConversationObservation(
          state,
          answered("x".repeat(2_001), true, false),
        ),
      /summary is too long/i,
    );
  });
});
