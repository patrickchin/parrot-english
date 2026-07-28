import { llm, voice } from "@livekit/agents";
import { z } from "zod";
import { createLearnerProfileConversationState } from "../lib/conversation-scenario.js";
import type { ConversationPurpose } from "../lib/conversation-purpose.ts";
import type { ConversationIngestClient } from "./ingest-client.ts";
import { INTRODUCTION_SYSTEM_PROMPT } from "./prompts/introduction.ts";
import { PROFILE_EDIT_SYSTEM_PROMPT } from "./prompts/profile-edit.ts";
import { SMALL_CHAT_SYSTEM_PROMPT } from "./prompts/small-chat.ts";

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
  interruption: {
    enabled: false,
  },
  preemptiveGeneration: {
    enabled: false,
  },
  turnDetection: "manual",
} as const;

type ControllerState = Omit<
  ReturnType<typeof createLearnerProfileConversationState>,
  "finishReason"
> & { finishReason: string | null };

type CreateTaskOptions = {
  conversationId?: string;
  ingest?: ConversationIngestClient;
  initialState?: ControllerState;
  purpose?: ConversationPurpose;
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

function createProfileEditTool({
  conversationId,
  ingest,
  initialState,
}: {
  conversationId: string;
  ingest: ConversationIngestClient;
  initialState: ControllerState;
}) {
  let state = initialState;

  return llm.tool({
    name: "updateLearnerProfile",
    description:
      "Save the learner's complete current name, age, and About paragraph after they clearly change or add profile information.",
    parameters: z.object({
      name: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .describe("The learner's complete current name."),
      age: z
        .number()
        .int()
        .nonnegative()
        .describe("The learner's complete current age in whole years."),
      about: z
        .string()
        .trim()
        .min(1)
        .max(2_000)
        .describe(
          "The complete current About profile as one natural third-person paragraph.",
        ),
    }),
    execute: async ({ about, age, name }) => {
      state = {
        ...state,
        learnedAge: true,
        learnedName: true,
        profileAge: age,
        profileName: name,
        profileSummary: about,
      };
      await ingest.updateState(conversationId, state);
      return { saved: true };
    },
  });
}

function createConversationTask({
  conversationId,
  ingest,
  initialState = createLearnerProfileConversationState() as ControllerState,
  purpose = "onboarding",
}: CreateTaskOptions = {}) {
  if (purpose === "profile-edit" && (!conversationId || !ingest)) {
    throw new Error("Profile editing requires conversation persistence.");
  }
  const tools =
    purpose === "profile-edit"
      ? [
          createProfileEditTool({
            conversationId: conversationId!,
            ingest: ingest!,
            initialState,
          }),
        ]
      : [];
  const task = voice.AgentTask.create<{ finishReason: string | null }>({
    id:
      purpose === "onboarding"
        ? "learner_introduction"
        : purpose === "profile-edit"
          ? "profile_edit"
          : "small_chat",
    instructions: [getConversationSystemPrompt(purpose), savedProfileContext(initialState)]
      .filter(Boolean)
      .join("\n\n"),
    tools,
    onEnter(ctx) {
      ctx.session.generateReply({
        allowInterruptions: false,
      });
    },
  });
  return task;
}

export function createGettingToKnowYouTask(options: CreateTaskOptions = {}) {
  return createConversationTask(options);
}

export function createSmallChatTask({
  initialState = createLearnerProfileConversationState() as ControllerState,
}: Pick<CreateTaskOptions, "initialState"> = {}) {
  return createConversationTask({ initialState, purpose: "small-chat" });
}

export function createPeppaConversationTask(options: {
  conversationId: string;
  ingest: ConversationIngestClient;
  initialState?: ControllerState;
  purpose: ConversationPurpose;
}) {
  if (options.purpose === "small-chat") {
    return createSmallChatTask({ initialState: options.initialState });
  }
  return createGettingToKnowYouTask(options);
}
