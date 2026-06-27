import { isAbortError } from "./audio-playback.ts";
import {
  getDirectorTurnSilentDurationMs,
  playDirectorTurnSpeech,
} from "./director-audio-playback.ts";

type DirectorSpeechSegment = { lang: string; text: string };

type PlayTurnSpeech = (options: {
  signal?: AbortSignal;
  speaker: string;
  speech: DirectorSpeechSegment[];
}) => Promise<void>;

type WaitForMutedTurn = (
  durationMs: number,
  signal?: AbortSignal
) => Promise<void>;

type PlayDirectorTurnForUiOptions = {
  isCancelled: () => boolean;
  muted: boolean;
  onDone: () => void;
  onError: (error: unknown) => void;
  signal?: AbortSignal;
  speaker: string;
  speech: DirectorSpeechSegment[];
  playTurnSpeech?: PlayTurnSpeech;
  waitForMutedTurn?: WaitForMutedTurn;
};

function createAbortError() {
  const error = new Error("Director turn playback was cancelled.");
  error.name = "AbortError";
  return error;
}

async function defaultWaitForMutedTurn(
  durationMs: number,
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
    }, durationMs);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

export async function playDirectorTurnForUi({
  isCancelled,
  muted,
  onDone,
  onError,
  signal,
  speaker,
  speech,
  playTurnSpeech = playDirectorTurnSpeech,
  waitForMutedTurn = defaultWaitForMutedTurn,
}: PlayDirectorTurnForUiOptions) {
  try {
    if (muted) {
      await waitForMutedTurn(getDirectorTurnSilentDurationMs(speech), signal);
    } else {
      await playTurnSpeech({ speaker, speech, signal });
    }

    if (!isCancelled()) {
      onDone();
    }
  } catch (error) {
    if (isCancelled() || signal?.aborted || isAbortError(error)) return;

    onError(error);

    if (!isCancelled()) {
      onDone();
    }
  }
}
