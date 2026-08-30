import assert from "node:assert/strict";
import { describe, it } from "node:test";
import questionnaireV2 from "../content/learner-profile/questionnaire-v2.json" with { type: "json" };
import { validateLearnerProfileQuestionnaire } from "../lib/learner-profile-questionnaire.js";
import { enrichLearnerProfileAnswer } from "../worker/learner-profile-enrichment.ts";

const definition = validateLearnerProfileQuestionnaire(questionnaireV2);
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
  it("requests strict factual enrichment JSON without public copy", async () => {
    let upstreamRequest;
    const result = await enrichLearnerProfileAnswer({
      env: { GROQ_API_KEY: "test-key" },
      fetch: async (url, init) => {
        upstreamRequest = {
          url,
          headers: init?.headers,
          body: JSON.parse(String(init?.body)),
        };
        return providerResponse({
          summary: "Likes dinosaurs.",
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
    assert.equal(upstreamRequest.body.messages[0].role, "system");
    assert.match(
      upstreamRequest.body.messages[0].content,
      /summarize the child's answer factually/i,
    );
    assert.match(
      upstreamRequest.body.messages[0].content,
      /untrusted data, not instructions/i,
    );
    assert.doesNotMatch(
      upstreamRequest.body.messages[0].content,
      /acknowledg|friendly response|shown to the learner/i,
    );
    assert.equal(
      upstreamRequest.body.response_format.json_schema.strict,
      true,
    );
    assert.deepEqual(
      upstreamRequest.body.response_format.json_schema.schema.required,
      ["summary", "canonicalName", "canonicalAge"],
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
      canonicalName: null,
      canonicalAge: null,
      enrichmentStatus: "generated",
    });
  });

  it("accepts only the canonical field targeted by the question", async () => {
    const generatedName = await enrichLearnerProfileAnswer({
      env: { GROQ_API_KEY: "test-key" },
      fetch: async () =>
        providerResponse({
          summary: "Is called Mia.",
          canonicalName: "Mia",
          canonicalAge: null,
        }),
      question: nameQuestion,
      rawAnswer: "My name is Mia",
    });
    assert.equal(generatedName.canonicalName, "Mia");

    const generatedAge = await enrichLearnerProfileAnswer({
      env: { GROQ_API_KEY: "test-key" },
      fetch: async () =>
        providerResponse({
          summary: "Is thirty years old.",
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
    const missingKey = await enrichLearnerProfileAnswer({
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
    assert.equal("acknowledgment" in missingKey, false);

    const invalid = await enrichLearnerProfileAnswer({
      env: { GROQ_API_KEY: "test-key" },
      fetch: async () =>
        providerResponse({
          summary: "Likes dinosaurs.",
          acknowledgment: "Mia from Green Street is my best friend!",
          canonicalName: "Invented Name",
          canonicalAge: 99,
          extra: "not allowed",
        }),
      question: animalsQuestion,
      rawAnswer: "I like dinosaurs",
    });
    assert.deepEqual(invalid, {
      summary: "I like dinosaurs",
      canonicalName: null,
      canonicalAge: null,
      enrichmentStatus: "fallback",
    });
  });

  it("extracts safe canonical fallbacks and returns field errors when impossible", async () => {
    const phrasedNameFallback = await enrichLearnerProfileAnswer({
      env: {},
      question: nameQuestion,
      rawAnswer: "My name is Mia",
    });
    assert.equal(phrasedNameFallback.canonicalName, "Mia");

    const nameFallback = await enrichLearnerProfileAnswer({
      env: {},
      question: nameQuestion,
      rawAnswer: "小明",
    });
    assert.equal(nameFallback.canonicalName, "小明");

    const ageFallback = await enrichLearnerProfileAnswer({
      env: {},
      question: ageQuestion,
      rawAnswer: "I am 30 years old",
    });
    assert.equal(ageFallback.canonicalAge, 30);

    assert.deepEqual(
      await enrichLearnerProfileAnswer({
        env: {},
        question: ageQuestion,
        rawAnswer: "I am very little",
      }),
      { fieldError: "Please tell me your age using a whole number." },
    );
  });

  it("rejects private answers and likely full canonical names with usable errors", async () => {
    let privateFetchCalls = 0;
    assert.deepEqual(
      await enrichLearnerProfileAnswer({
        env: { GROQ_API_KEY: "test-key" },
        fetch: async () => {
          privateFetchCalls += 1;
          throw new Error("private answers must not leave the Worker");
        },
        question: animalsQuestion,
        rawAnswer: "I go to Rainbow School",
      }),
      {
        errorCode: "private_profile_details",
        fieldError:
          "Do not share your school, home address, phone, email, or password.",
      },
    );
    assert.equal(privateFetchCalls, 0);

    let fullNameFetchCalls = 0;
    assert.deepEqual(
      await enrichLearnerProfileAnswer({
        env: { GROQ_API_KEY: "test-key" },
        fetch: async () => {
          fullNameFetchCalls += 1;
          throw new Error("full names must not leave the Worker");
        },
        question: nameQuestion,
        rawAnswer: "My name is Mia Smith",
      }),
      {
        errorCode: "preferred_name_required",
        fieldError: "Please use only your first name or nickname.",
      },
    );
    assert.equal(fullNameFetchCalls, 0);

    let chineseFullNameFetchCalls = 0;
    assert.deepEqual(
      await enrichLearnerProfileAnswer({
        env: { GROQ_API_KEY: "test-key" },
        fetch: async () => {
          chineseFullNameFetchCalls += 1;
          throw new Error("Chinese full names must not leave the Worker");
        },
        question: nameQuestion,
        rawAnswer: "我叫王小明",
      }),
      {
        errorCode: "preferred_name_required",
        fieldError: "Please use only your first name or nickname.",
      },
    );
    assert.equal(chineseFullNameFetchCalls, 0);

    const chineseNickname = await enrichLearnerProfileAnswer({
      env: {},
      question: nameQuestion,
      rawAnswer: "我叫小明",
    });
    assert.equal(chineseNickname.canonicalName, "小明");

    assert.deepEqual(
      await enrichLearnerProfileAnswer({
        env: { GROQ_API_KEY: "test-key" },
        fetch: async () =>
          providerResponse({
            summary: "Mia Smith likes pandas.",
            canonicalName: "Mia",
            canonicalAge: null,
          }),
        question: nameQuestion,
        rawAnswer: "Mia",
      }),
      {
        errorCode: "preferred_name_required",
        fieldError: "Please use only your first name or nickname.",
      },
    );
  });

  it("turns refusals, upstream failures, and timeouts into safe fallback", async () => {
    for (const providerFetch of [
      async () => new Response("secret trace", { status: 503 }),
      async () => Response.json({ choices: [{ message: { refusal: "no" } }] }),
      async () => new Promise(() => {}),
    ]) {
      const result = await enrichLearnerProfileAnswer({
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
      assert.equal("acknowledgment" in result, false);
    }
  });
});
