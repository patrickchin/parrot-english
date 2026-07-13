import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { LESSON_GENERATOR_SYSTEM_PROMPT } from "../worker/prompts/lesson-generator.ts";

const prompt = LESSON_GENERATOR_SYSTEM_PROMPT;
function getJsonExamples() {
  return [...prompt.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) =>
    JSON.parse(match[1])
  );
}

describe("lesson creator system prompt", () => {
  it("keeps the runtime prompt module as the only prompt source", () => {
    const generatorSource = readFileSync(
      new URL("../worker/lesson-generator.ts", import.meta.url),
      "utf8",
    );
    const promptSource = readFileSync(
      new URL("../worker/prompts/lesson-generator.ts", import.meta.url),
      "utf8",
    );

    assert.match(
      generatorSource,
      /import \{ LESSON_GENERATOR_SYSTEM_PROMPT \} from "\.\/prompts\/lesson-generator\.ts"/,
    );
    assert.match(
      generatorSource,
      /content: LESSON_GENERATOR_SYSTEM_PROMPT/,
    );
    assert.doesNotMatch(generatorSource, /const SYSTEM_PROMPT\s*=/);
    assert.match(promptSource, /^\/\*\*[\s\S]*When this is used:/);
    assert.equal(
      existsSync(
        new URL("../docs/lesson-creator-system-prompt.md", import.meta.url),
      ),
      false,
    );
    assert.equal(
      existsSync(
        new URL(
          "../docs/lesson-creator-system-prompt.backup-2026-07-05.md",
          import.meta.url,
        ),
      ),
      false,
    );
  });

  it("documents the flexible playable JSON contract", () => {
    assert.match(prompt, /valid JSON only/i);
    assert.match(prompt, /no Markdown fences/i);
    assert.match(prompt, /English only/i);
    assert.match(prompt, /parent.*topic.*any language/i);
    assert.match(prompt, /zero or more goal phrases/i);
    assert.match(prompt, /one or more scene/i);
    assert.match(prompt, /user speaking steps are optional/i);
    assert.match(prompt, /final step may use any supported speaker/i);
    assert.match(prompt, /omit check.*without evaluating/i);
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
    assert.equal(lessons[0].scenes[0].steps.at(-1).speaker, "user");
    assert.ok(lessons[0].scenes[0].steps.at(-1).check);
  });
});
