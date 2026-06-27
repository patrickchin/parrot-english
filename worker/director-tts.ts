import { createDirectorSpeechSegmentKey } from "../lib/director-speech-segments.js";
import {
  checkDirectorTtsRateLimit,
  type RateLimitEnv,
} from "./api-security.ts";

export type DirectorTtsEnv = RateLimitEnv & {
  ELEVENLABS_API_KEY?: string;
  ELEVEN_LABS_API_KEY?: string;
  ELEVENLABS_BASE_URL?: string;
  ELEVENLABS_MODEL_ID?: string;
  ELEVENLABS_OUTPUT_FORMAT?: string;
  ELEVENLABS_PIG_VOICE_ID?: string;
  ELEVENLABS_PARROT_VOICE_ID?: string;
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
const MAX_DIRECTOR_TTS_REQUEST_BODY_BYTES = 16 * 1024;
const MAX_DIRECTOR_TTS_TEXT_CHARS = 500;
const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const ELEVENLABS_DEFAULT_MODEL = "eleven_v3";
const ELEVENLABS_DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
const ELEVENLABS_PIG_VOICE_ID = "Oqy85UMasXzUjUxF0ta5";
const ELEVENLABS_PARROT_VOICE_ID = "4NQthjVhIGGVfL3Si000";

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

function readConfiguredValue(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function requireElevenLabsApiKey(env: DirectorTtsEnv) {
  const apiKey = env.ELEVENLABS_API_KEY?.trim() || env.ELEVEN_LABS_API_KEY?.trim();
  if (!apiKey) {
    throw new DirectorTtsConfigurationError(
      "Director TTS provider is not configured."
    );
  }

  return apiKey;
}

function getElevenLabsVoiceId(segment: DirectorSpeechSegment, env: DirectorTtsEnv) {
  if (segment.speaker === "polly") {
    return readConfiguredValue(
      env.ELEVENLABS_PARROT_VOICE_ID,
      ELEVENLABS_PARROT_VOICE_ID
    );
  }

  return readConfiguredValue(env.ELEVENLABS_PIG_VOICE_ID, ELEVENLABS_PIG_VOICE_ID);
}

function getElevenLabsProviderText(segment: DirectorSpeechSegment) {
  if (segment.speaker === "polly" && segment.lang === "zh-CN") {
    return `[excited][brightly] ${segment.text}`;
  }

  return segment.text;
}

function getElevenLabsVoiceSettings(segment: DirectorSpeechSegment) {
  if (segment.speaker === "polly" && segment.lang === "zh-CN") {
    return {
      similarity_boost: 0.8,
      speed: 1.1,
      stability: 0.28,
      style: 0.7,
      use_speaker_boost: true,
    };
  }

  return {
    similarity_boost: 0.8,
    speed: segment.speaker === "peppa" ? 1.08 : 1,
    stability: segment.speaker === "peppa" ? 0.35 : 0.55,
    style: segment.speaker === "peppa" ? 0.45 : 0.15,
    use_speaker_boost: true,
  };
}

async function defaultGenerateAudio(
  segment: DirectorSpeechSegment,
  env: DirectorTtsEnv
): Promise<Uint8Array> {
  const apiKey = requireElevenLabsApiKey(env);
  const baseUrl = readConfiguredValue(env.ELEVENLABS_BASE_URL, ELEVENLABS_BASE_URL);
  const voiceId = getElevenLabsVoiceId(segment, env);
  const url = new URL(
    `${baseUrl.replace(/\/$/, "")}/text-to-speech/${voiceId}`
  );
  url.searchParams.set(
    "output_format",
    readConfiguredValue(
      env.ELEVENLABS_OUTPUT_FORMAT,
      ELEVENLABS_DEFAULT_OUTPUT_FORMAT
    )
  );

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      model_id: readConfiguredValue(env.ELEVENLABS_MODEL_ID, ELEVENLABS_DEFAULT_MODEL),
      text: getElevenLabsProviderText(segment),
      voice_settings: getElevenLabsVoiceSettings(segment),
    }),
  });

  if (!upstream.ok) {
    throw new Error(`Director TTS provider failed: ${upstream.status}`);
  }

  return new Uint8Array(await upstream.arrayBuffer());
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

  let requestBytes: ArrayBuffer;
  try {
    requestBytes = await request.arrayBuffer();
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  if (requestBytes.byteLength > MAX_DIRECTOR_TTS_REQUEST_BODY_BYTES) {
    return json({ error: "payload_too_large" }, { status: 413 });
  }

  const requestText = new TextDecoder().decode(requestBytes);

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
