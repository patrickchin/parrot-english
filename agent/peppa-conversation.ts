import { llm, voice } from "@livekit/agents";
import { z } from "zod";
import { createLearnerProfileConversationState } from "../lib/conversation-scenario.js";
import type { ConversationPurpose } from "../lib/conversation-purpose.ts";
import {
  containsLikelyFullLearnerName,
  containsPrivateLearnerProfileDetails,
  PREFERRED_NAME_FIELD_ERROR,
} from "../lib/learner-profile-privacy.ts";
import {
  DEFAULT_TALK_TO_PEPPA_PROMPT_STYLE,
  type TalkToPeppaPromptStyle,
} from "../lib/talk-to-peppa-prompt-style.ts";
import type { ConversationIngestClient } from "./ingest-client.ts";
import { INTRODUCTION_SYSTEM_PROMPT } from "./prompts/introduction.ts";
import { PROFILE_EDIT_SYSTEM_PROMPT } from "./prompts/profile-edit.ts";
import {
  getSmallChatSystemPrompt,
  SMALL_CHAT_SYSTEM_PROMPT,
} from "./prompts/small-chat.ts";

export const CONVERSATION_SYSTEM_PROMPTS: Record<ConversationPurpose, string> = {
  onboarding: INTRODUCTION_SYSTEM_PROMPT,
  "profile-edit": PROFILE_EDIT_SYSTEM_PROMPT,
  "small-chat": SMALL_CHAT_SYSTEM_PROMPT,
};

export function getConversationSystemPrompt(
  purpose: ConversationPurpose,
  promptStyle: TalkToPeppaPromptStyle = DEFAULT_TALK_TO_PEPPA_PROMPT_STYLE,
) {
  return purpose === "small-chat"
    ? getSmallChatSystemPrompt(promptStyle)
    : CONVERSATION_SYSTEM_PROMPTS[purpose];
}

export const AGENT_SESSION_START_OPTIONS = { record: false } as const;

export const AGENT_ROOM_LIFECYCLE_OPTIONS = {
  closeOnDisconnect: true,
  deleteRoomOnClose: true,
} as const;

export const AGENT_TURN_HANDLING = {
  interruption: {
    enabled: false,
  },
  preemptiveGeneration: {
    enabled: false,
  },
  turnDetection: "manual",
} as const;

export const CONVERSATION_END_REASONS = [
  "child_requested",
  "conversation_complete",
] as const;

export type ConversationEndReason = (typeof CONVERSATION_END_REASONS)[number];

type ConversationTaskResult = {
  finishReason: ConversationEndReason;
};

export function conversationEndStatus(reason: ConversationEndReason) {
  return reason === "child_requested" ? "stopped" : "completed";
}

type ControllerState = Omit<
  ReturnType<typeof createLearnerProfileConversationState>,
  "finishReason"
> & { finishReason: string | null };

type CreateTaskOptions = {
  conversationId?: string;
  ingest?: ConversationIngestClient;
  initialState?: ControllerState;
  promptStyle?: TalkToPeppaPromptStyle;
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
  getCompleteTask,
  ingest,
  initialState,
}: {
  conversationId: string;
  getCompleteTask: () => (result: ConversationTaskResult) => void;
  ingest: ConversationIngestClient;
  initialState: ControllerState;
}) {
  let state = initialState;

  return llm.tool({
    name: "updateLearnerProfile",
    description:
      "Save the learner's current preferred name, age, and About paragraph, then end the profile-edit conversation.",
    parameters: z.object({
      name: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .describe("The learner's first name or nickname only."),
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
      const completeTask = getCompleteTask();
      const hasPrivateDetails = containsPrivateLearnerProfileDetails(name, about);
      const hasFullName = containsLikelyFullLearnerName(name, about);
      if (hasPrivateDetails || hasFullName) {
        const isUnchangedSavedProfile =
          state.learnedName &&
          state.learnedAge &&
          name === state.profileName &&
          age === state.profileAge &&
          about === state.profileSummary;
        if (!isUnchangedSavedProfile) {
          if (hasPrivateDetails) {
            throw new Error("Learner profiles cannot include private details.");
          }
          throw new Error(PREFERRED_NAME_FIELD_ERROR);
        }
        completeTask({ finishReason: "conversation_complete" });
        return { ending: true, saved: true };
      }
      state = {
        ...state,
        learnedAge: true,
        learnedName: true,
        profileAge: age,
        profileName: name,
        profileSummary: about,
      };
      await ingest.updateState(conversationId, state);
      completeTask({ finishReason: "conversation_complete" });
      return { ending: true, saved: true };
    },
    onDuplicate: "reject",
  });
}

function createConversationTask({
  conversationId,
  ingest,
  initialState = createLearnerProfileConversationState() as ControllerState,
  promptStyle = DEFAULT_TALK_TO_PEPPA_PROMPT_STYLE,
  purpose = "onboarding",
}: CreateTaskOptions = {}) {
  if (purpose === "profile-edit" && (!conversationId || !ingest)) {
    throw new Error("Profile editing requires conversation persistence.");
  }
  let completeTask: ((result: ConversationTaskResult) => void) | null = null;
  const getCompleteTask = () => {
    if (!completeTask) {
      throw new Error("The conversation task has not started.");
    }
    return completeTask;
  };
  const profileEditTools =
    purpose === "profile-edit"
      ? [
          createProfileEditTool({
            conversationId: conversationId!,
            getCompleteTask,
            ingest: ingest!,
            initialState,
          }),
        ]
      : [];
  const tools = [
    ...profileEditTools,
    llm.tool({
      name: "endConversation",
      description:
        "End this short voice conversation when the child asks to stop or says goodbye, or when the stated conversation goal is complete. Do not use this for silence, uncertainty, or a short answer.",
      parameters: z.object({
        reason: z
          .enum(CONVERSATION_END_REASONS)
          .describe(
            "child_requested when the child wants to stop; conversation_complete when the short conversation has naturally reached its goal.",
          ),
      }),
      execute: async ({ reason }) => {
        getCompleteTask()({ finishReason: reason });
        return { ending: true };
      },
      onDuplicate: "reject",
    }),
  ];
  const task = voice.AgentTask.create<ConversationTaskResult>({
    id:
      purpose === "onboarding"
        ? "learner_introduction"
        : purpose === "profile-edit"
          ? "profile_edit"
          : "small_chat",
    instructions: [
      getConversationSystemPrompt(purpose, promptStyle),
      savedProfileContext(initialState),
    ]
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
  return task;
}

export function createGettingToKnowYouTask(options: CreateTaskOptions = {}) {
  return createConversationTask(options);
}

export function createSmallChatTask({
  initialState = createLearnerProfileConversationState() as ControllerState,
  promptStyle = DEFAULT_TALK_TO_PEPPA_PROMPT_STYLE,
}: Pick<CreateTaskOptions, "initialState" | "promptStyle"> = {}) {
  return createConversationTask({
    initialState,
    promptStyle,
    purpose: "small-chat",
  });
}

export function createPeppaConversationTask(options: {
  conversationId: string;
  ingest: ConversationIngestClient;
  initialState?: ControllerState;
  promptStyle?: TalkToPeppaPromptStyle;
  purpose: ConversationPurpose;
}) {
  if (options.purpose === "small-chat") {
    return createSmallChatTask({
      initialState: options.initialState,
      promptStyle: options.promptStyle,
    });
  }
  return createGettingToKnowYouTask(options);
}

type ConversationClosingSession = Pick<
  voice.AgentSession,
  "close" | "generateReply"
>;

export async function playConversationGoodbyeAndClose(
  session: ConversationClosingSession,
  beforeClose: () => Promise<void> = async () => {},
) {
  const goodbye = session.generateReply({
    allowInterruptions: true,
    instructions: 'Say exactly: "Thanks for chatting with me!"',
  });
  await goodbye.waitForPlayout();
  try {
    await beforeClose();
  } finally {
    await session.close();
  }
}
