import { scoreSpeechTranscript } from "../lib/speech-scoring.js";
import {
  readBoundedFormData,
  RequestBodyTooLargeError,
} from "./request-body.ts";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const STT_MODEL = "whisper-large-v3-turbo";
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const MAX_ONBOARDING_AUDIO_BYTES = 512 * 1024;
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
]);
const DEFAULT_GROQ_REQUEST_TIMEOUT_MS = 15_000;
const MAX_GROQ_REQUEST_TIMEOUT_MS = 60_000;

export interface ApiEnv {
  GROQ_API_KEY?: string;
  GROQ_REQUEST_TIMEOUT_MS?: string;
}

export class UpstreamRequestTimeoutError extends Error {
  constructor() {
    super("Upstream request timed out.");
    this.name = "UpstreamRequestTimeoutError";
  }
}

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return Response.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function requireGroqKey(env: ApiEnv) {
  if (!env.GROQ_API_KEY) {
    return null;
  }

  return env.GROQ_API_KEY;
}

export function getGroqRequestTimeoutMs(env: ApiEnv) {
  const configuredTimeout = Number.parseInt(env.GROQ_REQUEST_TIMEOUT_MS ?? "", 10);
  if (!Number.isFinite(configuredTimeout) || configuredTimeout <= 0) {
    return DEFAULT_GROQ_REQUEST_TIMEOUT_MS;
  }

  return Math.min(configuredTimeout, MAX_GROQ_REQUEST_TIMEOUT_MS);
}

export async function fetchWithTimeout(
  fetchImplementation: typeof globalThis.fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  const upstreamRequest = fetchImplementation(input, {
    ...init,
    signal: controller.signal,
  });
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new UpstreamRequestTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([upstreamRequest, timeout]);
  } catch (error) {
    if (timedOut) {
      throw new UpstreamRequestTimeoutError();
    }

    throw error;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

export async function handleOnboardingTranscription(
  request: Request,
  env: ApiEnv
) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const apiKey = requireGroqKey(env);
  if (!apiKey) {
    return jsonResponse(
      { error: "transcription_unavailable" },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await readBoundedFormData(
      request,
      MAX_ONBOARDING_AUDIO_BYTES + MULTIPART_OVERHEAD_BYTES,
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonResponse({ error: "audio_too_large" }, { status: 413 });
    }
    return jsonResponse({ error: "invalid_form_data" }, { status: 400 });
  }
  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return jsonResponse({ error: "audio_file_required" }, { status: 400 });
  }
  if (!SUPPORTED_AUDIO_TYPES.has(audio.type)) {
    return jsonResponse(
      { error: "unsupported_audio_type" },
      { status: 415 }
    );
  }
  if (audio.size === 0) {
    return jsonResponse({ error: "audio_file_required" }, { status: 400 });
  }
  if (audio.size > MAX_ONBOARDING_AUDIO_BYTES) {
    return jsonResponse({ error: "audio_too_large" }, { status: 413 });
  }

  const groqForm = new FormData();
  groqForm.set("model", STT_MODEL);
  groqForm.set("language", "en");
  groqForm.set("response_format", "json");
  groqForm.set("file", audio, audio.name || "onboarding-answer.webm");

  let upstream: Response;
  try {
    upstream = await fetchWithTimeout(
      globalThis.fetch,
      `${GROQ_BASE_URL}/audio/transcriptions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: groqForm,
      },
      getGroqRequestTimeoutMs(env)
    );
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof UpstreamRequestTimeoutError
            ? "transcription_timeout"
            : "transcription_failed",
      },
      {
        status: error instanceof UpstreamRequestTimeoutError ? 504 : 502,
      }
    );
  }

  if (!upstream.ok) {
    return jsonResponse({ error: "transcription_failed" }, { status: 502 });
  }

  try {
    const transcription = (await upstream.json()) as { text?: unknown };
    return jsonResponse({
      transcript:
        typeof transcription.text === "string"
          ? transcription.text.trim()
          : "",
    });
  } catch {
    return jsonResponse({ error: "transcription_failed" }, { status: 502 });
  }
}

export async function handleEvaluateSpeech(request: Request, env: ApiEnv) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const apiKey = requireGroqKey(env);
  if (!apiKey) {
    return jsonResponse(
      { error: "missing_groq_api_key", message: "GROQ_API_KEY is not set." },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await readBoundedFormData(
      request,
      MAX_AUDIO_BYTES + MULTIPART_OVERHEAD_BYTES,
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonResponse({ error: "audio_too_large" }, { status: 413 });
    }
    return jsonResponse({ error: "invalid_form_data" }, { status: 400 });
  }

  const targetText = String(formData.get("targetText") ?? "").trim();
  const audio = formData.get("audio");

  if (!targetText) {
    return jsonResponse({ error: "target_text_required" }, { status: 400 });
  }

  if (!(audio instanceof File)) {
    return jsonResponse({ error: "audio_file_required" }, { status: 400 });
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return jsonResponse({ error: "audio_too_large" }, { status: 413 });
  }

  const groqForm = new FormData();
  groqForm.set("model", STT_MODEL);
  groqForm.set("language", "en");
  groqForm.set("response_format", "json");
  groqForm.set("file", audio, audio.name || "child-response.webm");

  let upstream: Response;
  try {
    upstream = await fetchWithTimeout(
      globalThis.fetch,
      `${GROQ_BASE_URL}/audio/transcriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: groqForm,
      },
      getGroqRequestTimeoutMs(env)
    );
  } catch (error) {
    if (error instanceof UpstreamRequestTimeoutError) {
      return jsonResponse(
        {
          error: "stt_timeout",
          message: "Groq speech-to-text timed out.",
        },
        { status: 504 }
      );
    }

    return jsonResponse(
      {
        error: "stt_failed",
        message: "Groq speech-to-text failed.",
        detail: error instanceof Error ? error.message.slice(0, 500) : "",
      },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return jsonResponse(
      {
        error: "stt_failed",
        message: "Groq speech-to-text failed.",
        detail: detail.slice(0, 500),
      },
      { status: 502 }
    );
  }

  const transcription = (await upstream.json()) as { text?: string };
  const transcript = transcription.text ?? "";
  const result = scoreSpeechTranscript(transcript, targetText);

  return jsonResponse({
    transcript: result.transcript,
    similarity: result.similarity,
    passed: result.passed,
    feedbackText: result.feedbackText,
    retryAllowed: result.retryAllowed,
  });
}
