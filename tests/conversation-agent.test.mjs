import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { initializeLogger } from "@livekit/agents";
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
    OPENAI_API_KEY: "openai-key",
    ...overrides,
  };
}

describe("LiveKit agent configuration", () => {
  it("requires server credentials and resolves explicit pinned model IDs", () => {
    const config = readAgentConfig(environment());

    assert.equal(config.livekitUrl, "wss://livekit.example.test");
    assert.equal(config.ingestSecret, "agent-secret");
    assert.equal(config.agentName, "parrot-conversation");
    assert.equal(config.openaiApiKey, "openai-key");
    assert.equal(config.realtimeModel, "gpt-realtime-2.1-mini");
    assert.equal(config.realtimeVoice, "marin");
    assert.equal(config.transcriptionModel, "gpt-4o-mini-transcribe");
    assert.equal(config.buildVersion, "local");
    assert.equal(config.commitSha, "local");
    assert.deepEqual(
      Object.values(DEFAULT_AGENT_MODELS).some((value) =>
        /(?:auto|latest)$/i.test(value),
      ),
      false,
    );
  });

  it("requires real semver and Git metadata in the production image", () => {
    assert.throws(
      () => readAgentConfig(environment({ NODE_ENV: "production" })),
      /PARROT_AGENT_VERSION/,
    );
    assert.throws(
      () =>
        readAgentConfig(
          environment({
            NODE_ENV: "production",
            PARROT_AGENT_COMMIT_SHA: "local",
            PARROT_AGENT_VERSION: "0.1.315",
          }),
        ),
      /PARROT_AGENT_COMMIT_SHA/,
    );

    const config = readAgentConfig(
      environment({
        NODE_ENV: "production",
        PARROT_AGENT_COMMIT_SHA: "abcdef1",
        PARROT_AGENT_VERSION: "0.1.315",
      }),
    );
    assert.equal(config.buildVersion, "0.1.315");
    assert.equal(config.commitSha, "abcdef1");
  });

  it("constructs one low-latency realtime voice model and validates participant metadata", () => {
    const config = readAgentConfig(environment());
    const models = createAgentModels(config);

    assert.deepEqual(Object.keys(models), ["realtime"]);
    assert.equal(models.realtime.model, config.realtimeModel);
    assert.equal(models.realtime._options.apiKey, config.openaiApiKey);
    assert.equal(models.realtime._options.voice, config.realtimeVoice);
    assert.deepEqual(models.realtime._options.reasoning, { effort: "low" });
    assert.deepEqual(models.realtime._options.inputAudioTranscription, {
      language: "en",
      model: config.transcriptionModel,
    });
    assert.equal(models.realtime._options.turnDetection, null);
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
      commitUserTurn() {
        calls.push(["commitUserTurn"]);
      },
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
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "generateReply");
    assert.equal(calls[0][1].allowInterruptions, true);
    assert.match(calls[0][1].instructions, /repeat exactly/i);
    assert.match(calls[0][1].instructions, /What animals do you like\?/);

    calls.length = 0;
    latestAssistantText = "";
    handleTextInput(session, { text: "__parrot_repeat_last_audio__" });
    assert.deepEqual(calls, []);

    handleTextInput(session, { text: "__parrot_commit_user_turn__" });
    assert.deepEqual(calls, [["commitUserTurn"]]);

    calls.length = 0;
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
      () =>
        readAgentConfig(
          environment({ AGENT_REALTIME_MODEL: "gpt-realtime-latest" }),
        ),
      /explicit model version/,
    );
    assert.throws(
      () => readAgentConfig(environment({ AGENT_TRANSCRIPTION_MODEL: "auto" })),
      /explicit model version/,
    );
  });

  it("keeps asynchronous realtime transcripts in English when a legacy override remains", () => {
    const config = readAgentConfig(environment({ AGENT_STT_LANGUAGE: "zh" }));
    const models = createAgentModels(config);

    assert.equal(
      models.realtime._options.inputAudioTranscription.language,
      "en",
    );
  });

  it("generates and finishes the realtime goodbye before closing the session", async () => {
    const calls = [];
    const session = {
      async close() {
        calls.push(["close"]);
      },
      generateReply(options) {
        calls.push(["generateReply", options]);
        return {
          async waitForPlayout() {
            calls.push(["waitForPlayout"]);
          },
        };
      },
    };

    await agentRuntime.playConversationGoodbyeAndClose(session);

    assert.equal(calls[0][0], "generateReply");
    assert.equal(calls[0][1].allowInterruptions, true);
    assert.match(calls[0][1].instructions, /Thanks for chatting with me!/);
    assert.deepEqual(calls.slice(1), [["waitForPlayout"], ["close"]]);
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

describe("single-inference learner-profile agent contract", () => {
  function ingest(overrides = {}) {
    return {
      async appendTurn() {},
      async endConversation() {},
      async updateState() {},
      ...overrides,
    };
  }

  it("uses no tools during onboarding learner turns", () => {
    const task = createGettingToKnowYouTask({
      conversationId: "conversation-1",
      ingest: ingest(),
    });
    assert.deepEqual(Object.keys(task.toolCtx.functionTools), []);
  });

  it("uses no tools during profile editing and preserves saved context", async () => {
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
    assert.deepEqual(Object.keys(task.toolCtx.functionTools), []);
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

  it("keeps profile persistence out of the live-turn prompts", () => {
    const instructions = CONVERSATION_SYSTEM_PROMPTS.onboarding;
    assert.match(instructions, /warm, playful pig friend/i);
    assert.match(instructions, /bright, bouncy energy/i);
    assert.match(instructions, /relevant answer|differs from the category/i);
    assert.match(instructions, /never call a tool/i);
    assert.doesNotMatch(
      instructions,
      /updateLearnerProfile|markObjectiveUnanswered|finishConversation|requestGentleRephrase/i,
    );
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

  it("leaves every learner turn boundary to the turn button", () => {
    assert.deepEqual(AGENT_SESSION_START_OPTIONS, { record: false });
    assert.equal(AGENT_TURN_HANDLING.interruption.enabled, false);
    assert.deepEqual(AGENT_TURN_HANDLING.preemptiveGeneration, {
      enabled: false,
    });
    assert.equal(AGENT_TURN_HANDLING.turnDetection, "manual");
    assert.equal("endpointing" in AGENT_TURN_HANDLING, false);
    assert.equal("userTurnLimit" in AGENT_TURN_HANDLING, false);
  });

  it("passes manual turn handling into the running agent session", () => {
    const turnHandling = createAgentTurnHandling();

    assert.equal(
      turnHandling.interruption,
      AGENT_TURN_HANDLING.interruption,
    );
    assert.equal(
      turnHandling.preemptiveGeneration,
      AGENT_TURN_HANDLING.preemptiveGeneration,
    );
    assert.equal(turnHandling.turnDetection, "manual");
    assert.equal("endpointing" in turnHandling, false);
    assert.equal("userTurnLimit" in turnHandling, false);
  });
});

describe("conversation ingest client", () => {
  it("reports the exact running agent build and model versions", async () => {
    const calls = [];
    const client = createConversationIngestClient({
      baseUrl: "https://app.example.test/",
      build: {
        commitSha: "abc1234",
        details: {
          models: {
            realtime: "gpt-realtime-2.1-mini",
            transcription: "gpt-4o-mini-transcribe",
          },
        },
        version: "0.1.276",
      },
      fetch: async (...args) => {
        calls.push(args);
        return new Response(null, { status: 204 });
      },
      secret: "agent-secret",
    });

    await client.reportBuild("conversation-1", { phase: "optional" });

    assert.equal(
      calls[0][0],
      "https://app.example.test/api/conversations/conversation-1/facts",
    );
    assert.equal(calls[0][1].headers.Authorization, "Bearer agent-secret");
    const body = JSON.parse(calls[0][1].body);
    assert.deepEqual(body.candidates, []);
    assert.equal(body.controllerState.phase, "optional");
    assert.deepEqual(body.controllerState._buildInfo.agent, {
      commitSha: "abc1234",
      details: {
        models: {
          realtime: "gpt-realtime-2.1-mini",
          transcription: "gpt-4o-mini-transcribe",
        },
      },
      reportedAt: body.controllerState._buildInfo.agent.reportedAt,
      version: "0.1.276",
    });
    assert.equal(
      new Date(body.controllerState._buildInfo.agent.reportedAt).toISOString(),
      body.controllerState._buildInfo.agent.reportedAt,
    );
  });

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
