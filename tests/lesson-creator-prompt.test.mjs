import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LESSON_GENERATOR_SYSTEM_PROMPT } from "../worker/prompts/lesson-generator.ts";

const prompt = LESSON_GENERATOR_SYSTEM_PROMPT;
function getJsonExamples() {
  return [...prompt.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) =>
    JSON.parse(match[1])
  );
}

describe("lesson creator system prompt", () => {
  it("documents the flexible playable JSON contract", () => {
    assert.match(prompt, /valid JSON only/i);
    assert.match(prompt, /no Markdown fences/i);
    assert.match(prompt, /English only/i);
    assert.match(prompt, /parent's\s+topic may use any language/i);
    assert.match(prompt, /zero or more goal phrases/i);
    assert.match(prompt, /one or more scene/i);
    assert.match(prompt, /user speaking steps are optional/i);
    assert.match(prompt, /final step may use any supported speaker/i);
    assert.match(prompt, /omit check for every user step/i);
    assert.match(prompt, /do not use instructional narrator prompts or attempt feedback/i);
    assert.match(prompt, /omit emotes.*keep/i);
    assert.doesNotMatch(prompt, /lesson may use any language/i);
    assert.doesNotMatch(prompt, /exactly two goal phrases/i);
    assert.doesNotMatch(prompt, /between five and eight scenes/i);
    assert.doesNotMatch(prompt, /must match the model dialogue exactly/i);
    assert.doesNotMatch(prompt, /final step is narrator/i);
  });

  it("contains a readable English example without a narrator ending", () => {
    const lessons = getJsonExamples();
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0].goalPhrases.length, 0);
    assert.equal(lessons[0].scenes.length, 1);
    assert.doesNotMatch(JSON.stringify(lessons[0]), /[\u3400-\u9fff]/u);
    assert.match(lessons[0].scenes[0].steps[0].dialogue, /color/i);
    const steps = lessons[0].scenes[0].steps;
    assert.equal(steps.at(-1).speaker, "user");
    assert.equal(steps.at(-1).check, undefined);
    assert.equal(steps.at(-2).speaker, "dolly");
    assert.equal(steps.at(-2).dialogue, steps.at(-1).dialogue);
  });
});
