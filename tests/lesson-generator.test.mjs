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
    assert.equal(schema.properties.scenes.minItems, 5);
    assert.equal(schema.properties.scenes.maxItems, 5);
    assert.equal(schema.properties.scenes.items.properties.steps.minItems, 2);
    assert.equal(schema.properties.scenes.items.properties.steps.maxItems, 3);
    assert.match(calls[0].body.messages[0].content, /exactly five scenes/i);
    assert.match(
      calls[0].body.messages[0].content,
      /two steps.*model line.*user repetition.*final scene.*third narrator praise/i,
    );
    assert.match(calls[0].body.messages[1].content, /ordering ice cream/);
    assert.match(calls[0].body.messages[1].content, /Mia/);
    assert.match(calls[0].body.messages[1].content, /episode-garden/);
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
