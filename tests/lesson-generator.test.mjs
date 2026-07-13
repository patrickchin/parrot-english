import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateLessonScript } from "../worker/lesson-generator.ts";
import { createLessonScript } from "./fixtures/lesson-script.mjs";

describe("lesson script generation", () => {
  it("sends bounded parent input and validates structured Groq output", async () => {
    const calls = [];
    const lesson = createLessonScript();
    const generated = await generateLessonScript({
      childName: "Mia",
      env: { GROQ_API_KEY: "test-key" },
      topic: "ordering ice cream",
      async fetch(url, init) {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return Response.json({
          choices: [{ message: { content: JSON.stringify(lesson) } }],
        });
      },
    });

    assert.equal(generated.title, "Garden Help");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
    assert.match(calls[0].init.headers.Authorization, /^Bearer test-key$/);
    assert.equal(calls[0].body.response_format.type, "json_schema");
    assert.equal(calls[0].body.reasoning_effort, "low");
    assert.equal(calls[0].body.max_completion_tokens, 4500);
    const schema = calls[0].body.response_format.json_schema.schema;
    assert.equal(schema.properties.scenes.minItems, 1);
    assert.equal("maxItems" in schema.properties.scenes, false);
    assert.equal(schema.properties.scenes.items.properties.steps.minItems, 1);
    assert.equal(
      "maxItems" in schema.properties.scenes.items.properties.steps,
      false,
    );
    assert.equal("minItems" in schema.properties.goalPhrases, false);
    assert.equal("maxItems" in schema.properties.goalPhrases, false);
    assert.doesNotMatch(
      calls[0].body.messages[0].content,
      /exactly|must.*repeat|English-only|narrator praise|two and seven words/i,
    );
    assert.match(calls[0].body.messages[1].content, /ordering ice cream/);
    assert.match(calls[0].body.messages[1].content, /Mia/);
    assert.match(calls[0].body.messages[1].content, /episode-garden/);
  });

  it("retries one Groq schema-generation failure with stricter shape guidance", async () => {
    const calls = [];
    const lesson = createLessonScript();
    const generated = await generateLessonScript({
      childName: "Mia",
      env: { GROQ_API_KEY: "test-key" },
      topic: "ordering ice cream",
      async fetch(url, init) {
        calls.push({ url, body: JSON.parse(init.body) });
        if (calls.length === 1) {
          return Response.json(
            {
              error: {
                code: "json_validate_failed",
                message: "Generated JSON does not match the expected schema.",
              },
            },
            { status: 400 },
          );
        }
        return Response.json({
          choices: [{ message: { content: JSON.stringify(lesson) } }],
        });
      },
    });

    assert.equal(generated.title, "Garden Help");
    assert.equal(calls.length, 2);
    assert.match(
      calls[1].body.messages[0].content,
      /include every required field exactly once/i,
    );
  });

  it("stops after the bounded schema-generation retry", async () => {
    let callCount = 0;
    await assert.rejects(
      generateLessonScript({
        childName: "Mia",
        env: { GROQ_API_KEY: "test-key" },
        topic: "ordering ice cream",
        async fetch() {
          callCount += 1;
          return Response.json(
            { error: { code: "json_validate_failed" } },
            { status: 400 },
          );
        },
      }),
      /lesson generation failed/i,
    );
    assert.equal(callCount, 2);
  });

  it("does not retry unrelated upstream failures", async () => {
    let callCount = 0;
    await assert.rejects(
      generateLessonScript({
        childName: "Mia",
        env: { GROQ_API_KEY: "test-key" },
        topic: "ordering ice cream",
        async fetch() {
          callCount += 1;
          return Response.json(
            { error: { code: "service_unavailable" } },
            { status: 503 },
          );
        },
      }),
      /lesson generation failed/i,
    );
    assert.equal(callCount, 1);
  });

  it("rejects malformed provider output instead of returning an unusable script", async () => {
    await assert.rejects(
      generateLessonScript({
        childName: "Mia",
        env: { GROQ_API_KEY: "test-key" },
        topic: "at the library",
        async fetch() {
          return Response.json({
            choices: [{ message: { content: '{"title":"Incomplete"}' } }],
          });
        },
      }),
      /generated lesson is invalid/i,
    );
  });
});
