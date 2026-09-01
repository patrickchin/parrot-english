type AudioLike = {
  onended?: ((event: Event) => void) | null;
  onerror?: ((event: Event) => void) | null;
  pause?: () => void;
  play: () => Promise<void>;
  volume?: number;
};

export type AudioPlaybackEnvironment = {
  createAudio: (url: string) => AudioLike;
};

export type PlaybackControl = {
  pause: () => void;
  resume: () => void;
};

export type AssetAudioLine = {
  audioId?: string;
  audioSrc: string;
  lang?: string;
  pauseAfterMs?: number;
  style?: "character";
  text: string;
  volume?: number;
};

export type PlayAudioLineOptions = AssetAudioLine & {
  env?: AudioPlaybackEnvironment;
  onPlaybackControl?: (control: PlaybackControl | null) => void;
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

type E2EPlaybackLine = Pick<AssetAudioLine, "audioId" | "audioSrc" | "text">;
type E2EPlaybackWindow = Window & {
  __parrotE2ePlaybackLine?: (line: E2EPlaybackLine) => void;
};

function recordE2EPlaybackLine(line: E2EPlaybackLine) {
  if (import.meta.env?.DEV && typeof window !== "undefined") {
    (window as E2EPlaybackWindow).__parrotE2ePlaybackLine?.(line);
  }
}

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

export async function waitForAbortableDelay(
  durationMs: number,
  signal?: AbortSignal,
) {
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
  signal?: AbortSignal,
  onPlaybackControl?: (control: PlaybackControl | null) => void,
  volume = 1,
) {
  const audio = env.createAudio(audioUrl);
  audio.volume = volume;

  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", handleAbort);
      audio.onended = null;
      audio.onerror = null;
      onPlaybackControl?.(null);
    };
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };
    const handlePlayError = (error: unknown) => {
      settle(() =>
        reject(
          error instanceof Error ? error : new Error("Audio playback failed."),
        ),
      );
    };

    const handleAbort = () => {
      audio.pause?.();
      settle(() => reject(createAbortError()));
    };

    audio.onended = () => {
      settle(resolve);
    };
    audio.onerror = () => {
      settle(() => reject(new Error("Audio playback failed.")));
    };

    const playbackControl: PlaybackControl = {
      pause: () => {
        if (!settled) audio.pause?.();
      },
      resume: () => {
        if (settled) return;
        try {
          void audio.play().catch(handlePlayError);
        } catch (error) {
          handlePlayError(error);
        }
      },
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
    onPlaybackControl?.(playbackControl);
    playbackControl.resume();
  });
}

export async function playAudioLine({
  audioId,
  audioSrc,
  env = getBrowserEnvironment(),
  onPlaybackControl,
  signal,
  text,
  volume,
}: PlayAudioLineOptions): Promise<void> {
  if (!audioSrc) {
    throw new Error("Static audio source is missing.");
  }

  recordE2EPlaybackLine({ audioId, audioSrc, text });
  await playAudioUrl(env, audioSrc, signal, onPlaybackControl, volume);
}

export async function playAudioSequence({
  env = getBrowserEnvironment(),
  lines,
  signal,
  wait = waitForAbortableDelay,
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
