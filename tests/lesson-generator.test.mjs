import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateLessonScript } from "../worker/lesson-generator.ts";
import { LESSON_GENERATOR_SYSTEM_PROMPT } from "../worker/prompts/lesson-generator.ts";
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

    assert.equal(generated.lesson.title, "Garden Help");
    assert.deepEqual(generated.warnings, []);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
    assert.match(calls[0].init.headers.Authorization, /^Bearer test-key$/);
    assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
    assert.equal(calls[0].body.reasoning_effort, "low");
    assert.equal(calls[0].body.max_completion_tokens, 4500);
    assert.equal("json_schema" in calls[0].body.response_format, false);
    assert.equal(
      calls[0].body.messages[0].content,
      LESSON_GENERATOR_SYSTEM_PROMPT,
    );
    assert.doesNotMatch(
      calls[0].body.messages[0].content,
      /exactly|must.*repeat|English-only|narrator praise|two and seven words/i,
    );
    assert.match(calls[0].body.messages[1].content, /ordering ice cream/);
    assert.match(calls[0].body.messages[1].content, /Mia/);
    assert.match(calls[0].body.messages[1].content, /episode-garden/);
  });

  it("normalizes an incomplete Groq draft and returns its warnings", async () => {
    const calls = [];
    const generated = await generateLessonScript({
      childName: "Mia",
      env: { GROQ_API_KEY: "test-key" },
      topic: "ordering ice cream",
      async fetch(url, init) {
        calls.push({ url, body: JSON.parse(init.body) });
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  scenes: [
                    {
                      background: "reward",
                      steps: [
                        { speaker: "user", dialogue: "Surprise!" },
                      ],
                    },
                  ],
                }),
              },
            },
          ],
        });
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(generated.lesson.title, "Untitled lesson");
    assert.equal(generated.lesson.childName, "Mia");
    assert.equal(generated.lesson.scenes[0].background, "reward");
    assert.equal(generated.lesson.scenes[0].title, "Scene 1");
    assert.equal(generated.lesson.scenes[0].steps[0].speaker, "user");
    assert.ok(generated.warnings.some((warning) => /title/i.test(warning)));
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
