import { resolveStaticDirectorSpeechSegment } from "../lib/director-speech-segments.js";

type AudioPlaybackModule = typeof import("./audio-playback");

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

const dynamicAudioCache = new Map<string, string>();
let audioPlaybackModulePromise: Promise<AudioPlaybackModule> | null = null;

async function loadAudioPlaybackModule(): Promise<AudioPlaybackModule> {
  try {
    return await import("./audio-playback");
  } catch {
    return await import("./audio-playback" + ".ts");
  }
}

async function getAudioPlaybackModule() {
  audioPlaybackModulePromise ??= loadAudioPlaybackModule();
  return audioPlaybackModulePromise;
}

async function isPlaybackAbortError(error: unknown) {
  const { isAbortError } = await getAudioPlaybackModule();
  return isAbortError(error);
}

function createAbortError() {
  const error = new Error("Director speech playback was cancelled.");
  error.name = "AbortError";
  return error;
}

function getSilentDurationMs(text: string) {
  return Math.max(600, Math.min(1800, text.length * 80));
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

    let timeoutId: number | undefined;

    function cleanup() {
      signal?.removeEventListener("abort", handleAbort);
    }

    function handleAbort() {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      cleanup();
      reject(createAbortError());
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
    timeoutId = window.setTimeout(() => {
      cleanup();
      resolve();
    }, getSilentDurationMs(segment.text));
  });
}

async function requestDynamicSegmentAudio(
  segment: { speaker: string; lang: string; text: string },
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

  if (typeof payload.audioSrc !== "string" || typeof payload.key !== "string") {
    throw new Error("Director TTS response was invalid.");
  }

  dynamicAudioCache.set(payload.key, payload.audioSrc);
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
            (await requestDynamicSegmentAudio({ speaker, ...segment }, signal));

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
        const { playAudioLine } = await getAudioPlaybackModule();
        await playAudioLine({
          audioId: resolved.key,
          audioSrc,
          lang: segment.lang,
          text: segment.text,
          signal,
        });
      }
    } catch (error) {
      if (signal?.aborted || (await isPlaybackAbortError(error))) return;

      try {
        await waitForSilentSegment(segment, signal);
      } catch (silentError) {
        if (signal?.aborted || (await isPlaybackAbortError(silentError))) return;
        throw silentError;
      }
    }
  }
}
