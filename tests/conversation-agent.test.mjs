import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initializeLogger, llm } from "@livekit/agents";
import { createOnboardingConversationState } from "../lib/conversation-scenario.js";
import {
  DEFAULT_AGENT_MODELS,
  readAgentConfig,
} from "../agent/config.ts";
import { createConversationIngestClient } from "../agent/ingest-client.ts";
import {
  AGENT_SESSION_START_OPTIONS,
  AGENT_TURN_HANDLING,
  ONBOARDING_AGENT_INSTRUCTIONS,
  ONBOARDING_TOOL_NAMES,
  createGettingToKnowYouTask,
} from "../agent/onboarding-scenario.ts";
import {
  createAgentModels,
  parseConversationParticipantMetadata,
} from "../agent/index.ts";
import * as agentRuntime from "../agent/index.ts";

initializeLogger({ level: "silent", pretty: false });

function environment(overrides = {}) {
  return {
    CONVERSATION_AGENT_SECRET: "agent-secret",
    CONVERSATION_INGEST_URL: "https://app.example.test",
    LIVEKIT_API_KEY: "api-key",
    LIVEKIT_API_SECRET: "api-secret",
    LIVEKIT_URL: "wss://livekit.example.test",
    ...overrides,
  };
}

describe("LiveKit agent configuration", () => {
  it("requires server credentials and resolves explicit pinned model IDs", () => {
    const config = readAgentConfig(environment());

    assert.equal(config.livekitUrl, "wss://livekit.example.test");
    assert.equal(config.ingestSecret, "agent-secret");
    assert.equal(config.sttModel, "elevenlabs/scribe_v2_realtime");
    assert.equal(config.llmModel, "openai/gpt-4.1-mini");
    assert.equal(config.ttsModel, "inworld/inworld-tts-2");
    assert.equal(config.ttsVoiceId, "Olivia");
    assert.deepEqual(
      Object.values(DEFAULT_AGENT_MODELS).some((value) =>
        /(?:auto|latest)$/i.test(value),
      ),
      false,
    );
  });

  it("constructs the configured inference models and validates participant metadata", () => {
    const config = readAgentConfig(environment());
    const models = createAgentModels(config);

    assert.equal(models.stt.model, config.sttModel);
    assert.equal(models.llm.model, config.llmModel);
    assert.equal(models.tts.model, config.ttsModel);
    assert.deepEqual(models.tts.opts.fallback, [
      {
        extraKwargs: { emotion: "excited", speed: 1.05 },
        model: "cartesia/sonic-3",
        voice: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
      },
    ]);
    assert.deepEqual(
      parseConversationParticipantMetadata(
        JSON.stringify({
          conversationId: "conversation-1",
          onboardingProfile: {
            age: 30,
            name: "Mia",
            summary: "Mia is thirty and loves fast red cars.",
          },
        }),
      ),
      {
        conversationId: "conversation-1",
        initialState: {
          phase: "optional",
          activeObjective: "interest",
          rephraseCount: { name: 0, age: 0, interest: 0 },
          optionalExchangeCount: 0,
          profileSummary: "Mia is thirty and loves fast red cars.",
          profileName: "Mia",
          profileAge: 30,
          learnedName: true,
          learnedAge: true,
          finishReason: null,
        },
      },
    );
    assert.throws(
      () => parseConversationParticipantMetadata("{}"),
      /conversationId/,
    );
  });

  it("distinguishes typed user items from voice transcripts", () => {
    assert.equal(agentRuntime.conversationInputMode("user", true), "voice");
    assert.equal(agentRuntime.conversationInputMode("user", false), "text");
    assert.equal(agentRuntime.conversationInputMode("assistant", false), "voice");
  });

  it("rejects blank required settings and moving model aliases", () => {
    assert.throws(
      () => readAgentConfig(environment({ LIVEKIT_API_SECRET: " " })),
      /LIVEKIT_API_SECRET/,
    );
    assert.throws(
      () => readAgentConfig(environment({ AGENT_LLM_MODEL: "openai/chat-latest" })),
      /explicit model version/,
    );
    assert.throws(
      () => readAgentConfig(environment({ AGENT_STT_MODEL: "auto" })),
      /explicit model version/,
    );
  });
});

describe("bounded onboarding agent contract", () => {
  function ingest(overrides = {}) {
    return {
      async appendTurn() {},
      async endConversation() {},
      async updateState() {},
      ...overrides,
    };
  }

  it("uses one gateway-safe prose update tool without a fact schema", () => {
    const task = createGettingToKnowYouTask({
      conversationId: "conversation-1",
      ingest: ingest(),
    });
    const schema = llm.toJsonSchema(
      task.toolCtx.functionTools.updateProfileSummary.parameters,
      true,
      true,
    );
    const serialized = JSON.stringify(schema);

    assert.equal(serialized.includes('"oneOf"'), false);
    assert.match(serialized, /summary/);
    assert.match(serialized, /profileName/);
    assert.match(serialized, /profileAge/);
    assert.match(serialized, /learnedName/);
    assert.match(serialized, /learnedAge/);
    assert.doesNotMatch(serialized, /facts|topic|vehicles/);
    assert.doesNotMatch(serialized, /"maximum":17/);
  });

  it("persists one cumulative paragraph and no candidate fact rows", async () => {
    const calls = [];
    const task = createGettingToKnowYouTask({
      conversationId: "conversation-1",
      ingest: ingest({
        async updateState(...args) {
          calls.push(args);
        },
      }),
    });

    const result = await task.toolCtx.functionTools.updateProfileSummary.execute(
      {
        learnedAge: true,
        learnedName: true,
        outcome: "answered",
        profileAge: 30,
        profileName: "Mia",
        summary: "Mia is thirty years old and loves fast red cars.",
      },
      {},
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "conversation-1");
    assert.equal(calls[0][1].profileSummary, result.state.profileSummary);
    assert.equal(calls[0][1].profileName, "Mia");
    assert.equal(calls[0][1].profileAge, 30);
    assert.equal("facts" in result.state, false);
    assert.equal(result.nextPrompt.objective, "interest");
  });

  it("keeps the task completion callback bound to its hook context", async () => {
    const completed = [];
    const task = createGettingToKnowYouTask({
      conversationId: "conversation-1",
      ingest: ingest(),
    });
    const hookContext = {
      agent: { completed },
      complete(result) {
        this.agent.completed.push(result);
      },
      session: { generateReply() {} },
    };

    await task.hookAdapter.hooks.onEnter(hookContext);
    await task.toolCtx.functionTools.finishConversation.execute(
      { reason: "child_stopped" },
      {},
    );

    assert.deepEqual(completed, [{ finishReason: "child_stopped" }]);
  });

  it("speaks first without interruption and greets a returning learner from saved context", async () => {
    let opening;
    const task = createGettingToKnowYouTask({
      conversationId: "conversation-1",
      ingest: ingest(),
      initialState: createOnboardingConversationState({
        profileAge: 30,
        profileName: "Mia",
        profileSummary: "Mia is thirty and loves fast red cars.",
      }),
    });

    await task.hookAdapter.hooks.onEnter({
      complete() {},
      session: {
        generateReply(options) {
          opening = options;
        },
      },
    });

    assert.equal(opening.allowInterruptions, false);
    assert.match(opening.instructions, /Mia/);
    assert.match(opening.instructions, /fast red cars/);
    assert.match(opening.instructions, /already know|remember/i);
    assert.doesNotMatch(opening.instructions, /ask their name/i);
    assert.match(task._instructions, /Mia/);
    assert.match(task._instructions, /fast red cars/);
  });

  it("uses four constrained tools and asks for a natural prose paragraph", () => {
    const task = createGettingToKnowYouTask({
      conversationId: "conversation-1",
      ingest: ingest(),
    });

    assert.deepEqual(ONBOARDING_TOOL_NAMES, [
      "updateProfileSummary",
      "markObjectiveUnanswered",
      "finishConversation",
      "requestGentleRephrase",
    ]);
    assert.deepEqual(
      Object.keys(task.toolCtx.functionTools).sort(),
      [...ONBOARDING_TOOL_NAMES].sort(),
    );
    assert.match(ONBOARDING_AGENT_INSTRUCTIONS, /warm, playful pig friend/i);
    assert.match(ONBOARDING_AGENT_INSTRUCTIONS, /one natural paragraph/i);
    assert.match(ONBOARDING_AGENT_INSTRUCTIONS, /no labels, bullets, or field names/i);
    assert.match(ONBOARDING_AGENT_INSTRUCTIONS, /bright, bouncy energy/i);
    assert.match(ONBOARDING_AGENT_INSTRUCTIONS, /different category/i);
    assert.doesNotMatch(ONBOARDING_AGENT_INSTRUCTIONS, /fact schema|candidate facts/i);
    assert.doesNotMatch(ONBOARDING_AGENT_INSTRUCTIONS, /Chinese|Mandarin|中文/i);
    assert.doesNotMatch(
      ONBOARDING_AGENT_INSTRUCTIONS,
      /(?:I am|I'm|you are|you're) Peppa/i,
    );
  });

  it("advances only through tools and preserves the prose on a rephrase", async () => {
    const calls = [];
    const task = createGettingToKnowYouTask({
      conversationId: "conversation-1",
      ingest: ingest({
        async updateState(...args) {
          calls.push(args);
        },
      }),
    });
    const tools = task.toolCtx.functionTools;

    const recorded = await tools.updateProfileSummary.execute(
      {
        learnedAge: false,
        learnedName: true,
        outcome: "answered",
        profileAge: null,
        profileName: "Mia",
        summary: "The learner's name is Mia.",
      },
      {},
    );
    assert.equal(recorded.nextPrompt.objective, "age");
    assert.equal(calls[0][1].profileSummary, "The learner's name is Mia.");

    const rephrased = await tools.requestGentleRephrase.execute(
      { reason: "unclear" },
      {},
    );
    assert.equal(rephrased.nextPrompt.mode, "rephrase");
    assert.equal(rephrased.state.profileSummary, "The learner's name is Mia.");
  });

  it("starts without recording and configures acoustic endpointing and barge-in", () => {
    assert.deepEqual(AGENT_SESSION_START_OPTIONS, { record: false });
    assert.equal(AGENT_TURN_HANDLING.interruption.enabled, true);
    assert.equal(AGENT_TURN_HANDLING.interruption.mode, "adaptive");
    assert.equal(AGENT_TURN_HANDLING.endpointing.mode, "dynamic");
    assert.ok(AGENT_TURN_HANDLING.endpointing.minDelay >= 400);
    assert.ok(AGENT_TURN_HANDLING.endpointing.maxDelay <= 3000);
    assert.equal(AGENT_TURN_HANDLING.turnDetection, "inference");
  });
});

describe("conversation ingest client", () => {
  it("uses service auth, a timeout signal, and one retry for a 5xx response", async () => {
    const calls = [];
    const client = createConversationIngestClient({
      baseUrl: "https://app.example.test/",
      fetch: async (...args) => {
        calls.push(args);
        return calls.length === 1
          ? Response.json({ error: "busy" }, { status: 503 })
          : Response.json({ ok: true });
      },
      retryDelayMs: 0,
      secret: "agent-secret",
      timeoutMs: 5_000,
    });

    await client.appendTurn("conversation-1", {
      inputMode: "voice",
      interrupted: false,
      language: "en",
      providerItemId: "item-1",
      role: "user",
      sequence: 0,
      text: "My name is Mia.",
    });

    assert.equal(calls.length, 2);
    assert.equal(
      calls[0][0],
      "https://app.example.test/api/conversations/conversation-1/turns",
    );
    assert.equal(calls[0][1].headers.Authorization, "Bearer agent-secret");
    assert.ok(calls[0][1].signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(calls[0][1].body).role, "user");
  });

  it("rejects oversized payloads before making a network request", async () => {
    let calls = 0;
    const client = createConversationIngestClient({
      baseUrl: "https://app.example.test",
      fetch: async () => {
        calls += 1;
        return Response.json({ ok: true });
      },
      secret: "agent-secret",
    });

    await assert.rejects(
      client.appendTurn("conversation-1", {
        inputMode: "text",
        interrupted: false,
        language: "en",
        providerItemId: "item-1",
        role: "user",
        sequence: 0,
        text: "x".repeat(40_000),
      }),
      /payload is too large/i,
    );
    assert.equal(calls, 0);
  });
});
