export type EvaluationResult = {
  transcript: string;
  similarity: number;
  passed: boolean;
  feedbackText: string;
  retryAllowed: boolean;
};

type TimerId = ReturnType<typeof setTimeout>;

type EvaluationRequestOptions = {
  audio: Blob;
  clearTimeout?: (timerId: TimerId) => void;
  fetch?: typeof globalThis.fetch;
  setTimeout?: (callback: () => void, delay: number) => TimerId;
  signal?: AbortSignal;
  targetText: string;
  timeoutMs?: number;
};

const DEFAULT_EVALUATION_TIMEOUT_MS = 20_000;

function createAbortError() {
  const error = new Error("Speech evaluation was cancelled.");
  error.name = "AbortError";
  return error;
}

async function readJsonError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string; error?: string };
    return payload.message ?? payload.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function evaluateSpeech({
  audio,
  clearTimeout: clearEvaluationTimeout = globalThis.clearTimeout,
  fetch: request = globalThis.fetch,
  setTimeout: setEvaluationTimeout = globalThis.setTimeout,
  signal,
  targetText,
  timeoutMs = DEFAULT_EVALUATION_TIMEOUT_MS,
}: EvaluationRequestOptions): Promise<EvaluationResult> {
  if (signal?.aborted) throw createAbortError();

  const controller = new AbortController();
  let timeoutId: TimerId | null = null;

  const abortEvaluation = () => controller.abort();
  signal?.addEventListener("abort", abortEvaluation, { once: true });

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setEvaluationTimeout(() => {
      controller.abort();
      reject(createAbortError());
    }, timeoutMs);
  });

  const formData = new FormData();
  formData.set("targetText", targetText);
  formData.set("audio", audio, "child-response.webm");

  try {
    const response = await Promise.race([
      request("/api/evaluate-speech", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      }),
      timeout,
    ]);

    if (!response.ok) {
      throw new Error(await readJsonError(response));
    }

    return (await response.json()) as EvaluationResult;
  } finally {
    if (timeoutId !== null) clearEvaluationTimeout(timeoutId);
    signal?.removeEventListener("abort", abortEvaluation);
  }
}
