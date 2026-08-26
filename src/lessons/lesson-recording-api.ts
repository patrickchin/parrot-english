export { loadLessonRecordingConsent } from "../learner-profile/learner-profile-api.ts";

export type LessonRecordingSlot = {
  lessonId: string;
  lessonRevision?: string;
  sceneIndex: number;
  source: "my" | "parrot";
  stepIndex: number;
};

export type LessonRecordingRequestOptions = {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
};

export type LessonRecordingSaveResult =
  | { recordedAt: string; saved: true }
  | {
      reason: "lesson_changed" | "recording_disabled";
      saved: false;
    };

export class LessonRecordingApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "LessonRecordingApiError";
    this.code = code;
    this.status = status;
  }
}

export async function saveLessonRecording(
  blob: Blob,
  slot: LessonRecordingSlot,
  {
    fetch: request = globalThis.fetch,
    signal,
  }: LessonRecordingRequestOptions = {},
): Promise<LessonRecordingSaveResult> {
  const headers: Record<string, string> = { "Content-Type": blob.type };
  if (slot.source === "my" && slot.lessonRevision) {
    headers["X-Parrot-Lesson-Revision"] = slot.lessonRevision;
  }
  const response = await request(
    `/api/lesson-recordings/${slot.source}/${encodeURIComponent(slot.lessonId)}/scenes/${slot.sceneIndex}/steps/${slot.stepIndex}`,
    {
      body: blob,
      headers,
      method: "PUT",
      signal,
    },
  );
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // The typed fallback below deliberately does not expose response content.
  }
  const error =
    payload && typeof payload === "object"
      ? payload as { error?: unknown; message?: unknown; recordedAt?: unknown }
      : {};
  const code = typeof error.error === "string" ? error.error : "request_failed";
  if (
    (response.status === 403 && code === "guardian_consent_required") ||
    (response.status === 409 && code === "account_deletion_pending")
  ) {
    return { reason: "recording_disabled", saved: false };
  }
  if (response.status === 409 && code === "lesson_changed") {
    return { reason: "lesson_changed", saved: false };
  }
  if (!response.ok) {
    throw new LessonRecordingApiError(
      response.status,
      code,
      typeof error.message === "string"
        ? error.message
        : "The lesson recording could not be saved.",
    );
  }
  if (typeof error.recordedAt !== "string") {
    throw new LessonRecordingApiError(
      response.status,
      "invalid_response",
      "The lesson recording response was invalid.",
    );
  }
  return { recordedAt: error.recordedAt, saved: true };
}
