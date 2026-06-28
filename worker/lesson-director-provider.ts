type LessonDirectorPromptModule = typeof import("./lesson-director-prompt");

const DEFAULT_LESSON_DIRECTOR_MODEL = "gpt-4.1-mini";
const DEFAULT_LESSON_DIRECTOR_TIMEOUT_MS = 15_000;
const MAX_LESSON_DIRECTOR_TIMEOUT_MS = 60_000;

export interface LessonDirectorProviderEnv {
  LESSON_DIRECTOR_API_KEY?: string;
  LESSON_DIRECTOR_BASE_URL?: string;
  LESSON_DIRECTOR_MODEL?: string;
  LESSON_DIRECTOR_TIMEOUT_MS?: string;
}

class LessonDirectorProviderTimeoutError extends Error {
  constructor() {
    super("Lesson director provider timed out.");
    this.name = "LessonDirectorProviderTimeoutError";
  }
}

function getLessonDirectorTimeoutMs(env: LessonDirectorProviderEnv) {
  const configuredTimeout = Number.parseInt(
    env.LESSON_DIRECTOR_TIMEOUT_MS ?? "",
    10
  );
  if (!Number.isFinite(configuredTimeout) || configuredTimeout <= 0) {
    return DEFAULT_LESSON_DIRECTOR_TIMEOUT_MS;
  }

  return Math.min(configuredTimeout, MAX_LESSON_DIRECTOR_TIMEOUT_MS);
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  const upstreamRequest = fetch(input, {
    ...init,
    signal: controller.signal,
  });
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new LessonDirectorProviderTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([upstreamRequest, timeout]);
  } catch (error) {
    if (timedOut) {
      throw new LessonDirectorProviderTimeoutError();
    }

    throw error;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

async function loadPromptModule(): Promise<LessonDirectorPromptModule> {
  try {
    return await import("./lesson-director-prompt");
  } catch {
    return await import("./lesson-director-prompt" + ".ts");
  }
}

function requireProviderConfig(env: LessonDirectorProviderEnv) {
  const apiKey = env.LESSON_DIRECTOR_API_KEY?.trim();
  const baseUrl = env.LESSON_DIRECTOR_BASE_URL?.trim();

  if (!apiKey) {
    throw new Error("LESSON_DIRECTOR_API_KEY is required.");
  }

  if (!baseUrl) {
    throw new Error("LESSON_DIRECTOR_BASE_URL is required.");
  }

  return { apiKey, baseUrl };
}

function getProviderModel(env: LessonDirectorProviderEnv) {
  return env.LESSON_DIRECTOR_MODEL?.trim() || DEFAULT_LESSON_DIRECTOR_MODEL;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function callLessonDirectorProvider(
  requestBody: unknown,
  env: LessonDirectorProviderEnv
): Promise<unknown> {
  const { apiKey, baseUrl } = requireProviderConfig(env);
  const { LESSON_DIRECTOR_SYSTEM_PROMPT, createLessonDirectorUserPrompt } =
    await loadPromptModule();
  const upstream = await fetchWithTimeout(
    baseUrl,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getProviderModel(env),
        systemPrompt: LESSON_DIRECTOR_SYSTEM_PROMPT,
        userPrompt: createLessonDirectorUserPrompt(requestBody),
        responseFormat: "json_object",
      }),
    },
    getLessonDirectorTimeoutMs(env)
  );

  if (!upstream.ok) {
    throw new Error(`Lesson director provider failed: ${upstream.status}`);
  }

  const providerResponse = (await upstream.json()) as {
    outputText?: string;
    packet?: unknown;
  };

  if (isObject(providerResponse) && providerResponse.packet !== undefined) {
    return providerResponse.packet;
  }

  if (!isObject(providerResponse) || typeof providerResponse.outputText !== "string") {
    throw new Error("Lesson director provider returned no outputText.");
  }

  return JSON.parse(providerResponse.outputText);
}
