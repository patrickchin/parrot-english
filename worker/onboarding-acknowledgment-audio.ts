import { fetchWithTimeout } from "./groq.ts";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const ELEVENLABS_VOICE_ID = "Oqy85UMasXzUjUxF0ta5";
const ELEVENLABS_MODEL_ID = "eleven_v3";
const ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_ACKNOWLEDGMENT_LENGTH = 160;
const MAX_AUDIO_BYTES = 1024 * 1024;

export interface ElevenLabsEnv {
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_REQUEST_TIMEOUT_MS?: string;
}

export type AcknowledgmentAudio = {
  contentType: "audio/mpeg";
  base64: string;
};

type SynthesisInput = {
  env: ElevenLabsEnv;
  fetch?: typeof globalThis.fetch;
  text: string;
};

function getTimeoutMs(env: ElevenLabsEnv) {
  const configured = Number.parseInt(
    env.ELEVENLABS_REQUEST_TIMEOUT_MS ?? "",
    10
  );
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(configured, MAX_TIMEOUT_MS);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export async function synthesizeAcknowledgment({
  env,
  fetch: fetchImplementation = globalThis.fetch,
  text,
}: SynthesisInput): Promise<AcknowledgmentAudio | null> {
  const acknowledgment = typeof text === "string" ? text.trim() : "";
  if (
    !env.ELEVENLABS_API_KEY ||
    acknowledgment.length === 0 ||
    acknowledgment.length > MAX_ACKNOWLEDGMENT_LENGTH
  ) {
    return null;
  }

  const url = new URL(
    `${ELEVENLABS_BASE_URL}/text-to-speech/${ELEVENLABS_VOICE_ID}`
  );
  url.searchParams.set("output_format", ELEVENLABS_OUTPUT_FORMAT);

  try {
    const response = await fetchWithTimeout(
      fetchImplementation,
      url,
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": env.ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          model_id: ELEVENLABS_MODEL_ID,
          text: `[bright and playful] ${acknowledgment}`,
          voice_settings: {
            similarity_boost: 0.8,
            speed: 1.1,
            stability: 0.28,
            style: 0.7,
            use_speaker_boost: true,
          },
        }),
      },
      getTimeoutMs(env)
    );
    if (!response.ok) return null;
    if (response.headers.get("Content-Type")?.split(";", 1)[0] !== "audio/mpeg") {
      return null;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_AUDIO_BYTES) return null;
    return { contentType: "audio/mpeg", base64: bytesToBase64(bytes) };
  } catch {
    return null;
  }
}
