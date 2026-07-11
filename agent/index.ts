import { fileURLToPath } from "node:url";
import {
  AgentSessionEventTypes,
  ServerOptions,
  cli,
  defineAgent,
  inference,
  voice,
  type ChatMessage,
} from "@livekit/agents";
import type { AgentConfig } from "./config.ts";
import { readAgentConfig } from "./config.ts";
import {
  createConversationIngestClient,
  type AgentConversationTurn,
  type ConversationIngestClient,
} from "./ingest-client.ts";
import {
  AGENT_SESSION_START_OPTIONS,
  AGENT_TURN_HANDLING,
  ONBOARDING_AGENT_INSTRUCTIONS,
  createGettingToKnowYouTask,
} from "./onboarding-scenario.ts";
import { createOnboardingConversationState } from "../lib/conversation-scenario.js";

export function parseConversationParticipantMetadata(metadata: string) {
  let value: unknown;
  try {
    value = JSON.parse(metadata);
  } catch {
    throw new Error("Participant metadata must be valid JSON.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Participant metadata must contain conversationId.");
  }
  const conversationId = (value as Record<string, unknown>).conversationId;
  if (
    typeof conversationId !== "string" ||
    !conversationId.trim() ||
    conversationId.length > 200
  ) {
    throw new Error("Participant metadata must contain conversationId.");
  }
  const profile = (value as Record<string, unknown>).onboardingProfile;
  if (profile !== undefined && (
    profile === null ||
    typeof profile !== "object" ||
    Array.isArray(profile)
  )) {
    throw new Error("Participant metadata must contain a valid onboardingProfile.");
  }
  const profileRecord = (profile ?? {}) as Record<string, unknown>;
  const profileName = profileRecord.name;
  const profileAge = profileRecord.age;
  const profileSummary = profileRecord.summary;
  if (
    profileName !== undefined &&
    profileName !== null &&
    (typeof profileName !== "string" || !profileName.trim() || profileName.length > 120)
  ) {
    throw new Error("Participant metadata must contain a valid onboardingProfile.");
  }
  if (
    profileAge !== undefined &&
    profileAge !== null &&
    (!Number.isSafeInteger(profileAge) || Number(profileAge) < 0)
  ) {
    throw new Error("Participant metadata must contain a valid onboardingProfile.");
  }
  if (
    profileSummary !== undefined &&
    (typeof profileSummary !== "string" || profileSummary.length > 2_000)
  ) {
    throw new Error("Participant metadata must contain a valid onboardingProfile.");
  }
  return {
    conversationId: conversationId.trim(),
    initialState: createOnboardingConversationState({
      profileAge,
      profileName,
      profileSummary,
    }),
  };
}

export function createAgentModels(config: AgentConfig) {
  return {
    llm: new inference.LLM({
      apiKey: config.livekitApiKey,
      apiSecret: config.livekitApiSecret,
      model: config.llmModel,
      strictToolSchema: true,
    }),
    stt: new inference.STT({
      apiKey: config.livekitApiKey,
      apiSecret: config.livekitApiSecret,
      model: config.sttModel,
    }),
    tts: new inference.TTS({
      apiKey: config.livekitApiKey,
      apiSecret: config.livekitApiSecret,
      fallback: {
        extraKwargs: { emotion: "excited", speed: 1.05 },
        model: "cartesia/sonic-3",
        voice: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
      },
      model: config.ttsModel,
      voice: config.ttsVoiceId,
    }),
  };
}

export function conversationInputMode(
  role: "user" | "assistant",
  hasVoiceTranscript: boolean,
) {
  return role === "user" && !hasVoiceTranscript ? "text" : "voice";
}

function createTranscriptPersistence({
  conversationId,
  ingest,
}: {
  conversationId: string;
  ingest: ConversationIngestClient;
}) {
  let sequence = 0;
  let chain = Promise.resolve();
  let ended = false;
  const pendingUserTranscripts = new Map<
    string,
    { createdAt: number; language: string | null; text: string }
  >();
  const persistedItemIds = new Set<string>();

  function enqueueTurn(turn: Omit<AgentConversationTurn, "sequence">) {
    const itemSequence = sequence;
    sequence += 1;
    chain = chain
      .then(() => ingest.appendTurn(conversationId, { ...turn, sequence: itemSequence }))
      .catch((error: unknown) => {
        console.error("Could not persist conversation turn", error);
      });
  }

  function rememberUserTranscript(event: {
    createdAt: number;
    isFinal: boolean;
    itemId: string | null;
    language: string | null;
    transcript: string;
  }) {
    if (!event.isFinal || !event.transcript.trim()) return;
    const itemId = event.itemId ?? `user-input-${event.createdAt}`;
    pendingUserTranscripts.set(itemId, {
      createdAt: event.createdAt,
      language: event.language,
      text: event.transcript.trim(),
    });
  }

  function persistConversationItem(item: ChatMessage) {
    if (
      (item.role !== "user" && item.role !== "assistant") ||
      !item.textContent?.trim() ||
      persistedItemIds.has(item.id)
    ) {
      return;
    }
    persistedItemIds.add(item.id);
    const pending = pendingUserTranscripts.get(item.id);
    pendingUserTranscripts.delete(item.id);
    enqueueTurn({
      inputMode: conversationInputMode(item.role, pending !== undefined),
      interrupted: item.interrupted,
      language: pending?.language ?? null,
      providerItemId: item.id,
      role: item.role,
      startedAt: item.createdAt,
      text: item.textContent.trim(),
    });
  }

  async function finish(
    status: "disconnected" | "failed" | "abandoned",
    reason: string,
  ) {
    for (const [providerItemId, pending] of pendingUserTranscripts) {
      if (persistedItemIds.has(providerItemId)) continue;
      enqueueTurn({
        inputMode: "voice",
        interrupted: false,
        language: pending.language,
        providerItemId,
        role: "user",
        startedAt: pending.createdAt,
        text: pending.text,
      });
    }
    pendingUserTranscripts.clear();
    await chain;
    if (!ended) {
      ended = true;
      await ingest.endConversation(conversationId, status, reason);
    }
  }

  return {
    finish,
    markEnded() {
      ended = true;
    },
    persistConversationItem,
    rememberUserTranscript,
  };
}

export const agentDefinition = defineAgent({
  entry: async (ctx) => {
    const config = readAgentConfig();
    const ingest = createConversationIngestClient({
      baseUrl: config.ingestUrl,
      secret: config.ingestSecret,
    });
    const models = createAgentModels(config);

    await ctx.connect();
    const participant = await ctx.waitForParticipant();
    const { conversationId, initialState } = parseConversationParticipantMetadata(
      participant.metadata,
    );
    const persistence = createTranscriptPersistence({ conversationId, ingest });

    const task = createGettingToKnowYouTask({
      conversationId,
      ingest,
      initialState,
      onEnded: persistence.markEnded,
    });
    const rootAgent = voice.Agent.create({
      id: "onboarding_root",
      instructions: ONBOARDING_AGENT_INSTRUCTIONS,
      async onEnter(agentContext) {
        await task.run();
        await agentContext.session.say("Thanks for chatting with me!", {
          allowInterruptions: true,
        });
        await agentContext.session.close();
      },
    });
    const session = new voice.AgentSession({
      llm: models.llm,
      maxToolSteps: 2,
      stt: models.stt,
      tts: models.tts,
      turnHandling: {
        endpointing: AGENT_TURN_HANDLING.endpointing,
        interruption: AGENT_TURN_HANDLING.interruption,
        turnDetection: new inference.TurnDetector(),
        userTurnLimit: { maxDuration: 30_000, maxWords: 40 },
      },
    });

    session.on(AgentSessionEventTypes.UserInputTranscribed, (event) => {
      persistence.rememberUserTranscript(event);
    });
    session.on(AgentSessionEventTypes.ConversationItemAdded, (event) => {
      if (event.item.type === "message") {
        persistence.persistConversationItem(event.item);
      }
    });
    session.on(AgentSessionEventTypes.Close, (event) => {
      void persistence
        .finish(event.error ? "failed" : "disconnected", String(event.reason))
        .catch((error: unknown) => {
          console.error("Could not finalize conversation transcript", error);
        });
    });
    ctx.addShutdownCallback(() =>
      persistence.finish("abandoned", "agent_job_shutdown"),
    );

    await session.start({
      agent: rootAgent,
      inputOptions: {
        audioEnabled: true,
        closeOnDisconnect: true,
        textEnabled: true,
      },
      outputOptions: {
        audioEnabled: true,
        transcriptionEnabled: true,
      },
      record: AGENT_SESSION_START_OPTIONS.record,
      room: ctx.room,
    });
  },
});

export default agentDefinition;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = readAgentConfig();
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      apiKey: config.livekitApiKey,
      apiSecret: config.livekitApiSecret,
      wsURL: config.livekitUrl,
    }),
  );
}
