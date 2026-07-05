export type OnboardingAudio = {
  id: string;
  src: string;
  text: string;
};

export type OnboardingQuestion = {
  answerKey: string;
  position: number;
  promptEn: string;
  promptZh: string | null;
  answerType: "text" | "number" | "choice";
  cardinality: "scalar" | "array";
  required: boolean;
  options: string[] | null;
  validation: Record<string, number>;
  audio: OnboardingAudio | null;
};

export type LearnerProfileSummary = {
  name: string | null;
  age: number | null;
  answers: Record<string, unknown>;
  questionnaireVersion: number;
  currentQuestionKey: string | null;
  onboardingStatus: "not_started" | "in_progress" | "completed";
  completedAt: string | null;
};

export type FullOnboardingState = {
  mode: "full";
  profile: LearnerProfileSummary;
  questionnaire: {
    version: number;
    introductionAudio: OnboardingAudio;
  };
  question: OnboardingQuestion | null;
  progress: { answered: number; current: number; total: number };
  canBypass: boolean;
};

export type BypassOnlyOnboardingState = {
  mode: "bypass-only";
  canBypass: true;
};

export type OnboardingState =
  | FullOnboardingState
  | BypassOnlyOnboardingState;

export type ProfileState = {
  profile: LearnerProfileSummary;
  questions: OnboardingQuestion[];
};

export type OnboardingRequestOptions = {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
};

export class OnboardingApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors: Record<string, string> = {}
  ) {
    super(message);
    this.name = "OnboardingApiError";
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
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

async function requestJson<Result>(
  path: string,
  init: RequestInit,
  { fetch: request = globalThis.fetch, signal }: OnboardingRequestOptions = {}
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
    throw new OnboardingApiError(
      response.status,
      code,
      message,
      stringRecord(errorPayload.fieldErrors)
    );
  }

  return payload as Result;
}

function jsonRequest<Result>(
  path: string,
  method: "PUT",
  questionKey: string,
  value: unknown,
  options?: OnboardingRequestOptions
) {
  return requestJson<Result>(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionKey, value }),
    },
    options
  );
}

export function loadOnboarding(options?: OnboardingRequestOptions) {
  return requestJson<OnboardingState>(
    "/api/onboarding",
    { method: "GET" },
    options
  );
}

export function saveOnboardingAnswer(
  questionKey: string,
  value: unknown,
  options?: OnboardingRequestOptions
) {
  return jsonRequest<OnboardingState>(
    "/api/onboarding/answer",
    "PUT",
    questionKey,
    value,
    options
  );
}

export function skipOnboarding(options?: OnboardingRequestOptions) {
  return requestJson<OnboardingState>(
    "/api/onboarding/skip",
    { method: "POST" },
    options
  );
}

export function skipOnboardingQuestion(
  questionKey: string,
  options?: OnboardingRequestOptions
) {
  return requestJson<OnboardingState>(
    "/api/onboarding/question/skip",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionKey }),
    },
    options
  );
}

export function completeOnboarding(options?: OnboardingRequestOptions) {
  return requestJson<OnboardingState>(
    "/api/onboarding/complete",
    { method: "POST" },
    options
  );
}

export function loadProfile(options?: OnboardingRequestOptions) {
  return requestJson<ProfileState>(
    "/api/profile",
    { method: "GET" },
    options
  );
}

export function saveProfileAnswers(
  answers: Record<string, unknown>,
  options?: OnboardingRequestOptions
) {
  return requestJson<ProfileState>(
    "/api/profile",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    },
    options
  );
}

export function transcribeOnboardingAudio(
  audio: Blob,
  options?: OnboardingRequestOptions
) {
  const formData = new FormData();
  formData.set("audio", audio, "onboarding-answer.webm");
  return requestJson<{ transcript: string }>(
    "/api/onboarding/transcribe",
    { method: "POST", body: formData },
    options
  );
}
