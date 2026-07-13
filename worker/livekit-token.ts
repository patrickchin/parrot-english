import {
  AccessToken,
  RoomAgentDispatch,
  RoomConfiguration,
} from "livekit-server-sdk";
import type { OnboardingIdentity } from "./onboarding.ts";

export const LIVEKIT_PARTICIPANT_TOKEN_LIFETIME_MS = 10 * 60 * 1_000;

export interface LiveKitTokenEnv {
  LIVEKIT_AGENT_NAME?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
}

type TokenInput = {
  env: LiveKitTokenEnv;
  conversation: { id: string; roomName: string };
  identity: OnboardingIdentity;
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
  const token = new AccessToken(
    required(env.LIVEKIT_API_KEY, "LIVEKIT_API_KEY"),
    required(env.LIVEKIT_API_SECRET, "LIVEKIT_API_SECRET"),
    {
      identity: `learner:${identity.userId}:${conversation.id}`,
      metadata: JSON.stringify({
        conversationId: conversation.id,
        onboardingProfile: {
          age: initialState?.profileAge ?? null,
          name: initialState?.profileName ?? null,
          summary: initialState?.profileSummary ?? "",
        },
        scenarioKey: "onboarding",
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
