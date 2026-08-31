export { loadLessonRecordingConsent } from "../learner-profile/learner-profile-api.ts";

export type LessonRecordingSlot = {
  lessonId: string;
  sceneIndex: number;
  stepIndex: number;
};

export type LessonRecordingRequestOptions = {
  expectedLearnerProfileId: string;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
};

export type LessonRecordingSaveResult =
  | { recordedAt: string; saved: true }
  | {
      reason:
        | "learner_selection_changed"
        | "recording_disabled";
      saved: false;
    };

const EXPECTED_LEARNER_PROFILE_HEADER =
  "X-Parrot-Expected-Learner-Profile";
const MAX_EXPECTED_LEARNER_PROFILE_BYTES = 128;

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
    expectedLearnerProfileId,
    fetch: request = globalThis.fetch,
    signal,
  }: LessonRecordingRequestOptions,
): Promise<LessonRecordingSaveResult> {
  if (
    typeof expectedLearnerProfileId !== "string" ||
    !expectedLearnerProfileId ||
    expectedLearnerProfileId.trim() !== expectedLearnerProfileId ||
    new TextEncoder().encode(expectedLearnerProfileId).byteLength >
      MAX_EXPECTED_LEARNER_PROFILE_BYTES
  ) {
    throw new LessonRecordingApiError(
      0,
      "invalid_expected_learner_profile",
      "The learner selection is invalid.",
    );
  }
  const headers: Record<string, string> = {
    "Content-Type": blob.type,
    [EXPECTED_LEARNER_PROFILE_HEADER]: expectedLearnerProfileId,
  };
  const response = await request(
    `/api/lesson-recordings/parrot/${encodeURIComponent(slot.lessonId)}/scenes/${slot.sceneIndex}/steps/${slot.stepIndex}`,
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
  if (response.status === 409 && code === "learner_selection_changed") {
    return { reason: "learner_selection_changed", saved: false };
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
