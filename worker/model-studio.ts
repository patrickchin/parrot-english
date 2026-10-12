export interface ModelStudioEnv {
  DASHSCOPE_API_KEY?: string;
  DASHSCOPE_WORKSPACE_ID?: string;
}

export function getModelStudioConfig(env: ModelStudioEnv) {
  const apiKey = env.DASHSCOPE_API_KEY?.trim();
  if (!apiKey) return null;
  const workspace = env.DASHSCOPE_WORKSPACE_ID?.trim();
  if (!/^ws-[a-z0-9]+$/.test(workspace ?? "")) {
    throw new Error("A mainland Model Studio workspace is required.");
  }
  // Derive the vendor endpoint instead of accepting an arbitrary credential destination.
  return { apiKey, baseUrl: `https://${workspace}.cn-beijing.maas.aliyuncs.com` };
}

export function getChatConfig(env: ModelStudioEnv & { GROQ_API_KEY?: string }) {
  const studio = getModelStudioConfig(env);
  if (studio) return {
    apiKey: studio.apiKey,
    url: `${studio.baseUrl}/compatible-mode/v1/chat/completions`,
    model: "qwen3.7-flash-2026-07-15",
    options: { enable_thinking: false, max_tokens: 512 },
  };
  if (!env.GROQ_API_KEY) return null;
  return {
    apiKey: env.GROQ_API_KEY,
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "openai/gpt-oss-20b",
    options: {},
  };
}
