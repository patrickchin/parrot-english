export const DEFAULT_AGENT_MODELS = {
  realtime: "gpt-realtime-2.1-mini",
  transcription: "gpt-4o-mini-transcribe",
  voice: "marin",
} as const;

export type AgentConfig = {
  agentName: string;
  buildVersion: string;
  commitSha: string;
  ingestSecret: string;
  ingestUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  livekitUrl: string;
  openaiApiKey: string;
  realtimeModel: string;
  realtimeVoice: string;
  transcriptionModel: string;
};

function required(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function buildMetadata(
  env: NodeJS.ProcessEnv,
  name: "PARROT_AGENT_COMMIT_SHA" | "PARROT_AGENT_VERSION",
  pattern: RegExp,
) {
  const value = env[name]?.trim();
  if (!value && env.NODE_ENV !== "production") return "local";
  if (!value || !pattern.test(value)) {
    throw new Error(`${name} must contain deployed build metadata.`);
  }
  return value;
}

function explicitModel(value: string, name: string) {
  if (/(?:^|[/:_-])(?:auto|latest)$/i.test(value)) {
    throw new Error(`${name} must use an explicit model version.`);
  }
  return value;
}

function optionalModel(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: string,
) {
  const value = env[name]?.trim() || fallback;
  return explicitModel(value, name);
}

export function readAgentConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  return {
    agentName: required(env, "LIVEKIT_AGENT_NAME"),
    buildVersion: buildMetadata(
      env,
      "PARROT_AGENT_VERSION",
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    ),
    commitSha: buildMetadata(
      env,
      "PARROT_AGENT_COMMIT_SHA",
      /^[0-9a-f]{7,40}$/i,
    ),
    ingestSecret: required(env, "CONVERSATION_AGENT_SECRET"),
    ingestUrl: required(env, "CONVERSATION_INGEST_URL").replace(/\/$/, ""),
    livekitApiKey: required(env, "LIVEKIT_API_KEY"),
    livekitApiSecret: required(env, "LIVEKIT_API_SECRET"),
    livekitUrl: required(env, "LIVEKIT_URL"),
    openaiApiKey: required(env, "OPENAI_API_KEY"),
    realtimeModel: optionalModel(
      env,
      "AGENT_REALTIME_MODEL",
      DEFAULT_AGENT_MODELS.realtime,
    ),
    realtimeVoice:
      env.AGENT_REALTIME_VOICE?.trim() || DEFAULT_AGENT_MODELS.voice,
    transcriptionModel: optionalModel(
      env,
      "AGENT_TRANSCRIPTION_MODEL",
      DEFAULT_AGENT_MODELS.transcription,
    ),
  };
}
