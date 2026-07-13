export const DEFAULT_AGENT_MODELS = {
  llm: "openai/gpt-4.1-mini",
  stt: "elevenlabs/scribe_v2_realtime",
  tts: "inworld/inworld-tts-2",
  ttsVoiceId: "Olivia",
} as const;

export type AgentConfig = {
  agentName: string;
  ingestSecret: string;
  ingestUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  livekitUrl: string;
  llmModel: string;
  sttLanguage: "en" | "zh";
  sttModel: string;
  ttsModel: string;
  ttsVoiceId: string;
};

function optionalSttLanguage(env: NodeJS.ProcessEnv): "en" | "zh" {
  const language = env.AGENT_STT_LANGUAGE?.trim().toLowerCase() || "en";
  if (language !== "en" && language !== "zh") {
    throw new Error("AGENT_STT_LANGUAGE must be en or zh.");
  }
  return language;
}

function required(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
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
    ingestSecret: required(env, "CONVERSATION_AGENT_SECRET"),
    ingestUrl: required(env, "CONVERSATION_INGEST_URL").replace(/\/$/, ""),
    livekitApiKey: required(env, "LIVEKIT_API_KEY"),
    livekitApiSecret: required(env, "LIVEKIT_API_SECRET"),
    livekitUrl: required(env, "LIVEKIT_URL"),
    llmModel: optionalModel(env, "AGENT_LLM_MODEL", DEFAULT_AGENT_MODELS.llm),
    sttLanguage: optionalSttLanguage(env),
    sttModel: optionalModel(env, "AGENT_STT_MODEL", DEFAULT_AGENT_MODELS.stt),
    ttsModel: optionalModel(env, "AGENT_TTS_MODEL", DEFAULT_AGENT_MODELS.tts),
    ttsVoiceId: optionalModel(
      env,
      "AGENT_TTS_VOICE_ID",
      DEFAULT_AGENT_MODELS.ttsVoiceId,
    ),
  };
}
