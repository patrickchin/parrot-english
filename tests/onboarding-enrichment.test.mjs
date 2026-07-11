import assert from "node:assert/strict";
import { describe, it } from "node:test";
import questionnaireV2 from "../content/onboarding/questionnaire-v2.json" with { type: "json" };
import { validateOnboardingQuestionnaire } from "../lib/onboarding-questionnaire.js";
import { enrichOnboardingAnswer } from "../worker/onboarding-enrichment.ts";

const definition = validateOnboardingQuestionnaire(questionnaireV2);
const animalsQuestion = definition.questions.find(
  ({ answerKey }) => answerKey === "favoriteAnimals",
);
const nameQuestion = definition.questions.find(({ answerKey }) => answerKey === "name");
const ageQuestion = definition.questions.find(({ answerKey }) => answerKey === "age");

function providerResponse(value) {
  return Response.json({
    choices: [{ message: { content: JSON.stringify(value) } }],
  });
}

describe("onboarding answer enrichment", () => {
  it("requests strict child-safe summary and acknowledgment JSON", async () => {
    let upstreamRequest;
    const result = await enrichOnboardingAnswer({
      env: { GROQ_API_KEY: "test-key" },
      fetch: async (url, init) => {
        upstreamRequest = {
          url,
          headers: init?.headers,
          body: JSON.parse(String(init?.body)),
        };
        return providerResponse({
          summary: "Likes dinosaurs.",
          acknowledgment: "Dinosaurs are very stompy!",
          canonicalName: null,
          canonicalAge: null,
        });
      },
      question: animalsQuestion,
      rawAnswer: "I like dinosaurs",
    });

    assert.equal(
      upstreamRequest.url,
      "https://api.groq.com/openai/v1/chat/completions",
    );
    assert.deepEqual(upstreamRequest.headers, {
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });
    assert.equal(upstreamRequest.body.model, "openai/gpt-oss-20b");
    assert.equal(
      upstreamRequest.body.response_format.json_schema.strict,
      true,
    );
    assert.deepEqual(
      upstreamRequest.body.response_format.json_schema.schema.required,
      ["summary", "acknowledgment", "canonicalName", "canonicalAge"],
    );
    assert.equal(
      upstreamRequest.body.response_format.json_schema.schema.additionalProperties,
      false,
    );
    assert.match(
      upstreamRequest.body.messages[1].content,
      /What animals do you like\?/,
    );
    assert.match(upstreamRequest.body.messages[1].content, /I like dinosaurs/);
    assert.doesNotMatch(
      JSON.stringify(upstreamRequest.body),
      /user-id|email|session|Mia|six years/i,
    );
    assert.deepEqual(result, {
      summary: "Likes dinosaurs.",
      acknowledgment: "Dinosaurs are very stompy!",
      canonicalName: null,
      canonicalAge: null,
      enrichmentStatus: "generated",
    });
  });

  it("accepts only the canonical field targeted by the question", async () => {
    const generatedName = await enrichOnboardingAnswer({
      env: { GROQ_API_KEY: "test-key" },
      fetch: async () =>
        providerResponse({
          summary: "Is called Mia.",
          acknowledgment: "Mia is a lovely name!",
          canonicalName: "Mia",
          canonicalAge: null,
        }),
      question: nameQuestion,
      rawAnswer: "My name is Mia",
    });
    assert.equal(generatedName.canonicalName, "Mia");

    const generatedAge = await enrichOnboardingAnswer({
      env: { GROQ_API_KEY: "test-key" },
      fetch: async () =>
        providerResponse({
          summary: "Is thirty years old.",
          acknowledgment: "Thirty is a brilliant age!",
          canonicalName: null,
          canonicalAge: 30,
        }),
      question: ageQuestion,
      rawAnswer: "I'm 30",
    });
    assert.equal(generatedAge.canonicalAge, 30);
  });

  it("falls back deterministically for missing keys and invalid provider output", async () => {
    let fetchCalls = 0;
    const missingKey = await enrichOnboardingAnswer({
      env: {},
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("unexpected");
      },
      question: animalsQuestion,
      rawAnswer: `  ${"Dinosaurs are great. ".repeat(20)}  `,
    });
    assert.equal(fetchCalls, 0);
    assert.equal(missingKey.enrichmentStatus, "fallback");
    assert.ok(missingKey.summary.length <= 240);
    assert.equal(
      missingKey.acknowledgment,
      animalsQuestion.fallbackAcknowledgment,
    );

    const invalid = await enrichOnboardingAnswer({
      env: { GROQ_API_KEY: "test-key" },
      fetch: async () =>
        providerResponse({
          summary: "Likes dinosaurs.",
          acknowledgment: "Which dinosaur is your favourite?",
          canonicalName: "Invented Name",
          canonicalAge: 99,
          extra: "not allowed",
        }),
      question: animalsQuestion,
      rawAnswer: "I like dinosaurs",
    });
    assert.deepEqual(invalid, {
      summary: "I like dinosaurs",
      acknowledgment: animalsQuestion.fallbackAcknowledgment,
      canonicalName: null,
      canonicalAge: null,
      enrichmentStatus: "fallback",
    });
  });

  it("extracts safe canonical fallbacks and returns field errors when impossible", async () => {
    const nameFallback = await enrichOnboardingAnswer({
      env: {},
      question: nameQuestion,
      rawAnswer: "小明",
    });
    assert.equal(nameFallback.canonicalName, "小明");

    const ageFallback = await enrichOnboardingAnswer({
      env: {},
      question: ageQuestion,
      rawAnswer: "I am 30 years old",
    });
    assert.equal(ageFallback.canonicalAge, 30);

    assert.deepEqual(
      await enrichOnboardingAnswer({
        env: {},
        question: ageQuestion,
        rawAnswer: "I am very little",
      }),
      { fieldError: "Please tell me your age using a whole number." },
    );
  });

  it("turns refusals, upstream failures, and timeouts into safe fallback", async () => {
    for (const providerFetch of [
      async () => new Response("secret trace", { status: 503 }),
      async () => Response.json({ choices: [{ message: { refusal: "no" } }] }),
      async () => new Promise(() => {}),
    ]) {
      const result = await enrichOnboardingAnswer({
        env: {
          GROQ_API_KEY: "test-key",
          GROQ_REQUEST_TIMEOUT_MS: "10",
        },
        fetch: providerFetch,
        question: animalsQuestion,
        rawAnswer: "I like cats",
      });
      assert.equal(result.enrichmentStatus, "fallback");
      assert.equal(result.summary, "I like cats");
      assert.equal(result.acknowledgment, "Those animals sound brilliant!");
    }
  });
});
