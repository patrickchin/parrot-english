import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AI_LESSON } from "../lib/ai-lesson-data.js";
import { validateLessonDefinition } from "../lib/lesson-director-schema.js";

describe("AI lesson data", () => {
  it("is a valid director lesson definition", () => {
    assert.deepEqual(validateLessonDefinition(AI_LESSON), {
      ok: true,
      errors: [],
    });
  });

  it("keeps the greeting reply target different from Peppa's addressed line", () => {
    const greeting = AI_LESSON.scenes.find((scene) => scene.id === "greeting");

    assert.equal(greeting.sceneLine.text, "Hello, Bella!");
    assert.equal(greeting.childTarget, "Hello, Peppa!");
  });

  it("uses only existing scene assets and poses", () => {
    assert.deepEqual(AI_LESSON.availableAssets.backgrounds, [
      "meadowDay",
      "meadowEvening",
      "reward",
    ]);
    assert.deepEqual(AI_LESSON.availableAssets.poses.peppa, [
      "wave",
      "talk",
      "listen",
      "clap",
    ]);
    assert.deepEqual(AI_LESSON.availableAssets.poses.polly, [
      "idle",
      "talk",
      "laugh",
      "flap",
    ]);
  });
});
