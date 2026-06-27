import { createDirectorSpeechSegmentKey } from "../lib/director-speech-segments.js";
import {
  checkDirectorTtsRateLimit,
  type RateLimitEnv,
} from "./api-security.ts";

export type DirectorTtsEnv = RateLimitEnv & {
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_MODEL_ID?: string;
};

type DirectorSpeechSegment = {
  speaker: string;
  lang: string;
  text: string;
};

type GenerateAudio = (
  segment: DirectorSpeechSegment,
  env: DirectorTtsEnv
) => Promise<Uint8Array>;

const CHINESE_PATTERN = /[\u3400-\u9fff]/;
const LATIN_PATTERN = /[A-Za-z]/;
const ALLOWED_SPEAKERS = new Set(["peppa", "polly"]);
const ALLOWED_LANGUAGES = new Set(["zh-CN", "en-US"]);
const BASE64_CHUNK_SIZE = 0x8000;
const MAX_DIRECTOR_TTS_REQUEST_BODY_CHARS = 16 * 1024;
const MAX_DIRECTOR_TTS_TEXT_CHARS = 500;

class DirectorTtsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectorTtsConfigurationError";
  }
}

function json(payload: unknown, init: ResponseInit = {}) {
  return Response.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasMixedChineseAndEnglish(text: string) {
  return CHINESE_PATTERN.test(text) && LATIN_PATTERN.test(text);
}

function toDataUrl(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(index, index + BASE64_CHUNK_SIZE);
    for (const byte of chunk) {
      binary += String.fromCharCode(byte);
    }
  }

  return `data:audio/mpeg;base64,${btoa(binary)}`;
}

async function defaultGenerateAudio(): Promise<Uint8Array> {
  throw new DirectorTtsConfigurationError(
    "Director TTS provider is not configured."
  );
}

function normalizeSegment(body: unknown): DirectorSpeechSegment | null {
  if (
    !isObject(body) ||
    !isNonEmptyString(body.speaker) ||
    !isNonEmptyString(body.lang) ||
    !isNonEmptyString(body.text)
  ) {
    return null;
  }

  const segment = {
    speaker: body.speaker.trim(),
    lang: body.lang.trim(),
    text: body.text,
  };

  if (
    !ALLOWED_SPEAKERS.has(segment.speaker) ||
    !ALLOWED_LANGUAGES.has(segment.lang)
  ) {
    return null;
  }

  return segment;
}

export async function handleDirectorTts(
  request: Request,
  env: DirectorTtsEnv,
  generateAudio: GenerateAudio = defaultGenerateAudio
) {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, { status: 405 });
  }

  let requestText: string;
  try {
    requestText = await request.text();
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  if (requestText.length > MAX_DIRECTOR_TTS_REQUEST_BODY_CHARS) {
    return json({ error: "payload_too_large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(requestText);
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  const segment = normalizeSegment(body);
  if (!segment) {
    return json({ error: "invalid_request" }, { status: 400 });
  }

  if (hasMixedChineseAndEnglish(segment.text)) {
    return json({ error: "mixed_language_segment" }, { status: 400 });
  }

  if (segment.text.length > MAX_DIRECTOR_TTS_TEXT_CHARS) {
    return json({ error: "text_too_long" }, { status: 400 });
  }

  const rateLimited = checkDirectorTtsRateLimit(request, env);
  if (rateLimited) return rateLimited;

  const key = createDirectorSpeechSegmentKey(segment);

  let bytes: Uint8Array;
  try {
    bytes = await generateAudio(segment, env);
  } catch (error) {
    if (error instanceof DirectorTtsConfigurationError) {
      return json(
        {
          error: "tts_provider_unconfigured",
          message: "Director TTS provider is not configured.",
        },
        { status: 503 }
      );
    }

    return json(
      {
        error: "tts_generation_failed",
        message: "Director TTS generation failed.",
      },
      { status: 502 }
    );
  }

  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    return json(
      {
        error: "tts_generation_failed",
        message: "Director TTS generation failed.",
      },
      { status: 502 }
    );
  }

  return json({
    key,
    audioSrc: toDataUrl(bytes),
  });
}
