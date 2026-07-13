import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { initializeLogger, llm } from "@livekit/agents";
import { createLearnerProfileConversationState } from "../lib/conversation-scenario.js";
import {
  DEFAULT_AGENT_MODELS,
  readAgentConfig,
} from "../agent/config.ts";
import { createConversationIngestClient } from "../agent/ingest-client.ts";
import {
  AGENT_SESSION_START_OPTIONS,
  AGENT_TURN_HANDLING,
  CONVERSATION_SYSTEM_PROMPTS,
  LEARNER_PROFILE_TOOL_NAMES,
  createGettingToKnowYouTask,
  createSmallChatTask,
} from "../agent/peppa-conversation.ts";
import * as conversationScenario from "../agent/peppa-conversation.ts";
import {
  createAgentModels,
  createAgentTurnHandling,
  parseConversationParticipantMetadata,
} from "../agent/index.ts";
import * as agentRuntime from "../agent/index.ts";

initializeLogger({ level: "silent", pretty: false });

function environment(overrides = {}) {
  return {
    CONVERSATION_AGENT_SECRET: "agent-secret",
    CONVERSATION_INGEST_URL: "https://app.example.test",
    LIVEKIT_AGENT_NAME: "parrot-conversation",
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
    assert.equal(config.agentName, "parrot-conversation");
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
          scenarioKey: "profile-edit",
          learnerProfile: {
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
        purpose: "profile-edit",
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

  it("repeats the latest assistant audio without adding a learner turn", () => {
    const calls = [];
    let latestAssistantText = "What animals do you like?";
    const handleTextInput = agentRuntime.createConversationTextInputCallback(
      () => latestAssistantText,
    );
    const session = {
      generateReply(options) {
        calls.push(["generateReply", options]);
      },
      interrupt() {
        calls.push(["interrupt"]);
      },
      say(text, options) {
        calls.push(["say", text, options]);
      },
    };

    handleTextInput(session, { text: "__parrot_repeat_last_audio__" });
    assert.deepEqual(calls, [
      [
        "say",
        "What animals do you like?",
        { addToChatCtx: false, allowInterruptions: true },
      ],
    ]);

    calls.length = 0;
    latestAssistantText = "";
    handleTextInput(session, { text: "__parrot_repeat_last_audio__" });
    assert.deepEqual(calls, []);

    handleTextInput(session, { text: "I like pandas" });
    assert.deepEqual(calls, [
      ["interrupt"],
      ["generateReply", { userInput: "I like pandas" }],
    ]);
  });

  it("rejects blank required settings and moving model aliases", () => {
    assert.throws(
      () => readAgentConfig(environment({ LIVEKIT_AGENT_NAME: " " })),
      /LIVEKIT_AGENT_NAME/,
    );
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

describe("purpose-specific Peppa conversation prompts", () => {
  it("stores each complete static system prompt in its own source file", () => {
    const promptDirectory = resolve(import.meta.dirname, "../agent/prompts");
    const promptFiles = readdirSync(promptDirectory)
      .filter((file) => file.endsWith(".ts"))
      .sort();

    assert.deepEqual(promptFiles, [
      "introduction.ts",
      "profile-edit.ts",
      "small-chat.ts",
    ]);

    const sources = Object.fromEntries(
      promptFiles.map((file) => [
        file,
        readFileSync(resolve(promptDirectory, file), "utf8"),
      ]),
    );
    for (const source of Object.values(sources)) {
      assert.match(source, /warm, playful pig friend/i);
      assert.match(source, /speak first/i);
      assert.match(source, /edit only the large block of text below/i);
    }
    assert.match(sources["introduction.ts"], /first introduction/i);
    assert.match(sources["introduction.ts"], /first welcome chat/i);
    assert.match(sources["profile-edit.ts"], /update the existing learner profile/i);
    assert.match(sources["profile-edit.ts"], /Edit profile.*Chat with Peppa again/is);
    assert.match(sources["small-chat.ts"], /ordinary small chat/i);
    assert.match(sources["small-chat.ts"], /Talk to Peppa.*main menu/is);

    const runtimeSource = readFileSync(
      resolve(import.meta.dirname, "../agent/peppa-conversation.ts"),
      "utf8",
    );
    assert.doesNotMatch(runtimeSource, /warm, playful pig friend/i);
  });

  it("keeps onboarding, profile editing, and small chat as distinct contracts", () => {
    const prompts = conversationScenario.CONVERSATION_SYSTEM_PROMPTS;

    assert.deepEqual(Object.keys(prompts).sort(), [
      "onboarding",
      "profile-edit",
      "small-chat",
    ]);
    assert.match(prompts.onboarding, /first introduction/i);
    assert.match(prompts.onboarding, /learn.*name.*age/is);
    assert.match(prompts["profile-edit"], /update.*profile/is);
    assert.match(prompts["profile-edit"], /correct|change/i);
    assert.match(prompts["small-chat"], /ordinary.*chat/is);
    assert.match(prompts["small-chat"], /do not.*profile/i);
    assert.equal(new Set(Object.values(prompts)).size, 3);
  });
});

describe("bounded learner-profile agent contract", () => {
  function ingest(overrides = {}) {
    return {
      async appendTurn() {},
      async endConversation() {},
      async updateState() {},
      ...overrides,
    };
  }

  it("uses a structured learner-profile update tool without a fact schema", () => {
    const task = createGettingToKnowYouTask({
      conversationId: "conversation-1",
      ingest: ingest(),
    });
    const schema = llm.toJsonSchema(
      task.toolCtx.functionTools.updateLearnerProfile.parameters,
      true,
      true,
    );
    const properties = schema.properties ?? {};

    assert.deepEqual(Object.keys(properties).sort(), [
      "age",
      "description",
      "learnedAge",
      "learnedName",
      "name",
      "outcome",
    ]);
    assert.equal(JSON.stringify(schema).includes('"oneOf"'), false);
    assert.doesNotMatch(JSON.stringify(schema), /facts|topic|vehicles/);
    assert.doesNotMatch(JSON.stringify(schema), /"maximum":17/);
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

    const result = await task.toolCtx.functionTools.updateLearnerProfile.execute(
      {
        age: 30,
        description: "Mia is thirty years old and loves fast red cars.",
        learnedAge: true,
        learnedName: true,
        name: "Mia",
        outcome: "answered",
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

  it("keeps opening behavior in the static profile-edit system prompt", async () => {
    let opening;
    const task = createGettingToKnowYouTask({
      conversationId: "conversation-1",
      ingest: ingest(),
      purpose: "profile-edit",
      initialState: createLearnerProfileConversationState({
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

    assert.deepEqual(opening, { allowInterruptions: false });
    assert.match(CONVERSATION_SYSTEM_PROMPTS["profile-edit"], /speak first/i);
    assert.match(
      CONVERSATION_SYSTEM_PROMPTS["profile-edit"],
      /saved profile|saved learner details/i,
    );
    assert.match(
      CONVERSATION_SYSTEM_PROMPTS["profile-edit"],
      /do not ask.*known.*name.*age|do not ask.*name.*age.*known/i,
    );
    assert.match(task._instructions, /Mia/);
    assert.match(task._instructions, /fast red cars/);
  });

  it("uses four constrained tools and asks for a natural prose paragraph", () => {
    const task = createGettingToKnowYouTask({
      conversationId: "conversation-1",
      ingest: ingest(),
    });

    assert.deepEqual(LEARNER_PROFILE_TOOL_NAMES, [
      "updateLearnerProfile",
      "markObjectiveUnanswered",
      "finishConversation",
      "requestGentleRephrase",
    ]);
    assert.deepEqual(
      Object.keys(task.toolCtx.functionTools).sort(),
      [...LEARNER_PROFILE_TOOL_NAMES].sort(),
    );
    const instructions = CONVERSATION_SYSTEM_PROMPTS.onboarding;
    assert.match(instructions, /warm, playful pig friend/i);
    assert.match(instructions, /one natural paragraph/i);
    assert.match(instructions, /no labels, bullets, or field names/i);
    assert.match(instructions, /bright, bouncy energy/i);
    assert.match(instructions, /relevant answer|differs from the category/i);
    assert.doesNotMatch(instructions, /fact schema|candidate facts/i);
    assert.doesNotMatch(instructions, /Chinese|Mandarin|中文/i);
    assert.doesNotMatch(
      instructions,
      /(?:I am|I'm|you are|you're) Peppa/i,
    );
  });

  it("gives ordinary small chat a static opening prompt and no profile-writing tools", async () => {
    const task = createSmallChatTask();
    let opening;

    await task.hookAdapter.hooks.onEnter({
      complete() {},
      session: {
        generateReply(options) {
          opening = options;
        },
      },
    });

    assert.deepEqual(Object.keys(task.toolCtx.functionTools), []);
    assert.deepEqual(opening, { allowInterruptions: false });
    assert.match(task._instructions, /ordinary small chat/i);
    assert.match(CONVERSATION_SYSTEM_PROMPTS["small-chat"], /speak first/i);
    assert.doesNotMatch(task._instructions, /call exactly one appropriate state tool/i);
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

    const recorded = await tools.updateLearnerProfile.execute(
      {
        age: null,
        description: "The learner's name is Mia.",
        learnedAge: false,
        learnedName: true,
        name: "Mia",
        outcome: "answered",
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

  it("does not hold Peppa's next reply behind remote profile persistence", async () => {
    let releasePersistence;
    const persistenceBlocked = new Promise((resolve) => {
      releasePersistence = resolve;
    });
    const task = createGettingToKnowYouTask({
      conversationId: "conversation-1",
      ingest: ingest({
        async updateState() {
          await persistenceBlocked;
        },
      }),
    });
    const transition =
      task.toolCtx.functionTools.updateLearnerProfile.execute(
        {
          age: null,
          description: "The learner's name is Mia.",
          learnedAge: false,
          learnedName: true,
          name: "Mia",
          outcome: "answered",
        },
        {},
      );

    let outcome;
    try {
      outcome = await Promise.race([
        transition.then(() => "completed"),
        new Promise((resolve) =>
          setTimeout(() => resolve("blocked-by-persistence"), 25),
        ),
      ]);
    } finally {
      releasePersistence();
      await transition;
    }

    assert.equal(outcome, "completed");
  });

  it("lets session shutdown flush a write-behind profile update", async () => {
    let releasePersistence;
    const persistenceBlocked = new Promise((resolve) => {
      releasePersistence = resolve;
    });
    const task = createGettingToKnowYouTask({
      conversationId: "conversation-1",
      ingest: ingest({
        async updateState() {
          await persistenceBlocked;
        },
      }),
    });
    const transition =
      task.toolCtx.functionTools.updateLearnerProfile.execute(
        {
          age: null,
          description: "The learner's name is Mia.",
          learnedAge: false,
          learnedName: true,
          name: "Mia",
          outcome: "answered",
        },
        {},
      );

    const hasPersistenceWaiter =
      typeof task.waitForPendingStatePersistence === "function";
    let stateBeforeRelease;
    if (hasPersistenceWaiter) {
      const waiting = task.waitForPendingStatePersistence().then(
        () => "flushed",
      );
      stateBeforeRelease = await Promise.race([
        waiting,
        new Promise((resolve) =>
          setTimeout(() => resolve("still-pending"), 25),
        ),
      ]);
      releasePersistence();
      await waiting;
    } else {
      releasePersistence();
    }
    await transition;

    assert.equal(hasPersistenceWaiter, true);
    assert.equal(stateBeforeRelease, "still-pending");
  });

  it("starts without recording and uses a sub-second-first low-latency turn budget", () => {
    assert.deepEqual(AGENT_SESSION_START_OPTIONS, { record: false });
    assert.equal(AGENT_TURN_HANDLING.interruption.enabled, true);
    assert.equal(AGENT_TURN_HANDLING.interruption.mode, "adaptive");
    assert.equal(AGENT_TURN_HANDLING.endpointing.mode, "dynamic");
    assert.ok(AGENT_TURN_HANDLING.endpointing.minDelay <= 350);
    assert.ok(AGENT_TURN_HANDLING.endpointing.maxDelay <= 1_200);
    assert.deepEqual(AGENT_TURN_HANDLING.preemptiveGeneration, {
      enabled: true,
      preemptiveTts: true,
    });
    assert.equal(AGENT_TURN_HANDLING.turnDetection, "inference");
  });

  it("passes the low-latency options into the running agent session", () => {
    const turnHandling = createAgentTurnHandling();

    assert.equal(
      turnHandling.endpointing,
      AGENT_TURN_HANDLING.endpointing,
    );
    assert.equal(
      turnHandling.interruption,
      AGENT_TURN_HANDLING.interruption,
    );
    assert.equal(
      turnHandling.preemptiveGeneration,
      AGENT_TURN_HANDLING.preemptiveGeneration,
    );
    assert.equal(turnHandling.turnDetection.constructor.name, "TurnDetector");
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
