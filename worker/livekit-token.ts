import {
  AccessToken,
  RoomAgentDispatch,
  RoomConfiguration,
} from "livekit-server-sdk";
import { isConversationPurpose } from "../lib/conversation-purpose.ts";
import type { LearnerProfileIdentity } from "./learner-profile.ts";

export interface LiveKitTokenEnv {
  LIVEKIT_AGENT_NAME?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
}

type TokenInput = {
  env: LiveKitTokenEnv;
  conversation: { id: string; roomName: string; scenarioKey: string };
  identity: LearnerProfileIdentity;
  initialState?: Record<string, unknown>;
  now?: Date;
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
}: TokenInput) {
  if (!isConversationPurpose(conversation.scenarioKey)) {
    throw new Error("Conversation purpose is invalid.");
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
        scenarioKey: conversation.scenarioKey,
      }),
      ttl: "10m",
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
