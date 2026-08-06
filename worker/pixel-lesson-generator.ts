import {
  preparePixelLesson,
  type PreparedPixelLesson,
} from "../lib/pixel-lesson-data.ts";
import { fetchWithTimeout } from "./groq.ts";
import { LESSON_GENERATOR_MODEL_ID } from "./model-config.ts";
import { PIXEL_LESSON_GENERATOR_SYSTEM_PROMPT } from "./prompts/pixel-lesson-generator.ts";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_REQUEST_TIMEOUT_MS = 30_000;
const MAX_OPENAI_REQUEST_TIMEOUT_MS = 120_000;

export interface PixelLessonGenerationEnv {
  OPENAI_API_KEY?: string;
  OPENAI_REQUEST_TIMEOUT_MS?: string;
}

function getOpenAIRequestTimeoutMs(env: PixelLessonGenerationEnv) {
  const configuredTimeout = Number.parseInt(
    env.OPENAI_REQUEST_TIMEOUT_MS ?? "",
    10,
  );
  if (!Number.isFinite(configuredTimeout) || configuredTimeout <= 0) {
    return DEFAULT_OPENAI_REQUEST_TIMEOUT_MS;
  }
  return Math.min(configuredTimeout, MAX_OPENAI_REQUEST_TIMEOUT_MS);
}

export class PixelLessonGenerationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PixelLessonGenerationError";
    this.code = code;
    this.status = status;
  }
}

type GeneratePixelLessonInput = {
  env: PixelLessonGenerationEnv;
  fetch?: typeof globalThis.fetch;
  learnerName: string;
  topic: string;
};

export async function generatePixelLessonScript({
  env,
  fetch: fetchImplementation = globalThis.fetch,
  learnerName,
  topic,
}: GeneratePixelLessonInput): Promise<PreparedPixelLesson> {
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new PixelLessonGenerationError(
      503,
      "generation_unavailable",
      "Pixel lesson generation is not configured.",
    );
  }

  let upstream: Response;
  try {
    upstream = await fetchWithTimeout(
      fetchImplementation,
      OPENAI_CHAT_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: LESSON_GENERATOR_MODEL_ID,
          max_completion_tokens: 4500,
          messages: [
            {
              role: "system",
              content: PIXEL_LESSON_GENERATOR_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: JSON.stringify({ learnerName, topic }),
            },
          ],
          response_format: { type: "json_object" },
          reasoning_effort: "low",
        }),
      },
      getOpenAIRequestTimeoutMs(env),
    );
  } catch {
    throw new PixelLessonGenerationError(
      502,
      "generation_failed",
      "Pixel lesson generation failed. Please try again.",
    );
  }

  if (!upstream.ok) {
    throw new PixelLessonGenerationError(
      502,
      "generation_failed",
      "Pixel lesson generation failed. Please try again.",
    );
  }

  try {
    const payload = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: unknown; refusal?: unknown } }>;
    };
    const message = payload.choices?.[0]?.message;
    if (message?.refusal || typeof message?.content !== "string") {
      throw new Error("missing content");
    }
    return preparePixelLesson(
      JSON.parse(message.content) as unknown,
      "generated pixel lesson",
      { learnerName },
    );
  } catch (caughtError) {
    const detail =
      caughtError instanceof Error ? caughtError.message : "unknown error";
    throw new PixelLessonGenerationError(
      502,
      "invalid_generated_lesson",
      `Generated pixel lesson is invalid: ${detail}`,
    );
  }
}
