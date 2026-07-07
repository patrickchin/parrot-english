import { AccessToken } from "livekit-server-sdk";
import type { OnboardingIdentity } from "./onboarding.ts";

export interface LiveKitTokenEnv {
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
}

type TokenInput = {
  env: LiveKitTokenEnv;
  conversation: { id: string; roomName: string };
  identity: OnboardingIdentity;
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
}: TokenInput) {
  const token = new AccessToken(
    required(env.LIVEKIT_API_KEY, "LIVEKIT_API_KEY"),
    required(env.LIVEKIT_API_SECRET, "LIVEKIT_API_SECRET"),
    {
      identity: `learner:${identity.userId}:${conversation.id}`,
      metadata: JSON.stringify({
        conversationId: conversation.id,
        scenarioKey: "onboarding",
      }),
      ttl: "10m",
    },
  );
  token.addGrant({ roomJoin: true, room: conversation.roomName });
  return token.toJwt();
}
