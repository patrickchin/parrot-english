import { resolveStaticDirectorSpeechSegment } from "../lib/director-speech-segments.js";
import { isAbortError, playAudioLine } from "./audio-playback.ts";

type SpeechSegment = { lang: string; text: string };

type ResolvedSpeechSegment = {
  audioSrc: string | null;
  lang: string;
  text: string;
};

type PlayDirectorTurnSpeechOptions = {
  signal?: AbortSignal;
  speaker: string;
  speech: SpeechSegment[];
  playResolvedSegment?: (segment: ResolvedSpeechSegment) => Promise<void>;
  waitForSilentSegment?: (
    segment: SpeechSegment,
    signal?: AbortSignal
  ) => Promise<void>;
};

const DIRECTOR_TTS_AUDIO_SRC_PREFIX = "data:audio/mpeg;base64,";
const BASE64_PAYLOAD_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const dynamicAudioCache = new Map<string, string>();

export function clearDirectorSpeechAudioCache() {
  dynamicAudioCache.clear();
}

function createAbortError() {
  const error = new Error("Director speech playback was cancelled.");
  error.name = "AbortError";
  return error;
}

export function getDirectorSpeechSegmentSilentDurationMs(text: string) {
  return Math.max(600, Math.min(1800, text.length * 80));
}

export function getDirectorTurnSilentDurationMs(speech: SpeechSegment[]) {
  return speech.reduce(
    (total, segment) =>
      total + getDirectorSpeechSegmentSilentDurationMs(segment.text),
    0
  );
}

function isPlayableDirectorTtsDataUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !value.startsWith(DIRECTOR_TTS_AUDIO_SRC_PREFIX)
  ) {
    return false;
  }

  const payload = value.slice(DIRECTOR_TTS_AUDIO_SRC_PREFIX.length);
  return payload.length > 0 && BASE64_PAYLOAD_PATTERN.test(payload);
}

async function defaultWaitForSilentSegment(
  segment: SpeechSegment,
  signal?: AbortSignal
) {
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    function cleanup() {
      signal?.removeEventListener("abort", handleAbort);
    }

    function handleAbort() {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(createAbortError());
    }

    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve();
    }, getDirectorSpeechSegmentSilentDurationMs(segment.text));
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

async function requestDynamicSegmentAudio(
  segment: { speaker: string; lang: string; text: string },
  expectedKey: string,
  signal?: AbortSignal
) {
  const response = await fetch("/api/director-tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(segment),
    signal,
  });

  if (!response.ok) {
    throw new Error("Director TTS failed.");
  }

  const payload = (await response.json()) as {
    audioSrc?: unknown;
    key?: unknown;
  };

  if (
    !isPlayableDirectorTtsDataUrl(payload.audioSrc) ||
    typeof payload.key !== "string"
  ) {
    throw new Error("Director TTS response was invalid.");
  }

  if (payload.key !== expectedKey) {
    throw new Error("Director TTS response key did not match the segment.");
  }

  dynamicAudioCache.set(expectedKey, payload.audioSrc);
  return payload.audioSrc;
}

export async function playDirectorTurnSpeech({
  signal,
  speaker,
  speech,
  playResolvedSegment,
  waitForSilentSegment = defaultWaitForSilentSegment,
}: PlayDirectorTurnSpeechOptions) {
  for (const segment of speech) {
    if (signal?.aborted) return;

    const resolved = resolveStaticDirectorSpeechSegment({ speaker, ...segment });

    try {
      const audioSrc =
        resolved.kind === "static"
          ? resolved.audioSrc
          : dynamicAudioCache.get(resolved.key) ??
            (await requestDynamicSegmentAudio(
              { speaker, ...segment },
              resolved.key,
              signal
            ));

      if (!audioSrc) {
        throw new Error("Director speech audio source is missing.");
      }

      if (signal?.aborted) return;

      if (playResolvedSegment) {
        await playResolvedSegment({
          audioSrc,
          lang: segment.lang,
          text: segment.text,
        });
      } else {
        await playAudioLine({
          audioId: resolved.key,
          audioSrc,
          lang: segment.lang,
          text: segment.text,
          signal,
        });
      }
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) return;

      try {
        await waitForSilentSegment(segment, signal);
      } catch (silentError) {
        if (signal?.aborted || isAbortError(silentError)) return;
        throw silentError;
      }
    }
  }
}
