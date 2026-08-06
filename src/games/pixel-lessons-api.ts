import {
  preparePixelLesson,
  type PreparedPixelLesson,
} from "../../lib/pixel-lesson-data.ts";

export type PixelLessonsRequestOptions = {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
};

export class PixelLessonsApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PixelLessonsApiError";
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function generatePixelLesson(
  topic: string,
  {
    fetch: request = globalThis.fetch,
    signal,
  }: PixelLessonsRequestOptions = {},
): Promise<PreparedPixelLesson> {
  let response: Response;
  try {
    response = await request("/api/pixel-lessons/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
      signal,
    });
  } catch (caughtError) {
    if (caughtError instanceof Error && caughtError.name === "AbortError") {
      throw caughtError;
    }
    throw new PixelLessonsApiError(
      0,
      "network_error",
      "The pixel lesson request could not be completed.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error =
      payload && typeof payload === "object"
        ? (payload as { error?: unknown; message?: unknown })
        : {};
    const code =
      typeof error.error === "string" ? error.error : "request_failed";
    const message =
      typeof error.message === "string"
        ? error.message
        : "The pixel lesson request could not be completed.";
    throw new PixelLessonsApiError(response.status, code, message);
  }

  if (!isRecord(payload) || !("lesson" in payload)) {
    throw new PixelLessonsApiError(
      502,
      "invalid_response",
      "The pixel lesson service returned an invalid response.",
    );
  }

  try {
    const prepared = preparePixelLesson(
      payload.lesson,
      "pixel lesson response",
    );
    const serverWarnings = Array.isArray(payload.warnings)
      ? payload.warnings.filter(
          (warning): warning is string => typeof warning === "string",
        )
      : [];
    return {
      lesson: prepared.lesson,
      warnings: [...serverWarnings, ...prepared.warnings],
    };
  } catch {
    throw new PixelLessonsApiError(
      502,
      "invalid_response",
      "The pixel lesson service returned an invalid response.",
    );
  }
}
