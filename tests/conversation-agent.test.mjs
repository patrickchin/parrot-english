import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initializeLogger } from "@livekit/agents";
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
    assert.equal(config.ttsModel, "elevenlabs/eleven_v3");
    assert.equal(config.ttsVoiceId, "Oqy85UMasXzUjUxF0ta5");
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
    assert.equal(
      parseConversationParticipantMetadata(
        JSON.stringify({ conversationId: "conversation-1" }),
      ),
      "conversation-1",
    );
    assert.throws(
      () => parseConversationParticipantMetadata("{}"),
      /conversationId/,
    );
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
  it("uses four constrained tools and a warm non-impersonating prompt", () => {
    const ingest = {
      async appendTurn() {},
      async endConversation() {},
      async upsertFacts() {},
    };
    const task = createGettingToKnowYouTask({
      conversationId: "conversation-1",
      ingest,
    });

    assert.deepEqual(ONBOARDING_TOOL_NAMES, [
      "recordCandidateFacts",
      "markObjectiveUnanswered",
      "finishConversation",
      "requestGentleRephrase",
    ]);
    assert.deepEqual(
      Object.keys(task.toolCtx.functionTools).sort(),
      [...ONBOARDING_TOOL_NAMES].sort(),
    );
    assert.match(ONBOARDING_AGENT_INSTRUCTIONS, /warm, playful pig friend/i);
    assert.match(ONBOARDING_AGENT_INSTRUCTIONS, /one short English question/i);
    assert.match(ONBOARDING_AGENT_INSTRUCTIONS, /brief Chinese hint/i);
    assert.match(ONBOARDING_AGENT_INSTRUCTIONS, /three optional/i);
    assert.match(ONBOARDING_AGENT_INSTRUCTIONS, /unrelated topics/i);
    assert.doesNotMatch(
      ONBOARDING_AGENT_INSTRUCTIONS,
      /(?:I am|I'm|you are|you're) Peppa/i,
    );
    assert.doesNotMatch(ONBOARDING_AGENT_INSTRUCTIONS, /clone|impersonat/i);
  });

  it("advances controller state only through tools and persists candidate facts", async () => {
    const calls = [];
    const ingest = {
      async appendTurn() {},
      async endConversation(...args) {
        calls.push(["end", ...args]);
      },
      async upsertFacts(...args) {
        calls.push(["facts", ...args]);
      },
    };
    const task = createGettingToKnowYouTask({
      conversationId: "conversation-1",
      createId: () => "fact-name",
      ingest,
    });
    const tools = task.toolCtx.functionTools;

    const recorded = await tools.recordCandidateFacts.execute(
      {
        facts: [{ key: "name", value: "Mia" }],
        nextInterestTopic: null,
        outcome: "answered",
      },
      {},
    );
    assert.equal(recorded.nextPrompt.objective, "age");
    assert.equal(calls[0][0], "facts");
    assert.equal(calls[0][1], "conversation-1");
    assert.deepEqual(calls[0][2][0], {
      id: "fact-name",
      key: "name",
      sourceTurnIds: [],
      value: "Mia",
    });

    const rephrased = await tools.requestGentleRephrase.execute(
      { reason: "unclear" },
      {},
    );
    assert.equal(rephrased.nextPrompt.mode, "rephrase");
    assert.equal(rephrased.nextPrompt.includeChineseHint, true);
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
