import type { EvaluationResult } from "./evaluation-request";
import type { SpeechRecordingSession } from "./speech-recorder";

type MutableRef<T> = {
  current: T;
};

type SpeechEvaluator = (options: {
  audio: Blob;
  signal: AbortSignal;
  targetText: string;
}) => Promise<EvaluationResult>;

type FinishSpeechOperationOptions = {
  evaluate: SpeechEvaluator;
  evaluationControllerRef: MutableRef<AbortController | null>;
  generation: number;
  getCurrentGeneration: () => number;
  onCancelled: () => void;
  onEvaluated: (result: EvaluationResult) => void;
  onFailed: (error: unknown) => void;
  onReleased: () => void;
  recordingController: AbortController | null;
  recordingControllerRef: MutableRef<AbortController | null>;
  session: SpeechRecordingSession;
  targetText: string;
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export async function finishSpeechOperation({
  evaluate,
  evaluationControllerRef,
  generation,
  getCurrentGeneration,
  onCancelled,
  onEvaluated,
  onFailed,
  onReleased,
  recordingController,
  recordingControllerRef,
  session,
  targetText,
}: FinishSpeechOperationOptions) {
  const isCurrent = () => getCurrentGeneration() === generation;
  let evaluationController: AbortController | null = null;

  if (!isCurrent()) return;
  onReleased();

  try {
    const audio = await session.stop();
    if (!isCurrent()) return;

    evaluationController = new AbortController();
    evaluationControllerRef.current = evaluationController;
    const result = await evaluate({
      audio,
      signal: evaluationController.signal,
      targetText,
    });
    if (!isCurrent()) return;

    onEvaluated(result);
  } catch (caughtError) {
    if (!isCurrent()) return;

    if (isAbortError(caughtError)) {
      onCancelled();
      return;
    }
    onFailed(caughtError);
  } finally {
    if (recordingControllerRef.current === recordingController) {
      recordingControllerRef.current = null;
    }
    if (evaluationControllerRef.current === evaluationController) {
      evaluationControllerRef.current = null;
    }
  }
}
