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
  audio: {
    contentType: "audio/mpeg";
    base64: string;
  } | null;
};

export type LearnerProfileSummary = {
  name: string | null;
  age: number | null;
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

export type LearnerProfileState =
  | FullLearnerProfileState
  | BypassOnlyLearnerProfileState;

export type ProfileState = {
  profile: LearnerProfileSummary;
  questions: LearnerProfileQuestion[];
  acknowledgment?: LearnerProfileAcknowledgment;
  acknowledgments?: LearnerProfileAcknowledgment[];
};

export type LearnerProfileRequestOptions = {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
};

export class LearnerProfileApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "LearnerProfileApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
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
  { fetch: request = globalThis.fetch, signal }: LearnerProfileRequestOptions = {}
): Promise<Result> {
  const response = await request(path, { ...init, signal });
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
    throw new LearnerProfileApiError(
      response.status,
      code,
      message,
      stringRecord(errorPayload.fieldErrors),
    );
  }

  return payload as Result;
}

function jsonRequest<Result>(
  path: string,
  method: "PUT",
  questionKey: string,
  rawAnswer: string,
  options?: LearnerProfileRequestOptions
) {
  return requestJson<Result>(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionKey, rawAnswer }),
    },
    options
  );
}

export function loadLearnerProfile(options?: LearnerProfileRequestOptions) {
  return requestJson<LearnerProfileState>(
    "/api/learner-profile",
    { method: "GET" },
    options
  );
}

export function saveLearnerProfileAnswer(
  questionKey: string,
  rawAnswer: string,
  options?: LearnerProfileRequestOptions
) {
  return jsonRequest<LearnerProfileState>(
    "/api/learner-profile/answer",
    "PUT",
    questionKey,
    rawAnswer,
    options
  );
}

export function skipLearnerProfile(options?: LearnerProfileRequestOptions) {
  return requestJson<LearnerProfileState>(
    "/api/learner-profile/skip",
    { method: "POST" },
    options
  );
}

export function skipLearnerProfileQuestion(
  questionKey: string,
  options?: LearnerProfileRequestOptions
) {
  return requestJson<LearnerProfileState>(
    "/api/learner-profile/question/skip",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionKey }),
    },
    options
  );
}

export function completeLearnerProfile(options?: LearnerProfileRequestOptions) {
  return requestJson<LearnerProfileState>(
    "/api/learner-profile/complete",
    { method: "POST" },
    options
  );
}

export function loadProfile(options?: LearnerProfileRequestOptions) {
  return requestJson<ProfileState>(
    "/api/profile",
    { method: "GET" },
    options
  );
}

export function saveProfileAnswer(
  questionKey: string,
  rawAnswer: string,
  options?: LearnerProfileRequestOptions
) {
  return jsonRequest<ProfileState>(
    "/api/profile",
    "PUT",
    questionKey,
    rawAnswer,
    options
  );
}

export function saveProfileAnswers(
  answers: Record<string, string>,
  options?: LearnerProfileRequestOptions,
) {
  return requestJson<ProfileState>(
    "/api/profile",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    },
    options,
  );
}

export function transcribeLearnerProfileAudio(
  audio: Blob,
  options?: LearnerProfileRequestOptions
) {
  const formData = new FormData();
  formData.set("audio", audio, "learner-profile-answer.webm");
  return requestJson<{ transcript: string }>(
    "/api/learner-profile/transcribe",
    { method: "POST", body: formData },
    options
  );
}
