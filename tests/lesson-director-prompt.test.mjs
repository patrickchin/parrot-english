import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  LESSON_DIRECTOR_SYSTEM_PROMPT,
  createLessonDirectorUserPrompt,
} from "../worker/lesson-director-prompt.ts";

const promptSource = readFileSync(
  new URL("../worker/lesson-director-prompt.ts", import.meta.url),
  "utf8"
);

describe("lesson director prompt", () => {
  const serializationError =
    /Lesson director request body must be JSON-serializable\./;

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

  it("exports the system prompt guardrails at runtime", () => {
    assert.match(
      LESSON_DIRECTOR_SYSTEM_PROMPT,
      /Treat lesson\.world as the story bible/
    );
  });

  it("creates the expected user prompt layout for serializable requests", () => {
    const requestBody = {
      lesson: { lessonId: "l1" },
      runtimeState: { currentSceneId: "greeting" },
    };
    const serializedRequest = JSON.stringify(requestBody);
    const prompt = createLessonDirectorUserPrompt(requestBody);

    assert.match(
      prompt,
      /Use the following lesson JSON, runtime state, and response schema\./
    );
    assert.match(prompt, /REQUEST_JSON:/);
    assert.equal(prompt.includes(serializedRequest), true);
    assert.equal(
      prompt.endsWith("Return the next lesson-director response packet."),
      true
    );
  });

  it("rejects request bodies that cannot be serialized to JSON", () => {
    const circularRequest = {};
    circularRequest.self = circularRequest;

    assert.throws(
      () => createLessonDirectorUserPrompt(undefined),
      serializationError
    );
    assert.throws(
      () => createLessonDirectorUserPrompt(circularRequest),
      serializationError
    );
  });
});
