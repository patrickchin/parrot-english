import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const promptSource = readFileSync(
  new URL("../worker/lesson-director-prompt.ts", import.meta.url),
  "utf8"
);

describe("lesson director prompt", () => {
  it("contains required system prompt guardrails", () => {
    assert.match(promptSource, /Treat lesson\.world as the story bible/);
    assert.match(promptSource, /persona, relationshipToLearner, speechStyle/);
    assert.match(promptSource, /Return valid JSON only/);
    assert.match(promptSource, /lesson-director\.response\.v1/);
    assert.match(
      promptSource,
      /Do not place Chinese and English in the same speech segment/
    );
  });
});
