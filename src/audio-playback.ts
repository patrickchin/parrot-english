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
  style?: "character";
  text: string;
};

export type PlayAudioLineOptions = AssetAudioLine & {
  env?: AudioPlaybackEnvironment;
  signal?: AbortSignal;
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
