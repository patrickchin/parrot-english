import { fileURLToPath } from "node:url";
import {
  AgentSessionEventTypes,
  ServerOptions,
  cli,
  defineAgent,
  voice,
  type ChatMessage,
} from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import {
  COMMIT_USER_TURN_COMMAND,
  REPEAT_LAST_AUDIO_COMMAND,
} from "../lib/conversation-audio.js";
import { isConversationPurpose } from "../lib/conversation-purpose.ts";
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
  createPeppaConversationTask,
  getConversationSystemPrompt,
} from "./peppa-conversation.ts";
import { createLearnerProfileConversationState } from "../lib/conversation-scenario.js";

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
  const purpose = (value as Record<string, unknown>).scenarioKey;
  if (
    typeof conversationId !== "string" ||
    !conversationId.trim() ||
    conversationId.length > 200
  ) {
    throw new Error("Participant metadata must contain conversationId.");
  }
  if (!isConversationPurpose(purpose)) {
    throw new Error("Participant metadata must contain a valid scenarioKey.");
  }
  const profile = (value as Record<string, unknown>).learnerProfile;
  if (profile !== undefined && (
    profile === null ||
    typeof profile !== "object" ||
    Array.isArray(profile)
  )) {
    throw new Error("Participant metadata must contain a valid learnerProfile.");
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
    throw new Error("Participant metadata must contain a valid learnerProfile.");
  }
  if (
    profileAge !== undefined &&
    profileAge !== null &&
    (!Number.isSafeInteger(profileAge) || Number(profileAge) < 0)
  ) {
    throw new Error("Participant metadata must contain a valid learnerProfile.");
  }
  if (
    profileSummary !== undefined &&
    (typeof profileSummary !== "string" || profileSummary.length > 2_000)
  ) {
    throw new Error("Participant metadata must contain a valid learnerProfile.");
  }
  return {
    conversationId: conversationId.trim(),
    initialState: createLearnerProfileConversationState({
      profileAge,
      profileName,
      profileSummary,
    }),
    purpose,
  };
}

export function createAgentModels(config: AgentConfig) {
  return {
    realtime: new openai.realtime.RealtimeModel({
      apiKey: config.openaiApiKey,
      inputAudioTranscription: {
        language: "en",
        model: config.transcriptionModel,
      },
      model: config.realtimeModel,
      reasoning: { effort: "low" },
      turnDetection: null,
      voice: config.realtimeVoice,
    }),
  };
}

export function conversationInputMode(
  role: "user" | "assistant",
  hasVoiceTranscript: boolean,
) {
  return role === "user" && !hasVoiceTranscript ? "text" : "voice";
}

type ConversationTextSession = Pick<
  voice.AgentSession,
  "commitUserTurn" | "generateReply" | "interrupt"
>;

export function createConversationTextInputCallback(
  latestAssistantText: () => string,
) {
  return (
    session: ConversationTextSession,
    event: { text: string },
  ) => {
    if (event.text.trim() === COMMIT_USER_TURN_COMMAND) {
      session.commitUserTurn();
      return;
    }
    if (event.text.trim() === REPEAT_LAST_AUDIO_COMMAND) {
      const text = latestAssistantText().trim();
      if (text) {
        session.generateReply({
          allowInterruptions: true,
          instructions: `Repeat exactly this previous assistant sentence with no extra words: ${JSON.stringify(text)}`,
        });
      }
      return;
    }
    session.interrupt();
    session.generateReply({ userInput: event.text });
  };
}

type ConversationClosingSession = Pick<
  voice.AgentSession,
  "close" | "generateReply"
>;

export async function playConversationGoodbyeAndClose(
  session: ConversationClosingSession,
) {
  const goodbye = session.generateReply({
    allowInterruptions: true,
    instructions: 'Say exactly: "Thanks for chatting with me!"',
  });
  await goodbye.waitForPlayout();
  await session.close();
}

export function createAgentTurnHandling() {
  return {
    interruption: AGENT_TURN_HANDLING.interruption,
    preemptiveGeneration: AGENT_TURN_HANDLING.preemptiveGeneration,
    turnDetection: AGENT_TURN_HANDLING.turnDetection,
  };
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
    persistConversationItem,
    rememberUserTranscript,
  };
}

export const agentDefinition = defineAgent({
  entry: async (ctx) => {
    const config = readAgentConfig();
    const ingest = createConversationIngestClient({
      baseUrl: config.ingestUrl,
      build: {
        commitSha: config.commitSha,
        details: {
          models: {
            realtime: config.realtimeModel,
            transcription: config.transcriptionModel,
          },
        },
        version: config.buildVersion,
      },
      secret: config.ingestSecret,
    });
    const models = createAgentModels(config);

    await ctx.connect();
    const participant = await ctx.waitForParticipant();
    const { conversationId, initialState, purpose } = parseConversationParticipantMetadata(
      participant.metadata,
    );
    await ingest.reportBuild(conversationId, initialState).catch((error: unknown) => {
      console.error("Could not report conversation agent build", error);
    });
    const persistence = createTranscriptPersistence({ conversationId, ingest });
    let latestAssistantText = "";

    const task = createPeppaConversationTask({
      initialState,
      purpose,
    });
    const rootAgent = voice.Agent.create({
      id: "peppa_conversation_root",
      instructions: getConversationSystemPrompt(purpose),
      async onEnter(agentContext) {
        await task.run();
        await playConversationGoodbyeAndClose(agentContext.session);
      },
    });
    const session = new voice.AgentSession({
      llm: models.realtime,
      turnHandling: createAgentTurnHandling(),
    });

    session.on(AgentSessionEventTypes.UserInputTranscribed, (event) => {
      persistence.rememberUserTranscript(event);
    });
    session.on(AgentSessionEventTypes.ConversationItemAdded, (event) => {
      if (event.item.type === "message") {
        if (event.item.role === "assistant" && event.item.textContent?.trim()) {
          latestAssistantText = event.item.textContent.trim();
        }
        persistence.persistConversationItem(event.item);
      }
    });
    session.on(AgentSessionEventTypes.Close, (event) => {
      void persistence
        .finish(
          event.error ? "failed" : "disconnected",
          String(event.reason),
        )
        .catch((error: unknown) => {
          console.error("Could not finalize conversation transcript", error);
        });
    });
    ctx.addShutdownCallback(async () => {
      await persistence.finish("abandoned", "agent_job_shutdown");
    });

    await session.start({
      agent: rootAgent,
      inputOptions: {
        audioEnabled: true,
        closeOnDisconnect: true,
        textEnabled: true,
        textInputCallback: createConversationTextInputCallback(
          () => latestAssistantText,
        ),
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
      agentName: config.agentName,
      apiKey: config.livekitApiKey,
      apiSecret: config.livekitApiSecret,
      wsURL: config.livekitUrl,
    }),
  );
}
