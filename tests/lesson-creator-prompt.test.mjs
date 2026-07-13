import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const prompt = readFileSync(
  new URL("../docs/lesson-creator-system-prompt.md", import.meta.url),
  "utf8"
);
const allowedRootKeys = [
  "childName",
  "detailedSummary",
  "goalPhrases",
  "location",
  "scenes",
  "summary",
  "title",
];
const allowedSceneKeys = [
  "background",
  "characters",
  "settingDescription",
  "steps",
  "title",
];
const allowedStepKeys = ["dialogue", "emotes", "speaker"];
const allowedCharacters = new Set(["peppa", "dolly"]);
const allowedSpeakers = new Set([...allowedCharacters, "user", "narrator"]);
const allowedEmotes = new Set([
  "idle",
  "talking",
  "listening",
  "happy",
  "sad",
  "surprised",
]);
const forbiddenSummaryLanguage =
  /\b(?:teach|teaching|practise|practice|learn|learner|english|target phrase|user)\b/i;
const chineseText = /[\u3400-\u9fff]/u;

function sortedKeys(value) {
  return Object.keys(value).sort();
}

function sentenceCount(value) {
  return value.match(/[.!?](?=\s|$)/g)?.length ?? 0;
}

function getJsonExamples() {
  return [...prompt.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) =>
    JSON.parse(match[1])
  );
}

describe("lesson creator system prompt", () => {
  it("requires strict English-only JSON in the scene-script contract", () => {
    assert.match(prompt, /valid JSON only/i);
    assert.match(prompt, /no Markdown fences/i);
    assert.match(prompt, /English-only/i);
    assert.match(prompt, /exactly two goal phrases/i);
    assert.match(prompt, /between five and eight scenes/i);
    assert.match(prompt, /one speaker and one dialogue line per step/i);
    assert.match(prompt, /press and hold/i);
    assert.match(prompt, /detailedSummary/);
  });

  it("contains two valid examples using only the supported contract", () => {
    const lessons = getJsonExamples();
    assert.equal(lessons.length, 2);

    for (const lesson of lessons) {
      assert.deepEqual(sortedKeys(lesson), allowedRootKeys);
      assert.equal(lesson.goalPhrases.length, 2);
      assert.equal(sentenceCount(lesson.summary), 1);
      assert.equal(sentenceCount(lesson.detailedSummary), 3);
      assert.doesNotMatch(lesson.summary, forbiddenSummaryLanguage);
      assert.doesNotMatch(lesson.detailedSummary, forbiddenSummaryLanguage);
      assert.ok(lesson.scenes.length >= 5 && lesson.scenes.length <= 8);
      assert.deepEqual(sortedKeys(lesson.location), ["description", "name"]);

      const allSteps = lesson.scenes.flatMap((scene) => {
        assert.deepEqual(sortedKeys(scene), allowedSceneKeys);
        assert.ok(scene.background.length > 0);
        assert.ok(scene.characters.length > 0);
        assert.ok(scene.characters.every((id) => allowedCharacters.has(id)));

        for (const step of scene.steps) {
          assert.deepEqual(sortedKeys(step), allowedStepKeys);
          assert.ok(allowedSpeakers.has(step.speaker));
          assert.equal(step.dialogue.includes("\n"), false);
          assert.doesNotMatch(step.dialogue, chineseText);
          assert.deepEqual(sortedKeys(step.emotes), [...scene.characters].sort());
          assert.ok(
            Object.values(step.emotes).every((emote) => allowedEmotes.has(emote))
          );
        }

        return scene.steps;
      });

      assert.ok(allSteps.some((step) => step.speaker === "narrator"));
      assert.ok(allSteps.some((step) => step.speaker === "user"));
      const finalStep = allSteps.at(-1);
      assert.equal(finalStep.speaker, "narrator");
      assert.match(finalStep.dialogue, new RegExp(lesson.childName, "i"));
    }
  });
});
