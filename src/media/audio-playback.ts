type AudioLike = {
  onended?: ((event: Event) => void) | null;
  onerror?: ((event: Event) => void) | null;
  pause?: () => void;
  play: () => Promise<void>;
};

export type AudioPlaybackEnvironment = {
  createAudio: (url: string) => AudioLike;
};

export type AssetAudioLine = {
  audioId?: string;
  audioSrc: string;
  lang?: string;
  pauseAfterMs?: number;
  style?: "character";
  text: string;
};

export type PlayAudioLineOptions = AssetAudioLine & {
  env?: AudioPlaybackEnvironment;
  signal?: AbortSignal;
};

type AudioSequenceWait = (
  durationMs: number,
  signal?: AbortSignal
) => Promise<void>;

export type PlayAudioSequenceOptions = {
  env?: AudioPlaybackEnvironment;
  lines: AssetAudioLine[];
  signal?: AbortSignal;
  wait?: AudioSequenceWait;
};

function getBrowserEnvironment(): AudioPlaybackEnvironment {
  return {
    createAudio: (url) => new Audio(url) as AudioLike,
  };
}

function createAbortError() {
  const error = new Error("Audio playback was cancelled.");
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

async function waitForPlaybackPause(durationMs: number, signal?: AbortSignal) {
  if (durationMs <= 0) return;

  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, durationMs);

    const cleanup = () => {
      signal?.removeEventListener("abort", handleAbort);
      globalThis.clearTimeout(timeoutId);
    };

    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

async function playAudioUrl(
  env: AudioPlaybackEnvironment,
  audioUrl: string,
  signal?: AbortSignal
) {
  const audio = env.createAudio(audioUrl);

  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const cleanup = () => {
      signal?.removeEventListener("abort", handleAbort);
      audio.onended = null;
      audio.onerror = null;
    };

    const handleAbort = () => {
      cleanup();
      audio.pause?.();
      reject(createAbortError());
    };

    audio.onended = () => {
      cleanup();
      resolve();
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("Audio playback failed."));
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
    audio.play().catch((error: unknown) => {
      cleanup();
      reject(error instanceof Error ? error : new Error("Audio playback failed."));
    });
  });
}

export async function playAudioLine({
  audioSrc,
  env = getBrowserEnvironment(),
  signal,
}: PlayAudioLineOptions): Promise<void> {
  if (!audioSrc) {
    throw new Error("Static audio source is missing.");
  }

  await playAudioUrl(env, audioSrc, signal);
}

export async function playAudioSequence({
  env = getBrowserEnvironment(),
  lines,
  signal,
  wait = waitForPlaybackPause,
}: PlayAudioSequenceOptions): Promise<void> {
  for (const line of lines) {
    await playAudioLine({
      ...line,
      env,
      signal,
    });

    const pauseAfterMs = line.pauseAfterMs ?? 0;
    if (pauseAfterMs > 0) {
      await wait(pauseAfterMs, signal);
    }
  }
}
