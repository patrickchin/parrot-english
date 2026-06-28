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

  it("keeps the approved scene sequence", () => {
    assert.deepEqual(
      AI_LESSON.scenes.map((scene) => scene.id),
      ["greeting", "cant-reach", "help-please", "here-you-are", "thank-you"]
    );
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

  it("provides the scene fields required by downstream consumers", () => {
    const characterIds = new Set(
      AI_LESSON.characters.map((character) => character.id)
    );

    for (const scene of AI_LESSON.scenes) {
      assert.ok(
        AI_LESSON.availableAssets.backgrounds.includes(scene.backgroundPreference),
        `${scene.id} uses a known background`
      );
      assert.ok(["reply", "mimic"].includes(scene.mode), `${scene.id} mode`);
      assert.ok(
        typeof scene.goal === "string" && scene.goal.trim().length > 0,
        `${scene.id} goal`
      );
      assert.ok(
        typeof scene.tutorCueZh === "string" &&
          scene.tutorCueZh.trim().length > 0,
        `${scene.id} tutorCueZh`
      );
      assert.ok(
        characterIds.has(scene.sceneLine.speaker),
        `${scene.id} sceneLine speaker`
      );
      assert.ok(
        typeof scene.sceneLine.text === "string" &&
          scene.sceneLine.text.trim().length > 0,
        `${scene.id} sceneLine text`
      );
      assert.equal(scene.sceneLine.lang, "en-US", `${scene.id} sceneLine lang`);
      assert.ok(
        characterIds.has(scene.modelLine.speaker),
        `${scene.id} modelLine speaker`
      );
      assert.ok(
        typeof scene.modelLine.text === "string" &&
          scene.modelLine.text.trim().length > 0,
        `${scene.id} modelLine text`
      );
      assert.equal(scene.modelLine.lang, "en-US", `${scene.id} modelLine lang`);
      assert.ok(
        typeof scene.childTarget === "string" &&
          scene.childTarget.trim().length > 0,
        `${scene.id} childTarget`
      );
    }
  });
});
