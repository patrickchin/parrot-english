import type { LearnerStoryLevelId } from "../../lib/story-level.ts";
import { notifyGuardianAccessRequired } from "../auth/guardian-access-api.ts";

export type LearnerProfileAudio = {
  id: string;
  src: string;
  text: string;
};

export type LearnerProfileQuestion = {
  answerKey: string;
  position: number;
  promptEn: string;
  promptZh: string | null;
  required: boolean;
  maxLength: number;
  audio: LearnerProfileAudio | null;
};

export type LearnerProfileResponseSnapshot = {
  question: string;
  rawAnswer: string;
  summary: string;
  acknowledgment: string;
  enrichmentStatus: "generated" | "fallback";
  answeredAt: string;
};

export type LearnerProfileAnswers = {
  schemaVersion: 2;
  questionnaireVersion: number;
  responses: Record<string, LearnerProfileResponseSnapshot>;
  legacyAnswers: Record<string, unknown> | null;
  description?: string | null;
};

export type LearnerProfileAcknowledgment = {
  text: string;
  audio?: LearnerProfileAudio | null;
};

export type LearnerProfileSummary = {
  id: string;
  name: string | null;
  age: number | null;
  storyLevel: LearnerStoryLevelId;
  description: string | null;
  answers: LearnerProfileAnswers;
  questionnaireVersion: number;
  currentQuestionKey: string | null;
  profileStatus: "not_started" | "in_progress" | "completed";
  completedAt: string | null;
};

export type FullLearnerProfileState = {
  mode: "full";
  experienceMode: "realtime" | "form";
  profile: LearnerProfileSummary;
  questionnaire: {
    version: number;
  };
  question: LearnerProfileQuestion | null;
  progress: { answered: number; current: number; total: number };
  canBypass: boolean;
  acknowledgment?: LearnerProfileAcknowledgment;
};

export type BypassOnlyLearnerProfileState = {
  mode: "bypass-only";
  canBypass: true;
};

export type SelectionRequiredLearnerProfileState = {
  mode: "selection-required";
};

export type LearnerProfileState =
  | FullLearnerProfileState
  | BypassOnlyLearnerProfileState
  | SelectionRequiredLearnerProfileState;

export type GuardianLearnerProfileSummary = {
  id: string;
  name: string;
  age: number | null;
  profileStatus: LearnerProfileSummary["profileStatus"];
  createdAt: string;
  deletionPending: boolean;
};

export type LearnerProfileRoster = {
  activeProfileId: string | null;
  profiles: GuardianLearnerProfileSummary[];
};

export type LearnerProfileCreationResult = LearnerProfileRoster & {
  createdProfileId: string;
};

export type ProfileState = {
  profile: LearnerProfileSummary & {
    lessonRecordingCleanupPending: boolean;
    lessonRecordingConsent: boolean;
  };
  questions: LearnerProfileQuestion[];
  acknowledgment?: LearnerProfileAcknowledgment;
  acknowledgments?: LearnerProfileAcknowledgment[];
};

export type LearnerProfileRequestOptions = {
  fetch?: typeof globalThis.fetch;
  learnerProfileId?: string;
  signal?: AbortSignal;
};

export type CreateLearnerProfileOptions = LearnerProfileRequestOptions & {
  activate?: boolean;
};

export class LearnerProfileApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;
  readonly isFieldError: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors: Record<string, string> = {},
    isFieldError = false,
  ) {
    super(message);
    this.name = "LearnerProfileApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.isFieldError = isFieldError;
  }
}

export class LearnerProfileDeletionError extends Error {
  readonly code:
    | "learner_deletion_pending"
    | "learner_deletion_uncertain";
  readonly roster?: LearnerProfileRoster;

  constructor(
    code: "learner_deletion_pending" | "learner_deletion_uncertain",
    message: string,
    roster?: LearnerProfileRoster,
  ) {
    super(message);
    this.name = "LearnerProfileDeletionError";
    this.code = code;
    this.roster = roster;
  }
}

function stringRecord(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

async function requestJson<Result>(
  path: string,
  init: RequestInit,
  {
    fetch: request = globalThis.fetch,
    learnerProfileId,
    signal,
  }: LearnerProfileRequestOptions = {},
): Promise<Result> {
  const response = await request(
    appendLearnerProfileTarget(path, learnerProfileId),
    { ...init, signal },
  );
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorPayload =
      payload !== null && typeof payload === "object"
        ? (payload as {
            error?: unknown;
            fieldError?: unknown;
            fieldErrors?: unknown;
            message?: unknown;
          })
        : {};
    const code =
      typeof errorPayload.error === "string"
        ? errorPayload.error
        : "request_failed";
    const message =
      typeof errorPayload.fieldError === "string"
        ? errorPayload.fieldError
        : typeof errorPayload.message === "string"
          ? errorPayload.message
          : "The request could not be completed.";
    if (response.status === 403 && code === "guardian_required") {
      notifyGuardianAccessRequired();
    }
    throw new LearnerProfileApiError(
      response.status,
      code,
      message,
      stringRecord(errorPayload.fieldErrors),
      typeof errorPayload.fieldError === "string",
    );
  }

  return payload as Result;
}

function appendLearnerProfileTarget(
  path: string,
  learnerProfileId: string | undefined,
) {
  if (learnerProfileId === undefined) return path;
  return `${path}?${new URLSearchParams({ learnerProfileId })}`;
}

function jsonRequest<Result>(
  path: string,
  method: "PUT",
  questionKey: string,
  rawAnswer: string,
  options?: LearnerProfileRequestOptions,
) {
  return requestJson<Result>(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionKey, rawAnswer }),
    },
    options,
  );
}

function requireValidLearnerProfileState(
  state: LearnerProfileState,
): LearnerProfileState {
  if (
    state.mode === "full" &&
    (typeof state.profile?.id !== "string" || !state.profile.id.trim())
  ) {
    throw new LearnerProfileApiError(
      200,
      "invalid_profile",
      "The learner profile could not be loaded.",
    );
  }
  return state;
}

function requireValidProfileState(state: ProfileState): ProfileState {
  if (typeof state.profile?.id !== "string" || !state.profile.id.trim()) {
    throw new LearnerProfileApiError(
      200,
      "invalid_profile",
      "The learner profile could not be loaded.",
    );
  }
  return state;
}

function requireValidLearnerProfileRoster(
  roster: LearnerProfileRoster,
): LearnerProfileRoster {
  const profiles = roster?.profiles;
  const activeProfileId = roster?.activeProfileId;
  const ids = new Set<string>();
  const validProfiles =
    Array.isArray(profiles) &&
    profiles.every((profile) => {
      if (
        profile === null ||
        typeof profile !== "object" ||
        typeof profile.id !== "string" ||
        !profile.id.trim() ||
        ids.has(profile.id) ||
        typeof profile.deletionPending !== "boolean" ||
        typeof profile.name !== "string" ||
        !profile.name.trim()
      ) {
        return false;
      }
      ids.add(profile.id);
      return true;
    });
  const validActiveProfile =
    activeProfileId === null ||
    (typeof activeProfileId === "string" &&
      Boolean(activeProfileId.trim()) &&
      ids.has(activeProfileId));

  if (!validProfiles || !validActiveProfile) {
    throw new LearnerProfileApiError(
      200,
      "invalid_roster",
      "Learner profiles could not be loaded.",
    );
  }
  return roster;
}

function requireValidLearnerProfileCreation(
  result: LearnerProfileCreationResult,
): LearnerProfileCreationResult {
  const roster = requireValidLearnerProfileRoster(result);
  if (
    typeof result.createdProfileId !== "string" ||
    !result.createdProfileId.trim() ||
    !roster.profiles.some(({ id }) => id === result.createdProfileId)
  ) {
    throw new LearnerProfileApiError(
      200,
      "invalid_roster",
      "Learner profiles could not be loaded.",
    );
  }
  return result;
}

async function learnerProfileRequest(
  path: string,
  init: RequestInit,
  options?: LearnerProfileRequestOptions,
) {
  return requireValidLearnerProfileState(
    await requestJson<LearnerProfileState>(path, init, options),
  );
}

async function profileRequest(
  path: string,
  init: RequestInit,
  options?: LearnerProfileRequestOptions,
) {
  return requireValidProfileState(
    await requestJson<ProfileState>(path, init, options),
  );
}

export async function loadLearnerProfile(
  options?: LearnerProfileRequestOptions,
) {
  try {
    return await learnerProfileRequest(
      "/api/learner-profile",
      { method: "GET" },
      options,
    );
  } catch (error) {
    if (
      error instanceof LearnerProfileApiError &&
      error.status === 409 &&
      error.code === "learner_selection_required"
    ) {
      return { mode: "selection-required" } as const;
    }
    throw error;
  }
}

export function saveLearnerProfileAnswer(
  questionKey: string,
  rawAnswer: string,
  options?: LearnerProfileRequestOptions,
) {
  return learnerProfileRequest(
    "/api/learner-profile/answer",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionKey, rawAnswer }),
    },
    options,
  );
}

export function skipLearnerProfile(options?: LearnerProfileRequestOptions) {
  return learnerProfileRequest(
    "/api/learner-profile/skip",
    { method: "POST" },
    options,
  );
}

export function skipLearnerProfileQuestion(
  questionKey: string,
  options?: LearnerProfileRequestOptions,
) {
  return learnerProfileRequest(
    "/api/learner-profile/question/skip",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionKey }),
    },
    options,
  );
}

export function completeLearnerProfile(options?: LearnerProfileRequestOptions) {
  return learnerProfileRequest(
    "/api/learner-profile/complete",
    { method: "POST" },
    options,
  );
}

async function learnerProfilesRequest(
  path: string,
  init: RequestInit,
  options?: LearnerProfileRequestOptions,
) {
  return requireValidLearnerProfileRoster(
    await requestJson<LearnerProfileRoster>(path, init, options),
  );
}

export function loadLearnerProfiles(options?: LearnerProfileRequestOptions) {
  return learnerProfilesRequest(
    "/api/learner-profiles",
    { method: "GET" },
    options,
  );
}

export function createLearnerProfile(
  name: string,
  { activate, ...options }: CreateLearnerProfileOptions = {},
) {
  return requestJson<LearnerProfileCreationResult>(
    "/api/learner-profiles",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        activate === undefined ? { name } : { name, activate },
      ),
    },
    options,
  ).then(requireValidLearnerProfileCreation);
}

export function selectLearnerProfile(
  profileId: string,
  options?: LearnerProfileRequestOptions,
) {
  return learnerProfilesRequest(
    `/api/learner-profiles/${encodeURIComponent(profileId)}/active`,
    { method: "PUT" },
    options,
  );
}

export function deleteLearnerProfile(
  profileId: string,
  options?: LearnerProfileRequestOptions,
) {
  return learnerProfilesRequest(
    `/api/learner-profiles/${encodeURIComponent(profileId)}`,
    { method: "DELETE" },
    options,
  );
}

export function loadProfile(options?: LearnerProfileRequestOptions) {
  return profileRequest("/api/profile", { method: "GET" }, options);
}

export async function saveProfileAnswer(
  questionKey: string,
  rawAnswer: string,
  options?: LearnerProfileRequestOptions,
) {
  return requireValidProfileState(
    await jsonRequest<ProfileState>(
      "/api/profile",
      "PUT",
      questionKey,
      rawAnswer,
      options,
    ),
  );
}

export function saveProfileAnswers(
  answers: Record<string, string>,
  options?: LearnerProfileRequestOptions,
) {
  return profileRequest(
    "/api/profile",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    },
    options,
  );
}

export function loadLessonRecordingConsent(
  options?: LearnerProfileRequestOptions,
) {
  return requestJson<{ cleanupPending: boolean; enabled: boolean }>(
    "/api/lesson-recordings/consent",
    { method: "GET" },
    options,
  );
}

export function saveLessonRecordingConsent(
  enabled: boolean,
  options?: LearnerProfileRequestOptions,
) {
  return requestJson<{ cleanupPending: boolean; enabled: boolean }>(
    "/api/profile/lesson-recording-consent",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    },
    options,
  );
}

export function transcribeLearnerProfileAudio(
  audio: Blob,
  options?: LearnerProfileRequestOptions,
) {
  const formData = new FormData();
  formData.set("audio", audio, "learner-profile-answer.webm");
  return requestJson<{ transcript: string }>(
    "/api/learner-profile/transcribe",
    { method: "POST", body: formData },
    options,
  );
}
