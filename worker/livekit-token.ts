import {
  AccessToken,
  RoomAgentDispatch,
  RoomConfiguration,
} from "livekit-server-sdk";
import { isConversationPurpose } from "../lib/conversation-purpose.ts";
import {
  DEFAULT_TALK_TO_PEPPA_PROMPT_STYLE,
  isTalkToPeppaPromptStyle,
  type TalkToPeppaPromptStyle,
} from "../lib/talk-to-peppa-prompt-style.ts";
import type { LearnerIdentity } from "./request-identity.ts";

export const LIVEKIT_PARTICIPANT_TOKEN_LIFETIME_MS = 10 * 60 * 1_000;

export interface LiveKitTokenEnv {
  LIVEKIT_AGENT_NAME?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
}

type TokenInput = {
  env: LiveKitTokenEnv;
  conversation: { id: string; roomName: string; scenarioKey: string };
  identity: LearnerIdentity;
  initialState?: Record<string, unknown>;
  now?: Date;
  promptStyle?: TalkToPeppaPromptStyle;
};

function required(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`${name} is not configured.`);
  return value.trim();
}

export async function createLiveKitParticipantToken({
  env,
  conversation,
  identity,
  initialState,
  promptStyle,
}: TokenInput) {
  if (!isConversationPurpose(conversation.scenarioKey)) {
    throw new Error("Conversation purpose is invalid.");
  }
  const resolvedPromptStyle =
    conversation.scenarioKey === "small-chat"
      ? promptStyle ?? DEFAULT_TALK_TO_PEPPA_PROMPT_STYLE
      : undefined;
  if (
    (resolvedPromptStyle !== undefined &&
      !isTalkToPeppaPromptStyle(resolvedPromptStyle)) ||
    (conversation.scenarioKey !== "small-chat" && promptStyle !== undefined)
  ) {
    throw new Error("Conversation prompt style is invalid.");
  }
  const token = new AccessToken(
    required(env.LIVEKIT_API_KEY, "LIVEKIT_API_KEY"),
    required(env.LIVEKIT_API_SECRET, "LIVEKIT_API_SECRET"),
    {
      identity: `learner:${identity.userId}:${conversation.id}`,
      metadata: JSON.stringify({
        conversationId: conversation.id,
        learnerProfile: {
          age: initialState?.profileAge ?? null,
          name: initialState?.profileName ?? null,
          summary: initialState?.profileSummary ?? "",
        },
        ...(resolvedPromptStyle ? { promptStyle: resolvedPromptStyle } : {}),
        scenarioKey: conversation.scenarioKey,
      }),
      ttl: LIVEKIT_PARTICIPANT_TOKEN_LIFETIME_MS / 1_000,
    },
  );
  token.addGrant({ roomJoin: true, room: conversation.roomName });
  const agentName = env.LIVEKIT_AGENT_NAME?.trim();
  if (agentName) {
    token.roomConfig = new RoomConfiguration({
      agents: [new RoomAgentDispatch({ agentName })],
    });
  }
  return token.toJwt();
}
