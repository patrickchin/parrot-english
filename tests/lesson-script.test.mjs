import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LESSON_STEPS } from "../lib/lesson-data.js";

describe("poster-style lesson script", () => {
  it("uses a Peppa-name reply for the greeting instead of repeating Bella's name", () => {
    const [greeting] = LESSON_STEPS;

    assert.equal(greeting.exampleLine, "Hello, Bella!");
    assert.equal(greeting.parrotModelLine, "Hello, Peppa!");
    assert.equal(greeting.childTarget, "Hello, Peppa!");
  });

  it("uses mimic practice for every non-greeting page", () => {
    for (const step of LESSON_STEPS.slice(1)) {
      assert.equal(step.parrotModelLine, step.exampleLine, step.id);
      assert.equal(step.childTarget, step.exampleLine, step.id);
    }
  });
});
