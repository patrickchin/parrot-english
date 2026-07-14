import { prepareLesson } from "../lib/lesson-data.js";
import type { LessonDraft } from "../src/lessons/lesson-catalog.ts";
import { fetchWithTimeout } from "./groq.ts";
import {
  LESSON_BACKGROUNDS,
  LESSON_VISUAL_CATALOG,
} from "./lesson-catalog.ts";
import { LESSON_GENERATOR_MODEL_ID } from "./model-config.ts";
import { LESSON_GENERATOR_SYSTEM_PROMPT } from "./prompts/lesson-generator.ts";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_REQUEST_TIMEOUT_MS = 30_000;
const MAX_OPENAI_REQUEST_TIMEOUT_MS = 120_000;

export interface LessonGenerationEnv {
  OPENAI_API_KEY?: string;
  OPENAI_REQUEST_TIMEOUT_MS?: string;
}

function getOpenAIRequestTimeoutMs(env: LessonGenerationEnv) {
  const configuredTimeout = Number.parseInt(
    env.OPENAI_REQUEST_TIMEOUT_MS ?? "",
    10,
  );
  if (!Number.isFinite(configuredTimeout) || configuredTimeout <= 0) {
    return DEFAULT_OPENAI_REQUEST_TIMEOUT_MS;
  }
  return Math.min(configuredTimeout, MAX_OPENAI_REQUEST_TIMEOUT_MS);
}

export class LessonGenerationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "LessonGenerationError";
    this.code = code;
    this.status = status;
  }
}

type GenerateLessonInput = {
  childName: string;
  env: LessonGenerationEnv;
  fetch?: typeof globalThis.fetch;
  topic: string;
};

export async function generateLessonScript({
  childName,
  env,
  fetch: fetchImplementation = globalThis.fetch,
  topic,
}: GenerateLessonInput): Promise<LessonDraft> {
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new LessonGenerationError(
      503,
      "generation_unavailable",
      "Lesson generation is not configured.",
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
            { role: "system", content: LESSON_GENERATOR_SYSTEM_PROMPT },
            {
              role: "user",
              content: JSON.stringify({
                topic,
                childName,
                availableBackgrounds: LESSON_BACKGROUNDS,
              }),
            },
          ],
          response_format: { type: "json_object" },
          reasoning_effort: "low",
        }),
      },
      getOpenAIRequestTimeoutMs(env),
    );
  } catch (caughtError) {
    if (caughtError instanceof LessonGenerationError) throw caughtError;
    throw new LessonGenerationError(
      502,
      "generation_failed",
      "Lesson generation failed. Please try again.",
    );
  }

  if (!upstream.ok) {
    throw new LessonGenerationError(
      502,
      "generation_failed",
      "Lesson generation failed. Please try again.",
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
    const value = JSON.parse(message.content) as unknown;
    return prepareLesson(
      value,
      LESSON_VISUAL_CATALOG,
      "generated lesson",
      { childName },
    );
  } catch (caughtError) {
    const detail = caughtError instanceof Error ? caughtError.message : "unknown error";
    throw new LessonGenerationError(
      502,
      "invalid_generated_lesson",
      `Generated lesson is invalid: ${detail}`,
    );
  }
}
