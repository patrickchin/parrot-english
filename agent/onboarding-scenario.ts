import { llm, voice } from "@livekit/agents";
import { z } from "zod";
import {
  applyConversationObservation,
  createOnboardingConversationState,
  isConversationTerminal,
  nextConversationPrompt,
} from "../lib/conversation-scenario.js";
import type {
  AgentCandidateFact,
  ConversationIngestClient,
} from "./ingest-client.js";

export const ONBOARDING_TOOL_NAMES = [
  "recordCandidateFacts",
  "markObjectiveUnanswered",
  "finishConversation",
  "requestGentleRephrase",
] as const;

export const ONBOARDING_AGENT_INSTRUCTIONS = `
You are a warm, playful pig friend helping a young child with one short
getting-to-know-you conversation. You are an original Parrot English friend.
Never say you are a named television character and never discuss voice identity.

Stay inside this onboarding task. Ask one short English question at a time.
Collect name and age in either order, then have at most three optional exchanges
about activities, animals, cartoons, food, music, or stories. Follow the objective
returned by the tools. Do not answer or explore unrelated topics; warmly say you
need to finish getting to know them and return to the current objective.

Never pressure the child. "I don't know", silence, uncertainty, and refusal are
valid. After an unclear or off-topic answer, request at most one gentle rephrase.
Only when the tool result says includeChineseHint=true, add one brief Chinese hint
after the English question. Otherwise speak English only. Keep every spoken turn
to one or two short child-friendly sentences.

After every child turn, call exactly one appropriate state tool before speaking
again. Do not invent or retain facts outside the tool schema. When the state is
closing, thank the child briefly and finish. Never begin general open-ended chat.
`.trim();

export const AGENT_SESSION_START_OPTIONS = { record: false } as const;

export const AGENT_TURN_HANDLING = {
  endpointing: {
    maxDelay: 2_500,
    minDelay: 500,
    mode: "dynamic",
  },
  interruption: {
    enabled: true,
    mode: "adaptive",
  },
  turnDetection: "inference",
} as const;

const interestTopicSchema = z.enum([
  "activities",
  "animals",
  "cartoons",
  "food",
  "music",
  "stories",
]);

const candidateFactSchema = z.discriminatedUnion("key", [
  z.object({ key: z.literal("name"), value: z.string().trim().min(1).max(120) }),
  z.object({ key: z.literal("age"), value: z.number().int().min(3).max(17) }),
  z.object({
    key: z.literal("interest"),
    topic: interestTopicSchema,
    value: z.string().trim().min(1).max(240),
  }),
]);

const candidateFactToolSchema = z.object({
  key: z.enum(["name", "age", "interest"]),
  topic: z
    .enum(["none", "activities", "animals", "cartoons", "food", "music", "stories"])
    .describe("Use none for name or age; otherwise select the matching interest topic."),
  value: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .describe("Use decimal digits for age, for example 8."),
});

function normalizeToolCandidateFact(
  fact: z.infer<typeof candidateFactToolSchema>,
) {
  if (fact.key === "age") {
    return candidateFactSchema.parse({
      key: fact.key,
      value: Number(fact.value),
    });
  }
  if (fact.key === "interest") {
    return candidateFactSchema.parse({
      key: fact.key,
      topic: fact.topic,
      value: fact.value,
    });
  }
  return candidateFactSchema.parse({ key: fact.key, value: fact.value });
}

type ControllerState = Omit<
  ReturnType<typeof createOnboardingConversationState>,
  "finishReason"
> & { finishReason: string | null };

type CreateTaskOptions = {
  conversationId: string;
  createId?: () => string;
  ingest: ConversationIngestClient;
  initialState?: ControllerState;
  onEnded?: () => void;
};

export function createGettingToKnowYouTask({
  conversationId,
  createId = () => crypto.randomUUID(),
  ingest,
  initialState = createOnboardingConversationState() as ControllerState,
  onEnded = () => {},
}: CreateTaskOptions) {
  let state = initialState;
  let completeTask: ((result: { finishReason: string | null }) => void) | null = null;
  const candidateIds = new Map<string, string>();

  function candidateId(fact: Record<string, unknown>) {
    const semanticKey =
      fact.key === "interest" ? `interest:${String(fact.topic)}` : String(fact.key);
    const existing = candidateIds.get(semanticKey);
    if (existing) return existing;
    const id = createId();
    candidateIds.set(semanticKey, id);
    return id;
  }

  async function transition(
    observation: { outcome: string; facts: Array<Record<string, unknown>> },
  ) {
    state = applyConversationObservation(state, observation) as ControllerState;
    const candidates: AgentCandidateFact[] = observation.facts.map((fact) => ({
      id: candidateId(fact),
      key: fact.key as AgentCandidateFact["key"],
      sourceTurnIds: [],
      ...(fact.topic === undefined ? {} : { topic: String(fact.topic) }),
      value: fact.value as string | number,
    }));
    await ingest.upsertFacts(conversationId, candidates, state);
    if (isConversationTerminal(state)) {
      await ingest.endConversation(
        conversationId,
        state.finishReason === "child_stopped" ? "stopped" : "completed",
        state.finishReason ?? "completed",
      );
      onEnded();
      completeTask?.({ finishReason: state.finishReason });
    }
    return { nextPrompt: nextConversationPrompt(state), state };
  }

  const tools = [
    llm.tool({
      name: "recordCandidateFacts",
      description:
        "Record only facts directly stated by the child, then get the next bounded objective.",
      parameters: z.object({
        facts: z.array(candidateFactToolSchema).min(1).max(5),
        nextInterestTopic: z
          .enum(["activities", "animals", "cartoons", "food", "music", "stories"])
          .nullable(),
        outcome: z.literal("answered"),
      }),
      execute: async ({ facts, outcome }) =>
        transition({
          outcome,
          facts: facts.map(normalizeToolCandidateFact) as Array<
            Record<string, unknown>
          >,
        }),
    }),
    llm.tool({
      name: "markObjectiveUnanswered",
      description:
        "Move on without pressure after uncertainty, refusal, silence, or a second failed clarification.",
      parameters: z.object({
        outcome: z.enum(["declined", "silence", "unknown", "unclear"]),
      }),
      execute: async ({ outcome }) => transition({ outcome, facts: [] }),
    }),
    llm.tool({
      name: "finishConversation",
      description: "Finish immediately when the child asks to stop or the bounded task is done.",
      parameters: z.object({
        reason: z.enum(["child_stopped", "finished_by_learner", "task_complete"]),
      }),
      execute: async ({ reason }) => {
        if (!isConversationTerminal(state)) {
          state = applyConversationObservation(state, {
            outcome: "stop",
            facts: [],
          }) as ControllerState;
        }
        state = { ...state, finishReason: reason };
        await ingest.upsertFacts(conversationId, [], state);
        await ingest.endConversation(
          conversationId,
          reason === "task_complete" ? "completed" : "stopped",
          reason,
        );
        onEnded();
        completeTask?.({ finishReason: reason });
        return { nextPrompt: nextConversationPrompt(state), state };
      },
    }),
    llm.tool({
      name: "requestGentleRephrase",
      description:
        "Use only for the first unclear or off-topic response; the returned prompt controls the Chinese hint.",
      parameters: z.object({ reason: z.enum(["off_topic", "unclear"]) }),
      execute: async ({ reason }) => transition({ outcome: reason, facts: [] }),
    }),
  ];

  return voice.AgentTask.create<{ finishReason: string | null }>({
    id: "getting_to_know_you",
    instructions: ONBOARDING_AGENT_INSTRUCTIONS,
    tools,
    onEnter(ctx) {
      completeTask = (result) => ctx.complete(result);
      ctx.session.generateReply({
        allowInterruptions: true,
        instructions:
          "Greet the child in one short sentence, then ask their name. Do not call a tool before the first answer.",
      });
    },
  });
}
