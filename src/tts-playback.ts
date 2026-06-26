type AudioLike = {
  onended?: ((event: Event) => void) | null;
  onerror?: ((event: Event) => void) | null;
  pause?: () => void;
  play: () => Promise<void>;
};

export type TtsPlaybackEnvironment = {
  createAudio: (url: string) => AudioLike;
  revokeObjectURL: (url: string) => void;
};

export type TtsPlaybackResult = {
  audioUrl: string | null;
  source: "asset";
};

export type SpokenLine = {
  audioId?: string;
  audioSrc?: string;
  cache?: boolean;
  character?: string;
  engine?: "asset" | "worker";
  lang?: string;
  slow: boolean;
  style?: "character";
  text: string;
};

export type PlaySpokenLineOptions = SpokenLine & {
  env?: TtsPlaybackEnvironment;
  previousAudioUrl: string | null;
  signal?: AbortSignal;
};

function getBrowserEnvironment(): TtsPlaybackEnvironment {
  return {
    createAudio: (url) => new Audio(url) as AudioLike,
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  };
}

function createAbortError() {
  const error = new Error("TTS playback was cancelled.");
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

async function playAudioUrl(
  env: TtsPlaybackEnvironment,
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

async function playAssetLine({
  audioSrc,
  env,
  previousAudioUrl,
  signal,
}: PlaySpokenLineOptions & { env: TtsPlaybackEnvironment }) {
  if (!audioSrc) {
    throw new Error("Static audio source is missing.");
  }

  if (previousAudioUrl) {
    env.revokeObjectURL(previousAudioUrl);
  }

  await playAudioUrl(env, audioSrc, signal);
}

export async function playSpokenLine({
  engine = "asset",
  env = getBrowserEnvironment(),
  ...line
}: PlaySpokenLineOptions): Promise<TtsPlaybackResult> {
  if (engine === "asset") {
    await playAssetLine({ ...line, engine, env });
    return { audioUrl: null, source: "asset" };
  }

  throw new Error("Static audio is required for live lesson playback.");
}
