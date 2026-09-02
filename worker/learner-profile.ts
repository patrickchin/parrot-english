import {
  ensureV2Profile,
  getV2CurrentQuestion,
  getV2Progress,
  isSameV2Answer,
  isV2Complete,
  readV2Answers,
  writeV2Response,
} from "../lib/learner-profile-responses.js";
import {
  LEARNER_PROFILE_ACKNOWLEDGMENT_AUDIO_ID,
  LEARNER_PROFILE_ACKNOWLEDGMENT_TEXT,
} from "../lib/learner-profile-questionnaire.js";
import {
  containsLikelyFullLearnerName,
  containsPrivateLearnerProfileDetails,
  PREFERRED_NAME_FIELD_ERROR,
  PRIVATE_PROFILE_FIELD_ERROR,
} from "../lib/learner-profile-privacy.ts";
import { skipProfileQuestion } from "../lib/learner-profile.js";
import { LESSON_RECORDING_CONSENT_VERSION } from "../lib/lesson-recording-consent.js";
import { STATIC_AUDIO_LINES } from "../lib/static-audio.js";
import type { AuthEnv } from "./auth.ts";
import type { Database } from "./database.ts";
import {
  handleLearnerProfileTranscription,
  type ApiEnv,
} from "./groq.ts";
import { LEARNER_PROFILE_QUESTIONNAIRE } from "./learner-profile-definition.ts";
import {
  enrichLearnerProfileAnswer,
  type LearnerProfileEnrichment,
  type LearnerProfileEnrichmentResult,
} from "./learner-profile-enrichment.ts";
import { createLearnerProfileRepository } from "./learner-profile-repository.ts";
import { deleteAllLessonRecordings } from "./lesson-recording-storage.ts";
import {
  readBoundedText,
  RequestBodyTooLargeError,
} from "./request-body.ts";
import {
  isLearnerNameConflict,
  LEARNER_NAME_CONFLICT_MESSAGE,
  type LearnerIdentity,
} from "./request-identity.ts";

export type LearnerProfileIdentity = LearnerIdentity;

export interface LearnerProfileRequestInput {
  database: Database;
  env: AuthEnv & ApiEnv & { REALTIME_CONVERSATIONS_ENABLED?: string };
  identity: LearnerIdentity;
  request: Request;
}

type HandlerDependencies = {
  enrichAnswer: typeof enrichLearnerProfileAnswer;
  now: () => Date;
  wait: (delay: number) => Promise<void>;
};

type Repository = ReturnType<typeof createLearnerProfileRepository>;
type Profile = Awaited<ReturnType<Repository["loadProfile"]>>;
type Question = (typeof LEARNER_PROFILE_QUESTIONNAIRE.questions)[number];

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

function serializeAcknowledgment(question: Question) {
  const text = question.fallbackAcknowledgment;
  return {
    text,
    audio: resolveAudio(LEARNER_PROFILE_ACKNOWLEDGMENT_AUDIO_ID, text),
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
    : ensureV2Profile(profile, LEARNER_PROFILE_QUESTIONNAIRE, {
        forProfileEdit: true,
      });
  const storedAnswers = readV2Answers(readable);
  const answers = {
    ...storedAnswers,
    responses: Object.fromEntries(
      Object.entries(
        storedAnswers.responses as Record<string, Record<string, unknown>>,
      ).map(([answerKey, response]) => [
        answerKey,
        {
          ...response,
          acknowledgment: LEARNER_PROFILE_ACKNOWLEDGMENT_TEXT,
        },
      ]),
    ),
  };
  return {
    id: profile.id,
    name: profile.name,
    age: profile.age,
    storyLevel: profile.storyLevel,
    description:
      typeof answers.description === "string" ? answers.description : null,
    answers,
    questionnaireVersion: LEARNER_PROFILE_QUESTIONNAIRE.version,
    currentQuestionKey: profile.currentQuestionKey,
    profileStatus: profile.profileStatus,
    completedAt: profile.completedAt,
  };
}

async function prepareLearnerProfile(
  repository: Repository,
  identity: LearnerIdentity
) {
  const stored = await repository.loadProfile(identity);
  const prepared = ensureV2Profile(stored, LEARNER_PROFILE_QUESTIONNAIRE);
  if (
    prepared.answersJson !== stored.answersJson ||
    prepared.currentQuestionKey !== stored.currentQuestionKey ||
    prepared.profileStatus !== stored.profileStatus ||
    prepared.skippedQuestionKeysJson !== stored.skippedQuestionKeysJson
  ) {
    await repository.saveAnswer(identity, {
      answersJson: prepared.answersJson,
      currentQuestionKey: prepared.currentQuestionKey,
      profileStatus: prepared.profileStatus,
      skippedQuestionKeysJson: prepared.skippedQuestionKeysJson,
    });
    return repository.loadProfile(identity);
  }
  return stored;
}

function learnerProfilePayload(
  profile: Profile,
  canBypass: boolean,
  experienceMode: "realtime" | "form",
) {
  const completed = profile.profileStatus === "completed";
  const readable = isV2Profile(profile)
    ? profile
    : ensureV2Profile(profile, LEARNER_PROFILE_QUESTIONNAIRE, {
        forProfileEdit: true,
      });
  const question = completed
    ? null
    : getV2CurrentQuestion(readable, LEARNER_PROFILE_QUESTIONNAIRE);
  return {
    mode: "full" as const,
    profile: clientProfile(profile),
    questionnaire: { version: LEARNER_PROFILE_QUESTIONNAIRE.version },
    question: question ? serializeQuestion(question) : null,
    progress: completed
      ? {
          answered: LEARNER_PROFILE_QUESTIONNAIRE.questions.length,
          current: LEARNER_PROFILE_QUESTIONNAIRE.questions.length,
          total: LEARNER_PROFILE_QUESTIONNAIRE.questions.length,
        }
      : getV2Progress(readable, LEARNER_PROFILE_QUESTIONNAIRE),
    canBypass,
    experienceMode,
  };
}

function learnerProfileExperienceMode(env: LearnerProfileRequestInput["env"]) {
  return env.REALTIME_CONVERSATIONS_ENABLED === "1" ? "realtime" : "form";
}

function profilePayload(profile: Profile) {
  return {
    profile: {
      ...clientProfile(profile),
      lessonRecordingConsent:
        profile.lessonRecordingConsentVersion ===
        LESSON_RECORDING_CONSENT_VERSION,
      lessonRecordingCleanupPending:
        profile.lessonRecordingCleanupBeforeGeneration !== null,
    },
    questions: LEARNER_PROFILE_QUESTIONNAIRE.questions.map(serializeQuestion),
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
    LEARNER_PROFILE_QUESTIONNAIRE.questions.find(
      (question) => question.answerKey === answerKey
    ) ?? null
  );
}

function savedEnrichment(profile: Profile, answerKey: string) {
  const response = readV2Answers(profile).responses[answerKey];
  if (!response) return null;
  return {
    summary: response.summary,
    canonicalName: answerKey === "name" ? profile.name : null,
    canonicalAge: answerKey === "age" ? profile.age : null,
    enrichmentStatus: response.enrichmentStatus,
  } satisfies LearnerProfileEnrichment;
}

function enrichmentFieldError(enrichment: LearnerProfileEnrichment) {
  if (containsPrivateLearnerProfileDetails(enrichment.summary)) {
    return {
      code: "private_profile_details",
      message: PRIVATE_PROFILE_FIELD_ERROR,
    };
  }
  if (
    containsLikelyFullLearnerName(
      enrichment.canonicalName,
      enrichment.summary,
    )
  ) {
    return {
      code: "preferred_name_required",
      message: PREFERRED_NAME_FIELD_ERROR,
    };
  }
  return null;
}

function storedRawAnswer(
  question: Question,
  enrichment: LearnerProfileEnrichment,
  rawAnswer: string,
) {
  if (
    question.canonicalField === "name" &&
    typeof enrichment.canonicalName === "string"
  ) {
    return enrichment.canonicalName;
  }
  if (
    question.canonicalField === "age" &&
    Number.isSafeInteger(enrichment.canonicalAge)
  ) {
    return String(enrichment.canonicalAge);
  }
  return rawAnswer;
}

async function getEnrichment(
  input: LearnerProfileRequestInput,
  dependencies: HandlerDependencies,
  profile: Profile,
  question: Question,
  rawAnswer: string
): Promise<LearnerProfileEnrichmentResult> {
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
  input: LearnerProfileRequestInput;
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
    ? ensureV2Profile(profile, LEARNER_PROFILE_QUESTIONNAIRE, {
        forProfileEdit: true,
      })
    : profile;
  const sameAnswer = isSameV2Answer(
    readable,
    question.answerKey,
    rawAnswer
  );
  if (sameAnswer) {
    return {
      profile,
      acknowledgment: serializeAcknowledgment(question),
    };
  }
  if (containsPrivateLearnerProfileDetails(rawAnswer)) {
    throw new ApiError(
      400,
      "private_profile_details",
      PRIVATE_PROFILE_FIELD_ERROR,
    );
  }
  const enrichment = await getEnrichment(
    input,
    dependencies,
    readable,
    question,
    rawAnswer
  );
  if ("fieldError" in enrichment) {
    throw new ApiError(
      400,
      enrichment.errorCode ?? "invalid_answer",
      enrichment.fieldError,
    );
  }
  const enrichmentError = enrichmentFieldError(enrichment);
  if (enrichmentError) {
    throw new ApiError(400, enrichmentError.code, enrichmentError.message);
  }

  let storedProfile = profile;
  const updated = writeV2Response(readable, question, {
    ...enrichment,
    rawAnswer: storedRawAnswer(question, enrichment, rawAnswer),
    answeredAt: dependencies.now().toISOString(),
  });

  if (profileEdit) {
    await repository.saveAnswer(input.identity, {
      age: updated.age,
      answersJson: updated.answersJson,
      name: updated.name,
      skippedQuestionKeysJson: updated.skippedQuestionKeysJson,
    });
  } else {
    const next = getV2CurrentQuestion(updated, LEARNER_PROFILE_QUESTIONNAIRE);
    const completed = next === null && isV2Complete(
      updated,
      LEARNER_PROFILE_QUESTIONNAIRE
    );
    await repository.saveTransition(input.identity, {
      age: updated.age,
      answersJson: updated.answersJson,
      completed,
      currentQuestionKey: next?.answerKey ?? null,
      name: updated.name,
      skippedQuestionKeysJson: updated.skippedQuestionKeysJson,
    });
  }
  storedProfile = await repository.loadProfile(input.identity);

  return {
    profile: storedProfile,
    acknowledgment: serializeAcknowledgment(question),
  };
}

async function saveProfileAnswers({
  input,
  dependencies,
  repository,
  profile,
  answers,
}: {
  input: LearnerProfileRequestInput;
  dependencies: HandlerDependencies;
  repository: Repository;
  profile: Profile;
  answers: Record<string, unknown>;
}) {
  let updated = ensureV2Profile(profile, LEARNER_PROFILE_QUESTIONNAIRE, {
    forProfileEdit: true,
  });
  const fieldErrors: Record<string, string> = Object.create(null);
  const errorCodes = new Set<string>();
  const knownKeys = new Set(
    [
      ...LEARNER_PROFILE_QUESTIONNAIRE.questions.map((question) => question.answerKey),
      "description",
    ]
  );
  for (const answerKey of Object.keys(answers)) {
    if (!knownKeys.has(answerKey)) {
      fieldErrors[answerKey] = "This question is no longer available.";
    }
  }

  let descriptionChanged = false;
  if ("description" in answers) {
    const submittedDescription = answers.description;
    if (typeof submittedDescription !== "string") {
      fieldErrors.description = "Please enter a description.";
    } else if (submittedDescription.length > 2_000) {
      fieldErrors.description = "Please use 2000 characters or fewer.";
    } else {
      const description = submittedDescription.trim();
      const envelope = readV2Answers(updated);
      const currentDescription =
        typeof envelope.description === "string" ? envelope.description : "";
      if (description !== currentDescription) {
        if (containsPrivateLearnerProfileDetails(description)) {
          fieldErrors.description = PRIVATE_PROFILE_FIELD_ERROR;
          errorCodes.add("private_profile_details");
        } else {
          updated = {
            ...updated,
            answersJson: JSON.stringify({
              ...envelope,
              description: description || null,
            }),
          };
          descriptionChanged = true;
        }
      }
    }
  }

  const changed: Question[] = [];
  for (const question of LEARNER_PROFILE_QUESTIONNAIRE.questions) {
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

    if (containsPrivateLearnerProfileDetails(rawAnswer)) {
      fieldErrors[question.answerKey] = PRIVATE_PROFILE_FIELD_ERROR;
      errorCodes.add("private_profile_details");
      continue;
    }

    const enrichment = await dependencies.enrichAnswer({
      env: input.env,
      question,
      rawAnswer,
    });
    if ("fieldError" in enrichment) {
      fieldErrors[question.answerKey] = enrichment.fieldError;
      errorCodes.add(enrichment.errorCode ?? "invalid_answer");
      continue;
    }
    const enrichmentError = enrichmentFieldError(enrichment);
    if (enrichmentError) {
      fieldErrors[question.answerKey] = enrichmentError.message;
      errorCodes.add(enrichmentError.code);
      continue;
    }

    try {
      updated = writeV2Response(updated, question, {
        ...enrichment,
        rawAnswer: storedRawAnswer(question, enrichment, rawAnswer),
        answeredAt: dependencies.now().toISOString(),
      });
      changed.push(question);
    } catch {
      fieldErrors[question.answerKey] = "Please check this answer and try again.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    const code = errorCodes.has("private_profile_details")
      ? "private_profile_details"
      : errorCodes.has("preferred_name_required")
        ? "preferred_name_required"
        : "invalid_profile";
    throw new ApiError(400, code, undefined, { fieldErrors });
  }

  let storedProfile = profile;
  if (changed.length > 0 || descriptionChanged) {
    await repository.saveAnswer(input.identity, {
      age: updated.age,
      answersJson: updated.answersJson,
      name: updated.name,
      skippedQuestionKeysJson: updated.skippedQuestionKeysJson,
    });
    storedProfile = await repository.loadProfile(input.identity);
  }

  const acknowledgments = changed.map(serializeAcknowledgment);
  return { profile: storedProfile, acknowledgments };
}

export async function handleLearnerProfileRequest(
  input: LearnerProfileRequestInput,
  dependencyOverrides: Partial<HandlerDependencies> = {}
): Promise<Response> {
  const dependencies: HandlerDependencies = {
    enrichAnswer: enrichLearnerProfileAnswer,
    now: () => new Date(),
    wait: (delay) => scheduler.wait(delay),
    ...dependencyOverrides,
  };
  const repository = createLearnerProfileRepository(input.database, {
    now: dependencies.now,
  });
  const url = new URL(input.request.url);

  async function reconcileLessonRecordingCleanup() {
    const state = await repository.readLessonRecordingConsentState(
      input.identity,
    );
    if (state.cleanupBeforeGeneration === null) return state;
    try {
      await deleteAllLessonRecordings(
        input.env.PRIVATE_MEDIA_BUCKET,
        input.identity,
        state.cleanupBeforeGeneration,
        dependencies.wait,
      );
      await repository.clearLessonRecordingCleanup(
        input.identity,
        state.cleanupBeforeGeneration,
      );
    } catch {
      // Durable D1 state keeps cleanup retryable while R2 is unavailable.
    }
    return repository.readLessonRecordingConsentState(input.identity);
  }

  try {
    if (url.pathname === "/api/learner-profile/transcribe") {
      return handleLearnerProfileTranscription(input.request, input.env);
    }

    if (url.pathname === "/api/learner-profile" && input.request.method === "GET") {
      const profile = await prepareLearnerProfile(repository, input.identity);
      return jsonResponse(
        learnerProfilePayload(
          profile,
          await repository.canBypass(input.identity),
          learnerProfileExperienceMode(input.env),
        )
      );
    }

    if (
      url.pathname === "/api/learner-profile/answer" &&
      input.request.method === "PUT"
    ) {
      const body = await readAnswerBody(input.request);
      const profile = await prepareLearnerProfile(repository, input.identity);
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
      const current = getV2CurrentQuestion(profile, LEARNER_PROFILE_QUESTIONNAIRE);
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
        ...learnerProfilePayload(
          saved.profile,
          await repository.canBypass(input.identity),
          learnerProfileExperienceMode(input.env),
        ),
        acknowledgment: saved.acknowledgment,
      });
    }

    if (
      url.pathname === "/api/learner-profile/question/skip" &&
      input.request.method === "POST"
    ) {
      const body = await readQuestionKeyBody(input.request);
      const profile = await prepareLearnerProfile(repository, input.identity);
      const question = findQuestion(body.questionKey);
      if (!question) {
        throw new ApiError(
          409,
          "invalid_answer",
          "This question is no longer available."
        );
      }
      if (
        getV2CurrentQuestion(profile, LEARNER_PROFILE_QUESTIONNAIRE)?.answerKey !==
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
      const next = getV2CurrentQuestion(updated, LEARNER_PROFILE_QUESTIONNAIRE);
      await repository.saveTransition(input.identity, {
        age: updated.age,
        answersJson: updated.answersJson,
        completed: next === null && isV2Complete(updated, LEARNER_PROFILE_QUESTIONNAIRE),
        currentQuestionKey: next?.answerKey ?? null,
        name: updated.name,
        skippedQuestionKeysJson: updated.skippedQuestionKeysJson,
      });
      const stored = await repository.loadProfile(input.identity);
      return jsonResponse(
        learnerProfilePayload(
          stored,
          await repository.canBypass(input.identity),
          learnerProfileExperienceMode(input.env),
        )
      );
    }

    if (
      url.pathname === "/api/learner-profile/skip" &&
      input.request.method === "POST"
    ) {
      await repository.skipSession(input.identity);
      try {
        const profile = await prepareLearnerProfile(repository, input.identity);
        await repository.skip(input.identity);
        return jsonResponse(
          learnerProfilePayload(profile, true, learnerProfileExperienceMode(input.env)),
        );
      } catch {
        return jsonResponse(bypassOnlyPayload());
      }
    }

    if (
      url.pathname === "/api/learner-profile/complete" &&
      input.request.method === "POST"
    ) {
      const profile = await prepareLearnerProfile(repository, input.identity);
      if (profile.profileStatus !== "completed") {
        const missing = getV2CurrentQuestion(profile, LEARNER_PROFILE_QUESTIONNAIRE);
        if (missing || !isV2Complete(profile, LEARNER_PROFILE_QUESTIONNAIRE)) {
          throw new ApiError(409, "learner_profile_incomplete", undefined, {
            missingQuestionKey: missing?.answerKey ?? null,
          });
        }
        await repository.complete(input.identity);
      }
      const completed = await repository.loadProfile(input.identity);
      return jsonResponse(
        learnerProfilePayload(completed, true, learnerProfileExperienceMode(input.env)),
      );
    }

    if (url.pathname === "/api/profile" && input.request.method === "GET") {
      await repository.loadProfile(input.identity);
      await reconcileLessonRecordingCleanup();
      const profile = await repository.loadProfile(input.identity);
      return jsonResponse(profilePayload(profile));
    }

    if (
      url.pathname === "/api/lesson-recordings/consent" &&
      input.request.method === "GET"
    ) {
      const consent = await repository.readLessonRecordingConsentState(
        input.identity,
      );
      return jsonResponse({
        cleanupPending: consent.cleanupBeforeGeneration !== null,
        enabled: consent.enabled,
      });
    }

    if (
      url.pathname === "/api/profile/lesson-recording-consent" &&
      input.request.method === "PUT"
    ) {
      const record = await readJsonRecord(input.request);
      if (
        Object.keys(record).length !== 1 ||
        typeof record.enabled !== "boolean"
      ) {
        throw new ApiError(400, "invalid_lesson_recording_consent");
      }
      const saved = await repository.saveLessonRecordingConsent(
        input.identity,
        record.enabled,
      );
      const reconciled = saved.cleanupBeforeGeneration === null
        ? saved
        : await reconcileLessonRecordingCleanup();
      return jsonResponse({
        cleanupPending: reconciled.cleanupBeforeGeneration !== null,
        enabled: reconciled.enabled,
      });
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
      url.pathname === "/api/learner-profile" ||
      url.pathname === "/api/learner-profile/answer" ||
      url.pathname === "/api/learner-profile/question/skip" ||
      url.pathname === "/api/learner-profile/skip" ||
      url.pathname === "/api/learner-profile/complete" ||
      url.pathname === "/api/profile" ||
      url.pathname === "/api/lesson-recordings/consent" ||
      url.pathname === "/api/profile/lesson-recording-consent";
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
    if (isLearnerNameConflict(error)) {
      return jsonResponse(
        {
          error: "learner_name_conflict",
          fieldError: LEARNER_NAME_CONFLICT_MESSAGE,
        },
        { status: 409 },
      );
    }
    return jsonResponse({ error: "questionnaire_unavailable" }, { status: 503 });
  }
}
