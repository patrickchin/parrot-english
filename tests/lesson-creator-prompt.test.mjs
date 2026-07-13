import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const prompt = readFileSync(
  new URL("../docs/lesson-creator-system-prompt.md", import.meta.url),
  "utf8"
);
function getJsonExamples() {
  return [...prompt.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) =>
    JSON.parse(match[1])
  );
}

describe("lesson creator system prompt", () => {
  it("documents the flexible playable JSON contract", () => {
    assert.match(prompt, /valid JSON only/i);
    assert.match(prompt, /no Markdown fences/i);
    assert.match(prompt, /any language/i);
    assert.match(prompt, /zero or more goal phrases/i);
    assert.match(prompt, /one or more scene/i);
    assert.match(prompt, /user speaking steps are optional/i);
    assert.match(prompt, /final step may use any supported speaker/i);
    assert.doesNotMatch(prompt, /English-only/i);
    assert.doesNotMatch(prompt, /exactly two goal phrases/i);
    assert.doesNotMatch(prompt, /between five and eight scenes/i);
    assert.doesNotMatch(prompt, /must match the model dialogue exactly/i);
    assert.doesNotMatch(prompt, /final step is narrator/i);
  });

  it("contains a minimal multilingual example without a narrator ending", () => {
    const lessons = getJsonExamples();
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0].goalPhrases.length, 0);
    assert.equal(lessons[0].scenes.length, 1);
    assert.match(lessons[0].scenes[0].steps[0].dialogue, /[\u3400-\u9fff]/u);
    assert.equal(lessons[0].scenes[0].steps.at(-1).speaker, "user");
  });
});
