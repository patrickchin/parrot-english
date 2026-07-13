import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLearnerProfileConversationState } from "../lib/conversation-scenario.js";
import { deriveConversationProfileState } from "../worker/conversation-profile-finalization.ts";

function providerResponse(value) {
  return Response.json({
    choices: [{ message: { content: JSON.stringify(value) } }],
  });
}

describe("deferred conversation profile finalization", () => {
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
      purpose: "profile-edit",
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
});
