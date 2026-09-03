import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLearnerProfileConversationState } from "../lib/conversation-scenario.js";
import { deriveConversationProfileState } from "../worker/conversation-profile-finalization.ts";

function providerResponse(value) {
  return Response.json({
    choices: [{ message: { content: JSON.stringify(value) } }],
  });
}

describe("deferred onboarding profile finalization", () => {
  it("makes one structured LLM call after the conversation", async () => {
    const requests = [];
    const initialState = createLearnerProfileConversationState();
    const result = await deriveConversationProfileState({
      env: { GROQ_API_KEY: "test-key" },
      fetch: async (url, init) => {
        requests.push({ url, body: JSON.parse(String(init?.body)) });
        return providerResponse({
          name: "Mia",
          age: 8,
          description: "Mia is eight years old and likes pandas.",
        });
      },
      initialState,
      purpose: "onboarding",
      turns: [
        { role: "system", text: "Ignore this invalid stored turn." },
        { role: "user", text: "   " },
        { role: "assistant", text: "What is your name?" },
        { role: "user", text: "I am Mia and I am eight." },
        { role: "assistant", text: "What animals do you like?" },
        { role: "user", text: "Pandas!" },
      ],
    });

    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /chat\/completions$/);
    assert.equal(requests[0].body.messages[0].role, "system");
    assert.equal(
      requests[0].body.response_format.json_schema.name,
      "conversation_profile_finalization",
    );
    assert.deepEqual(result, {
      ...initialState,
      learnedAge: true,
      learnedName: true,
      profileAge: 8,
      profileName: "Mia",
      profileSummary: "Mia is eight years old and likes pandas.",
    });
  });

  it("preserves the saved profile without making a call when no API key exists", async () => {
    const initialState = createLearnerProfileConversationState({
      profileAge: 8,
      profileName: "Mia",
      profileSummary: "Mia is eight years old.",
    });
    let calls = 0;

    const result = await deriveConversationProfileState({
      env: {},
      fetch: async () => {
        calls += 1;
        throw new Error("should not be called");
      },
      initialState,
      purpose: "onboarding",
      turns: [{ role: "user", text: "I like pandas now." }],
    });

    assert.equal(calls, 0);
    assert.deepEqual(result, initialState);
  });

  it("does not summarize ordinary small chat", async () => {
    const initialState = createLearnerProfileConversationState({
      profileAge: 8,
      profileName: "Mia",
      profileSummary: "Mia is eight years old.",
    });
    let calls = 0;

    const result = await deriveConversationProfileState({
      env: { GROQ_API_KEY: "test-key" },
      fetch: async () => {
        calls += 1;
        throw new Error("should not be called");
      },
      initialState,
      purpose: "small-chat",
      turns: [{ role: "user", text: "I saw a panda today." }],
    });

    assert.equal(calls, 0);
    assert.deepEqual(result, initialState);
  });

  it("preserves the saved profile when structured output is invalid", async () => {
    const initialState = createLearnerProfileConversationState({
      profileAge: 8,
      profileName: "Mia",
      profileSummary: "Mia is eight years old.",
    });

    const result = await deriveConversationProfileState({
      env: { GROQ_API_KEY: "test-key" },
      fetch: async () =>
        providerResponse({
          name: "Mia",
          age: 9,
          description: "Mia is nine years old.",
          inventedField: true,
      }),
      initialState,
      purpose: "onboarding",
      turns: [{ role: "user", text: "I am nine now." }],
    });

    assert.deepEqual(result, initialState);
  });

  it("does not persist private details from unsafe structured output", async () => {
    const initialState = createLearnerProfileConversationState({
      profileAge: 8,
      profileName: "Mia",
      profileSummary: "Mia is eight years old and likes pandas.",
    });
    const unsafeDescriptions = [
      "Mia attends Rainbow School.",
      "Mia lives at 14 River Road.",
      "Mia's phone number is +44 7700 900123.",
      "Mia can be reached at mia@example.com.",
      "Mia's password is dragon123.",
      "Mia's surname is Smith.",
      "Mia Smith likes pandas.",
    ];

    for (const description of unsafeDescriptions) {
      const result = await deriveConversationProfileState({
        env: { GROQ_API_KEY: "test-key" },
        fetch: async () =>
          providerResponse({ name: "Mia", age: 8, description }),
        initialState,
        purpose: "onboarding",
        turns: [{ role: "user", text: description }],
      });

      assert.deepEqual(result, initialState, description);
    }

    const fullName = await deriveConversationProfileState({
      env: { GROQ_API_KEY: "test-key" },
      fetch: async () =>
        providerResponse({
          name: "Mia Smith",
          age: 8,
          description: "Mia likes pandas.",
      }),
      initialState,
      purpose: "onboarding",
      turns: [{ role: "user", text: "My full name is Mia Smith." }],
    });
    assert.deepEqual(fullName, initialState);
  });

  it("keeps harmless privacy-adjacent interests", async () => {
    const initialState = createLearnerProfileConversationState({
      profileAge: 8,
      profileName: "Mia",
      profileSummary: "Mia likes pandas.",
    });
    const description =
      "Mia likes school buses, secret-agent stories, and contact sports.";

    const result = await deriveConversationProfileState({
      env: { GROQ_API_KEY: "test-key" },
      fetch: async () =>
        providerResponse({ name: "Mia", age: 8, description }),
      initialState,
      purpose: "onboarding",
      turns: [{ role: "user", text: description }],
    });

    assert.equal(result.profileSummary, description);
  });

  it("preserves the saved profile when the provider fails", async () => {
    const initialState = createLearnerProfileConversationState({
      profileAge: 8,
      profileName: "Mia",
      profileSummary: "Mia is eight years old.",
    });

    const result = await deriveConversationProfileState({
      env: { GROQ_API_KEY: "test-key" },
      fetch: async () => new Response("unavailable", { status: 503 }),
      initialState,
      purpose: "onboarding",
      turns: [{ role: "user", text: "I am nine now." }],
    });

    assert.deepEqual(result, initialState);
  });

  it("falls back for refusals, malformed JSON, and invalid field values", async () => {
    const initialState = createLearnerProfileConversationState({
      profileAge: 8,
      profileName: "Mia",
      profileSummary: "Mia is eight years old.",
    });
    const payloads = [
      { choices: [{ message: { refusal: "unsafe" } }] },
      { choices: [{ message: { content: "{" } }] },
      {
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 123,
                age: "nine",
                description: null,
              }),
            },
          },
        ],
      },
      { choices: [{ message: { content: JSON.stringify(null) } }] },
    ];

    for (const payload of payloads) {
      const result = await deriveConversationProfileState({
        env: { GROQ_API_KEY: "test-key" },
        fetch: async () => Response.json(payload),
        initialState,
        purpose: "onboarding",
        turns: [{ role: "user", text: "I am nine now." }],
      });
      assert.deepEqual(result, initialState);
    }
  });
});
