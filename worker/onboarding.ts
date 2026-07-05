import {
  ensureV2Profile,
  getV2CurrentQuestion,
  getV2Progress,
  isSameV2Answer,
  isV2Complete,
  readV2Answers,
  writeV2Response,
} from "../lib/onboarding-profile.js";
import { skipProfileQuestion } from "../lib/onboarding.js";
import { STATIC_AUDIO_LINES } from "../lib/static-audio.js";
import type { AuthEnv } from "./auth.ts";
import type { Database } from "./database.ts";
import {
  handleOnboardingTranscription,
  type ApiEnv,
} from "./groq.ts";
import {
  synthesizeAcknowledgment,
  type ElevenLabsEnv,
} from "./onboarding-acknowledgment-audio.ts";
import { ONBOARDING_QUESTIONNAIRE } from "./onboarding-definition.ts";
import {
  enrichOnboardingAnswer,
  type OnboardingEnrichment,
  type OnboardingEnrichmentResult,
} from "./onboarding-enrichment.ts";
import { createOnboardingRepository } from "./onboarding-repository.ts";
import {
  readBoundedText,
  RequestBodyTooLargeError,
} from "./request-body.ts";

export interface OnboardingIdentity {
  sessionId: string;
  userId: string;
  userName: string | null;
}

export interface OnboardingRequestInput {
  database: Database;
  env: AuthEnv & ApiEnv & ElevenLabsEnv;
  identity: OnboardingIdentity;
  request: Request;
}

type HandlerDependencies = {
  enrichAnswer: typeof enrichOnboardingAnswer;
  synthesizeAudio: typeof synthesizeAcknowledgment;
  now: () => Date;
};

type Repository = ReturnType<typeof createOnboardingRepository>;
type Profile = Awaited<ReturnType<Repository["loadProfile"]>>;
type Question = (typeof ONBOARDING_QUESTIONNAIRE.questions)[number];

const MAX_PROFILE_BODY_BYTES = 16 * 1024;

class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldError?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    fieldError?: string,
    details?: Record<string, unknown>
  ) {
    super(code);
    this.status = status;
    this.code = code;
    this.fieldError = fieldError;
    this.details = details;
  }
}

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return Response.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function resolveAudio(audioId: string, expectedText: string) {
  const line = STATIC_AUDIO_LINES[audioId];
  if (!line || line.speaker !== "peppa" || line.text !== expectedText) {
    throw new Error("Question audio is unavailable.");
  }
  return { id: audioId, src: line.src, text: line.text };
}

function serializeQuestion(question: Question) {
  return {
    answerKey: question.answerKey,
    position: question.position,
    promptEn: question.promptEn,
    promptZh: question.promptZh,
    required: question.required,
    maxLength: question.maxLength,
    audio: resolveAudio(question.audioId, question.promptEn),
  };
}

function isV2Profile(profile: Profile) {
  try {
    readV2Answers(profile);
    return true;
  } catch {
    return false;
  }
}

function clientProfile(profile: Profile) {
  const readable = isV2Profile(profile)
    ? profile
    : ensureV2Profile(profile, ONBOARDING_QUESTIONNAIRE, {
        forProfileEdit: true,
      });
  return {
    name: profile.name,
    age: profile.age,
    answers: readV2Answers(readable),
    questionnaireVersion: ONBOARDING_QUESTIONNAIRE.version,
    currentQuestionKey: profile.currentQuestionKey,
    onboardingStatus: profile.onboardingStatus,
    completedAt: profile.completedAt,
  };
}

async function prepareOnboardingProfile(
  repository: Repository,
  identity: OnboardingIdentity
) {
  const stored = await repository.loadProfile(identity);
  const prepared = ensureV2Profile(stored, ONBOARDING_QUESTIONNAIRE);
  if (
    prepared.answersJson !== stored.answersJson ||
    prepared.currentQuestionKey !== stored.currentQuestionKey ||
    prepared.onboardingStatus !== stored.onboardingStatus ||
    prepared.skippedQuestionKeysJson !== stored.skippedQuestionKeysJson
  ) {
    await repository.saveAnswer(stored.id, {
      answersJson: prepared.answersJson,
      currentQuestionKey: prepared.currentQuestionKey,
      onboardingStatus: prepared.onboardingStatus,
      skippedQuestionKeysJson: prepared.skippedQuestionKeysJson,
    });
    return repository.loadProfile(identity);
  }
  return stored;
}

function onboardingPayload(profile: Profile, canBypass: boolean) {
  const completed = profile.onboardingStatus === "completed";
  const readable = isV2Profile(profile)
    ? profile
    : ensureV2Profile(profile, ONBOARDING_QUESTIONNAIRE, {
        forProfileEdit: true,
      });
  const question = completed
    ? null
    : getV2CurrentQuestion(readable, ONBOARDING_QUESTIONNAIRE);
  return {
    mode: "full" as const,
    profile: clientProfile(profile),
    questionnaire: { version: ONBOARDING_QUESTIONNAIRE.version },
    question: question ? serializeQuestion(question) : null,
    progress: completed
      ? {
          answered: ONBOARDING_QUESTIONNAIRE.questions.length,
          current: ONBOARDING_QUESTIONNAIRE.questions.length,
          total: ONBOARDING_QUESTIONNAIRE.questions.length,
        }
      : getV2Progress(readable, ONBOARDING_QUESTIONNAIRE),
    canBypass,
  };
}

function profilePayload(profile: Profile) {
  return {
    profile: clientProfile(profile),
    questions: ONBOARDING_QUESTIONNAIRE.questions.map(serializeQuestion),
  };
}

function bypassOnlyPayload() {
  return { mode: "bypass-only" as const, canBypass: true as const };
}

async function readJsonRecord(request: Request) {
  let body: string;
  try {
    body = await readBoundedText(request, MAX_PROFILE_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw new ApiError(413, "payload_too_large");
    }
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new ApiError(400, "invalid_json");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_json");
  }

  return value as Record<string, unknown>;
}

function parseAnswerRecord(record: Record<string, unknown>) {
  if (
    Object.keys(record).some(
      (key) => key !== "questionKey" && key !== "rawAnswer"
    )
  ) {
    throw new ApiError(
      400,
      "invalid_answer",
      "Only the question key and answer may be submitted."
    );
  }
  if (typeof record.questionKey !== "string") {
    throw new ApiError(400, "invalid_answer", "A question key is required.");
  }
  if (typeof record.rawAnswer !== "string") {
    throw new ApiError(400, "invalid_answer", "Please enter an answer.");
  }
  const rawAnswer = record.rawAnswer.trim();
  if (!rawAnswer) {
    throw new ApiError(400, "invalid_answer", "Please answer this question.");
  }
  return { questionKey: record.questionKey, rawAnswer };
}

async function readAnswerBody(request: Request) {
  return parseAnswerRecord(await readJsonRecord(request));
}

function parseProfileEditRecord(record: Record<string, unknown>) {
  if (!("answers" in record)) {
    return {
      kind: "single" as const,
      ...parseAnswerRecord(record),
    };
  }
  if (
    Object.keys(record).some((key) => key !== "answers") ||
    record.answers === null ||
    typeof record.answers !== "object" ||
    Array.isArray(record.answers)
  ) {
    throw new ApiError(400, "invalid_profile");
  }
  return {
    kind: "bulk" as const,
    answers: record.answers as Record<string, unknown>,
  };
}

async function readQuestionKeyBody(request: Request) {
  const record = await readJsonRecord(request);
  if (Object.keys(record).some((key) => key !== "questionKey")) {
    throw new ApiError(
      400,
      "invalid_answer",
      "Only the question key may be submitted."
    );
  }
  if (typeof record.questionKey !== "string") {
    throw new ApiError(400, "invalid_answer", "A question key is required.");
  }
  return { questionKey: record.questionKey };
}

function findQuestion(answerKey: string) {
  return (
    ONBOARDING_QUESTIONNAIRE.questions.find(
      (question) => question.answerKey === answerKey
    ) ?? null
  );
}

function savedEnrichment(profile: Profile, answerKey: string) {
  const response = readV2Answers(profile).responses[answerKey];
  if (!response) return null;
  return {
    summary: response.summary,
    acknowledgment: response.acknowledgment,
    canonicalName: answerKey === "name" ? profile.name : null,
    canonicalAge: answerKey === "age" ? profile.age : null,
    enrichmentStatus: response.enrichmentStatus,
  } satisfies OnboardingEnrichment;
}

async function getEnrichment(
  input: OnboardingRequestInput,
  dependencies: HandlerDependencies,
  profile: Profile,
  question: Question,
  rawAnswer: string
): Promise<OnboardingEnrichmentResult> {
  if (isSameV2Answer(profile, question.answerKey, rawAnswer)) {
    const saved = savedEnrichment(profile, question.answerKey);
    if (saved) return saved;
  }
  return dependencies.enrichAnswer({
    env: input.env,
    question,
    rawAnswer,
  });
}

async function saveAnswer({
  input,
  dependencies,
  repository,
  profile,
  question,
  rawAnswer,
  profileEdit,
}: {
  input: OnboardingRequestInput;
  dependencies: HandlerDependencies;
  repository: Repository;
  profile: Profile;
  question: Question;
  rawAnswer: string;
  profileEdit: boolean;
}) {
  if (rawAnswer.length > Math.min(question.maxLength, 500)) {
    throw new ApiError(
      400,
      "invalid_answer",
      `Please use ${Math.min(question.maxLength, 500)} characters or fewer.`
    );
  }

  const readable = profileEdit
    ? ensureV2Profile(profile, ONBOARDING_QUESTIONNAIRE, {
        forProfileEdit: true,
      })
    : profile;
  const sameAnswer = isSameV2Answer(
    readable,
    question.answerKey,
    rawAnswer
  );
  const enrichment = await getEnrichment(
    input,
    dependencies,
    readable,
    question,
    rawAnswer
  );
  if ("fieldError" in enrichment) {
    throw new ApiError(400, "invalid_answer", enrichment.fieldError);
  }

  let storedProfile = profile;
  let acknowledgment = enrichment.acknowledgment;
  if (!sameAnswer) {
    const updated = writeV2Response(readable, question, {
      rawAnswer,
      ...enrichment,
      answeredAt: dependencies.now().toISOString(),
    });
    acknowledgment =
      readV2Answers(updated).responses[question.answerKey].acknowledgment;

    if (profileEdit) {
      await repository.saveAnswer(profile.id, {
        age: updated.age,
        answersJson: updated.answersJson,
        name: updated.name,
        skippedQuestionKeysJson: updated.skippedQuestionKeysJson,
      });
    } else {
      const next = getV2CurrentQuestion(updated, ONBOARDING_QUESTIONNAIRE);
      const completed = next === null && isV2Complete(
        updated,
        ONBOARDING_QUESTIONNAIRE
      );
      await repository.saveTransition(profile.id, {
        age: updated.age,
        answersJson: updated.answersJson,
        completed,
        currentQuestionKey: next?.answerKey ?? null,
        name: updated.name,
        skippedQuestionKeysJson: updated.skippedQuestionKeysJson,
      });
    }
    storedProfile = await repository.loadProfile(input.identity);
  }

  const audio = await dependencies.synthesizeAudio({
    env: input.env,
    text: acknowledgment,
  });
  return { profile: storedProfile, acknowledgment: { text: acknowledgment, audio } };
}

async function saveProfileAnswers({
  input,
  dependencies,
  repository,
  profile,
  answers,
}: {
  input: OnboardingRequestInput;
  dependencies: HandlerDependencies;
  repository: Repository;
  profile: Profile;
  answers: Record<string, unknown>;
}) {
  let updated = ensureV2Profile(profile, ONBOARDING_QUESTIONNAIRE, {
    forProfileEdit: true,
  });
  const fieldErrors: Record<string, string> = Object.create(null);
  const knownKeys = new Set(
    ONBOARDING_QUESTIONNAIRE.questions.map((question) => question.answerKey)
  );
  for (const answerKey of Object.keys(answers)) {
    if (!knownKeys.has(answerKey)) {
      fieldErrors[answerKey] = "This question is no longer available.";
    }
  }

  const changed: Array<{ question: Question; acknowledgment: string }> = [];
  for (const question of ONBOARDING_QUESTIONNAIRE.questions) {
    if (!(question.answerKey in answers)) continue;
    const submitted = answers[question.answerKey];
    if (typeof submitted !== "string") {
      fieldErrors[question.answerKey] = "Please enter an answer.";
      continue;
    }
    const rawAnswer = submitted.trim();
    const savedResponse =
      readV2Answers(updated).responses[question.answerKey] ?? null;
    const hasCanonicalValue =
      (question.canonicalField === "name" && Boolean(updated.name)) ||
      (question.canonicalField === "age" && updated.age !== null);
    if (!rawAnswer) {
      if (!savedResponse && !hasCanonicalValue) continue;
      fieldErrors[question.answerKey] = "Please answer this question.";
      continue;
    }
    if (rawAnswer.length > Math.min(question.maxLength, 500)) {
      fieldErrors[question.answerKey] =
        `Please use ${Math.min(question.maxLength, 500)} characters or fewer.`;
      continue;
    }
    if (isSameV2Answer(updated, question.answerKey, rawAnswer)) continue;
    if (
      !savedResponse &&
      ((question.canonicalField === "name" &&
        rawAnswer === updated.name?.trim()) ||
        (question.canonicalField === "age" &&
          rawAnswer === String(updated.age ?? "")))
    ) {
      continue;
    }

    const enrichment = await dependencies.enrichAnswer({
      env: input.env,
      question,
      rawAnswer,
    });
    if ("fieldError" in enrichment) {
      fieldErrors[question.answerKey] = enrichment.fieldError;
      continue;
    }

    try {
      updated = writeV2Response(updated, question, {
        rawAnswer,
        ...enrichment,
        answeredAt: dependencies.now().toISOString(),
      });
      changed.push({
        question,
        acknowledgment:
          readV2Answers(updated).responses[question.answerKey].acknowledgment,
      });
    } catch {
      fieldErrors[question.answerKey] = "Please check this answer and try again.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ApiError(400, "invalid_profile", undefined, { fieldErrors });
  }

  let storedProfile = profile;
  if (changed.length > 0) {
    await repository.saveAnswer(profile.id, {
      age: updated.age,
      answersJson: updated.answersJson,
      name: updated.name,
      skippedQuestionKeysJson: updated.skippedQuestionKeysJson,
    });
    storedProfile = await repository.loadProfile(input.identity);
  }

  const acknowledgments = [];
  for (const entry of changed) {
    const audio = await dependencies.synthesizeAudio({
      env: input.env,
      text: entry.acknowledgment,
    });
    acknowledgments.push({ text: entry.acknowledgment, audio });
  }
  return { profile: storedProfile, acknowledgments };
}

export async function handleOnboardingRequest(
  input: OnboardingRequestInput,
  dependencyOverrides: Partial<HandlerDependencies> = {}
): Promise<Response> {
  const dependencies: HandlerDependencies = {
    enrichAnswer: enrichOnboardingAnswer,
    synthesizeAudio: synthesizeAcknowledgment,
    now: () => new Date(),
    ...dependencyOverrides,
  };
  const repository = createOnboardingRepository(input.database);
  const url = new URL(input.request.url);

  try {
    if (url.pathname === "/api/onboarding/transcribe") {
      return handleOnboardingTranscription(input.request, input.env);
    }

    if (url.pathname === "/api/onboarding" && input.request.method === "GET") {
      const profile = await prepareOnboardingProfile(repository, input.identity);
      return jsonResponse(
        onboardingPayload(profile, await repository.canBypass(input.identity))
      );
    }

    if (
      url.pathname === "/api/onboarding/answer" &&
      input.request.method === "PUT"
    ) {
      const body = await readAnswerBody(input.request);
      const profile = await prepareOnboardingProfile(repository, input.identity);
      const question = findQuestion(body.questionKey);
      if (!question) {
        throw new ApiError(
          409,
          "invalid_answer",
          "This question is no longer available."
        );
      }
      const repeated = isSameV2Answer(
        profile,
        question.answerKey,
        body.rawAnswer
      );
      const current = getV2CurrentQuestion(profile, ONBOARDING_QUESTIONNAIRE);
      if (!repeated && current?.answerKey !== question.answerKey) {
        throw new ApiError(
          409,
          "invalid_answer",
          "Please answer the current question first."
        );
      }

      const saved = await saveAnswer({
        input,
        dependencies,
        repository,
        profile,
        question,
        rawAnswer: body.rawAnswer,
        profileEdit: false,
      });
      return jsonResponse({
        ...onboardingPayload(
          saved.profile,
          await repository.canBypass(input.identity)
        ),
        acknowledgment: saved.acknowledgment,
      });
    }

    if (
      url.pathname === "/api/onboarding/question/skip" &&
      input.request.method === "POST"
    ) {
      const body = await readQuestionKeyBody(input.request);
      const profile = await prepareOnboardingProfile(repository, input.identity);
      const question = findQuestion(body.questionKey);
      if (!question) {
        throw new ApiError(
          409,
          "invalid_answer",
          "This question is no longer available."
        );
      }
      if (
        getV2CurrentQuestion(profile, ONBOARDING_QUESTIONNAIRE)?.answerKey !==
        question.answerKey
      ) {
        throw new ApiError(
          409,
          "invalid_answer",
          "Please answer the current question first."
        );
      }
      if (question.required) {
        throw new ApiError(400, "invalid_answer", "This question is required.");
      }

      const updated = skipProfileQuestion(profile, question.answerKey);
      const next = getV2CurrentQuestion(updated, ONBOARDING_QUESTIONNAIRE);
      await repository.saveTransition(profile.id, {
        age: updated.age,
        answersJson: updated.answersJson,
        completed: next === null && isV2Complete(updated, ONBOARDING_QUESTIONNAIRE),
        currentQuestionKey: next?.answerKey ?? null,
        name: updated.name,
        skippedQuestionKeysJson: updated.skippedQuestionKeysJson,
      });
      const stored = await repository.loadProfile(input.identity);
      return jsonResponse(
        onboardingPayload(stored, await repository.canBypass(input.identity))
      );
    }

    if (
      url.pathname === "/api/onboarding/skip" &&
      input.request.method === "POST"
    ) {
      await repository.skipSession(input.identity);
      try {
        const profile = await prepareOnboardingProfile(repository, input.identity);
        await repository.skip(profile.id, input.identity.sessionId);
        return jsonResponse(onboardingPayload(profile, true));
      } catch {
        return jsonResponse(bypassOnlyPayload());
      }
    }

    if (
      url.pathname === "/api/onboarding/complete" &&
      input.request.method === "POST"
    ) {
      const profile = await prepareOnboardingProfile(repository, input.identity);
      if (profile.onboardingStatus !== "completed") {
        const missing = getV2CurrentQuestion(profile, ONBOARDING_QUESTIONNAIRE);
        if (missing || !isV2Complete(profile, ONBOARDING_QUESTIONNAIRE)) {
          throw new ApiError(409, "onboarding_incomplete", undefined, {
            missingQuestionKey: missing?.answerKey ?? null,
          });
        }
        await repository.complete(profile.id);
      }
      const completed = await repository.loadProfile(input.identity);
      return jsonResponse(onboardingPayload(completed, true));
    }

    if (url.pathname === "/api/profile" && input.request.method === "GET") {
      const profile = await repository.loadProfile(input.identity);
      return jsonResponse(profilePayload(profile));
    }

    if (url.pathname === "/api/profile" && input.request.method === "PUT") {
      const body = parseProfileEditRecord(await readJsonRecord(input.request));
      const profile = await repository.loadProfile(input.identity);
      if (body.kind === "bulk") {
        const saved = await saveProfileAnswers({
          input,
          dependencies,
          repository,
          profile,
          answers: body.answers,
        });
        return jsonResponse({
          ...profilePayload(saved.profile),
          acknowledgments: saved.acknowledgments,
        });
      }
      const question = findQuestion(body.questionKey);
      if (!question) {
        throw new ApiError(
          409,
          "invalid_answer",
          "This question is no longer available."
        );
      }
      const saved = await saveAnswer({
        input,
        dependencies,
        repository,
        profile,
        question,
        rawAnswer: body.rawAnswer,
        profileEdit: true,
      });
      return jsonResponse({
        ...profilePayload(saved.profile),
        acknowledgment: saved.acknowledgment,
      });
    }

    const recognized =
      url.pathname === "/api/onboarding" ||
      url.pathname === "/api/onboarding/answer" ||
      url.pathname === "/api/onboarding/question/skip" ||
      url.pathname === "/api/onboarding/skip" ||
      url.pathname === "/api/onboarding/complete" ||
      url.pathname === "/api/profile";
    return jsonResponse(
      { error: recognized ? "method_not_allowed" : "not_found" },
      { status: recognized ? 405 : 404 }
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse(
        {
          error: error.code,
          ...(error.fieldError ? { fieldError: error.fieldError } : {}),
          ...(error.details ?? {}),
        },
        { status: error.status }
      );
    }
    return jsonResponse({ error: "questionnaire_unavailable" }, { status: 503 });
  }
}
