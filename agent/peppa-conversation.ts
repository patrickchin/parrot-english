import { llm, voice } from "@livekit/agents";
import { z } from "zod";
import {
  applyConversationObservation,
  createLearnerProfileConversationState,
  isConversationTerminal,
  nextConversationPrompt,
} from "../lib/conversation-scenario.js";
import type { ConversationPurpose } from "../lib/conversation-purpose.ts";
import type { ConversationIngestClient } from "./ingest-client.js";
import { INTRODUCTION_SYSTEM_PROMPT } from "./prompts/introduction.ts";
import { PROFILE_EDIT_SYSTEM_PROMPT } from "./prompts/profile-edit.ts";
import { SMALL_CHAT_SYSTEM_PROMPT } from "./prompts/small-chat.ts";

export const LEARNER_PROFILE_TOOL_NAMES = [
  "updateProfileSummary",
  "markObjectiveUnanswered",
  "finishConversation",
  "requestGentleRephrase",
] as const;

export const CONVERSATION_SYSTEM_PROMPTS: Record<ConversationPurpose, string> = {
  onboarding: INTRODUCTION_SYSTEM_PROMPT,
  "profile-edit": PROFILE_EDIT_SYSTEM_PROMPT,
  "small-chat": SMALL_CHAT_SYSTEM_PROMPT,
};

export function getConversationSystemPrompt(purpose: ConversationPurpose) {
  return CONVERSATION_SYSTEM_PROMPTS[purpose];
}

export const AGENT_SESSION_START_OPTIONS = { record: false } as const;

export const AGENT_TURN_HANDLING = {
  endpointing: {
    maxDelay: 1_200,
    minDelay: 300,
    mode: "dynamic",
  },
  interruption: {
    enabled: true,
    mode: "adaptive",
  },
  preemptiveGeneration: {
    enabled: true,
    preemptiveTts: true,
  },
  turnDetection: "inference",
} as const;

type ControllerState = Omit<
  ReturnType<typeof createLearnerProfileConversationState>,
  "finishReason"
> & { finishReason: string | null };

type CreateTaskOptions = {
  conversationId: string;
  ingest: ConversationIngestClient;
  initialState?: ControllerState;
  onEnded?: () => void;
  purpose?: Exclude<ConversationPurpose, "small-chat">;
};

function savedProfileContext(state: ControllerState) {
  if (!state.learnedName && !state.learnedAge && !state.profileSummary) return "";
  const savedProfile = JSON.stringify({
    age: state.profileAge,
    name: state.profileName,
    summary: state.profileSummary,
  });
  return `<SAVED_PROFILE>\n${savedProfile}\n</SAVED_PROFILE>`;
}

export function createGettingToKnowYouTask({
  conversationId,
  ingest,
  initialState = createLearnerProfileConversationState() as ControllerState,
  onEnded = () => {},
  purpose = "onboarding",
}: CreateTaskOptions) {
  let state = initialState;
  let completeTask: ((result: { finishReason: string | null }) => void) | null = null;
  let statePersistence = Promise.resolve();

  function persistState(controllerState: ControllerState) {
    const pendingUpdate = statePersistence
      .catch(() => {})
      .then(() => ingest.updateState(conversationId, controllerState));
    statePersistence = pendingUpdate;
    void pendingUpdate.catch((error: unknown) => {
      console.error("Could not persist learner-profile state", error);
    });
    return pendingUpdate;
  }

  async function transition(
    observation: {
      learnedAge?: boolean;
      learnedName?: boolean;
      outcome: string;
      profileAge?: number | null;
      profileName?: string | null;
      summary?: string;
    },
  ) {
    state = applyConversationObservation(state, observation) as ControllerState;
    const pendingStateUpdate = persistState(state);
    if (isConversationTerminal(state)) {
      await pendingStateUpdate;
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
      name: "updateProfileSummary",
      description:
        "Save one cumulative prose paragraph containing only details the child directly shared.",
      parameters: z.object({
        summary: z
          .string()
          .trim()
          .min(1)
          .max(2_000)
          .describe(
            "The complete current profile as one natural third-person paragraph, with no labels, bullets, or field names.",
          ),
        learnedName: z
          .boolean()
          .describe("True once the child has directly shared their name."),
        learnedAge: z
          .boolean()
          .describe("True once the child has directly shared their age."),
        profileName: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .nullable()
          .describe("The child's directly shared name, or null until known."),
        profileAge: z
          .number()
          .int()
          .nonnegative()
          .nullable()
          .describe("The child's directly shared age, or null until known."),
        outcome: z.literal("answered"),
      }),
      execute: async ({
        learnedAge,
        learnedName,
        outcome,
        profileAge,
        profileName,
        summary,
      }) =>
        transition({
          learnedAge,
          learnedName,
          outcome,
          profileAge,
          profileName,
          summary,
        }),
    }),
    llm.tool({
      name: "markObjectiveUnanswered",
      description:
        "Move on without pressure after uncertainty, refusal, silence, or a second failed clarification.",
      parameters: z.object({
        outcome: z.enum(["declined", "silence", "unknown", "unclear"]),
      }),
      execute: async ({ outcome }) => transition({ outcome }),
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
          }) as ControllerState;
        }
        state = { ...state, finishReason: reason };
        await persistState(state);
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
        "Use only for the first truly unclear or unrelated response; rephrase once in simple English.",
      parameters: z.object({ reason: z.enum(["off_topic", "unclear"]) }),
      execute: async ({ reason }) => transition({ outcome: reason }),
    }),
  ];

  const task = voice.AgentTask.create<{ finishReason: string | null }>({
    id: purpose === "onboarding" ? "learner_introduction" : "profile_edit",
    instructions: [getConversationSystemPrompt(purpose), savedProfileContext(initialState)]
      .filter(Boolean)
      .join("\n\n"),
    tools,
    onEnter(ctx) {
      completeTask = (result) => ctx.complete(result);
      ctx.session.generateReply({
        allowInterruptions: false,
      });
    },
  });

  return Object.assign(task, {
    waitForPendingStatePersistence() {
      return statePersistence.catch(() => {});
    },
  });
}

type CreatePeppaConversationTaskOptions = {
  conversationId: string;
  ingest: ConversationIngestClient;
  initialState?: ControllerState;
  onEnded?: () => void;
  purpose: ConversationPurpose;
};

export function createSmallChatTask({
  initialState = createLearnerProfileConversationState() as ControllerState,
}: Pick<CreatePeppaConversationTaskOptions, "initialState"> = {}) {
  const knownContext = savedProfileContext(initialState);
  const task = voice.AgentTask.create<{ finishReason: string | null }>({
    id: "small_chat",
    instructions: [getConversationSystemPrompt("small-chat"), knownContext]
      .filter(Boolean)
      .join("\n\n"),
    tools: [],
    onEnter(ctx) {
      ctx.session.generateReply({
        allowInterruptions: false,
      });
    },
  });

  return Object.assign(task, {
    waitForPendingStatePersistence() {
      return Promise.resolve();
    },
  });
}

export function createPeppaConversationTask(
  options: CreatePeppaConversationTaskOptions,
) {
  if (options.purpose === "small-chat") {
    return createSmallChatTask({ initialState: options.initialState });
  }
  return createGettingToKnowYouTask({ ...options, purpose: options.purpose });
}
