import {
  canCompleteQuestionnaire,
  getApplicableQuestions,
  getNextQuestion,
  getProgress,
  parseQuestionConfig,
  readProfileAnswers,
  readSkippedQuestionKeys,
  skipProfileQuestion,
  validateAnswer,
  writeProfileAnswer,
} from "../lib/onboarding.js";
import { STATIC_AUDIO_LINES } from "../lib/static-audio.js";
import type { Database } from "./database.ts";
import type { AuthEnv } from "./auth.ts";
import {
  handleOnboardingTranscription,
  type ApiEnv,
} from "./groq.ts";
import { createOnboardingRepository } from "./onboarding-repository.ts";

export interface OnboardingIdentity {
  sessionId: string;
  userId: string;
  userName: string | null;
}

export interface OnboardingRequestInput {
  database: Database;
  env: AuthEnv & ApiEnv;
  identity: OnboardingIdentity;
  request: Request;
}

const MAX_PROFILE_BODY_BYTES = 16 * 1024;
const INTRODUCTION_AUDIO_ID = "onboarding-introduction";

type QuestionRow = Awaited<
  ReturnType<ReturnType<typeof createOnboardingRepository>["loadState"]>
>["questions"][number];

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

function resolveAudio(audioId: string, expectedText?: string) {
  const line = STATIC_AUDIO_LINES[audioId];
  if (!line || line.speaker !== "peppa") {
    throw new Error("Question audio is unavailable.");
  }
  if (expectedText && line.text !== expectedText) {
    throw new Error("Question audio does not match its prompt.");
  }
  return { id: audioId, src: line.src, text: line.text };
}

function serializeQuestion(entry: QuestionRow) {
  const config = parseQuestionConfig(entry);
  return {
    answerKey: entry.answerKey,
    position: entry.position,
    promptEn: entry.promptEn,
    promptZh: entry.promptZh,
    answerType: entry.answerType,
    cardinality: entry.cardinality,
    required: entry.required,
    options: config.options,
    validation: config.validation,
    audio: resolveAudio(entry.audioId, entry.promptEn),
  };
}

function serializeProfile(profile: Awaited<ReturnType<ReturnType<typeof createOnboardingRepository>["loadState"]>>["profile"]) {
  return {
    name: profile.name,
    age: profile.age,
    answers: readProfileAnswers(profile),
    questionnaireVersion: profile.questionnaireVersion,
    currentQuestionKey: profile.currentQuestionKey,
    onboardingStatus: profile.onboardingStatus,
    completedAt: profile.completedAt,
  };
}

type LoadedState = Awaited<
  ReturnType<ReturnType<typeof createOnboardingRepository>["loadState"]>
>;

function onboardingPayload(state: LoadedState, canBypass: boolean) {
  const answers = readProfileAnswers(state.profile);
  const skippedQuestionKeys = readSkippedQuestionKeys(state.profile);
  const question =
    state.profile.onboardingStatus === "completed"
      ? null
      : getNextQuestion({
          answers,
          currentQuestionKey: state.profile.currentQuestionKey,
          questions: state.questions,
          skippedQuestionKeys,
        });

  return {
    mode: "full" as const,
    profile: serializeProfile(state.profile),
    questionnaire: {
      version: state.questionnaire.version,
      introductionAudio: resolveAudio(INTRODUCTION_AUDIO_ID),
    },
    question: question ? serializeQuestion(question) : null,
    progress: getProgress(
      state.questions,
      answers,
      question?.answerKey ?? null,
      skippedQuestionKeys
    ),
    canBypass,
  };
}

function bypassOnlyPayload() {
  return { mode: "bypass-only" as const, canBypass: true as const };
}

function getCurrentQuestion(state: LoadedState) {
  return getNextQuestion({
    answers: readProfileAnswers(state.profile),
    currentQuestionKey: state.profile.currentQuestionKey,
    questions: state.questions,
    skippedQuestionKeys: readSkippedQuestionKeys(state.profile),
  });
}

function getTransition(state: LoadedState, updatedProfile: LoadedState["profile"]) {
  const answers = readProfileAnswers(updatedProfile);
  const skippedQuestionKeys = readSkippedQuestionKeys(updatedProfile);
  const next = getNextQuestion({
    answers,
    currentQuestionKey: null,
    questions: state.questions,
    skippedQuestionKeys,
  });
  const completion = canCompleteQuestionnaire(state.questions, answers);
  return {
    completed: next === null && completion.complete,
    currentQuestionKey: next?.answerKey ?? null,
  };
}

async function readJsonBody(request: Request) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_PROFILE_BODY_BYTES) {
    throw new ApiError(413, "payload_too_large");
  }
  try {
    const parsed = JSON.parse(body);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid");
    }
    return parsed as {
      answers?: unknown;
      questionKey?: unknown;
      value?: unknown;
    };
  } catch {
    throw new ApiError(400, "invalid_json");
  }
}

const PROFILE_NAME_QUESTION = {
  answerKey: "name",
  answerType: "text",
  branchingJson: null,
  cardinality: "scalar",
  optionsJson: null,
  position: 0,
  promptEn: "What name would you like us to use?",
  promptZh: "你希望我们怎么称呼你？",
  required: true,
  validationJson: '{"maxLength":80}',
};

function serializeProfileNameQuestion() {
  return {
    answerKey: PROFILE_NAME_QUESTION.answerKey,
    position: PROFILE_NAME_QUESTION.position,
    promptEn: PROFILE_NAME_QUESTION.promptEn,
    promptZh: PROFILE_NAME_QUESTION.promptZh,
    answerType: PROFILE_NAME_QUESTION.answerType,
    cardinality: PROFILE_NAME_QUESTION.cardinality,
    required: PROFILE_NAME_QUESTION.required,
    options: null,
    validation: { maxLength: 80 },
    audio: null,
  };
}

export async function handleOnboardingRequest(
  input: OnboardingRequestInput
): Promise<Response> {
  const repository = createOnboardingRepository(input.database);
  const url = new URL(input.request.url);

  try {
    if (url.pathname === "/api/onboarding/transcribe") {
      return handleOnboardingTranscription(input.request, input.env);
    }

    if (url.pathname === "/api/onboarding" && input.request.method === "GET") {
      try {
        const state = await repository.loadState(input.identity);
        return jsonResponse(
          onboardingPayload(state, await repository.canBypass(input.identity))
        );
      } catch (error) {
        if (await repository.canBypass(input.identity)) {
          return jsonResponse(bypassOnlyPayload());
        }
        throw error;
      }
    }

    if (
      url.pathname === "/api/onboarding/answer" &&
      input.request.method === "PUT"
    ) {
      const body = await readJsonBody(input.request);
      if (typeof body.questionKey !== "string") {
        throw new ApiError(400, "invalid_answer", "A question key is required.");
      }
      const state = await repository.loadState(input.identity);
      const entry = await repository.findQuestion(
        state.questionnaire.id,
        body.questionKey
      );
      if (!entry) {
        throw new ApiError(
          400,
          "invalid_answer",
          "This question is no longer available."
        );
      }

      const current = getCurrentQuestion(state);
      if (current?.answerKey !== entry.answerKey) {
        throw new ApiError(
          400,
          "invalid_answer",
          "Please answer the current question first."
        );
      }

      const validation = validateAnswer(entry, body.value);
      if ("error" in validation) {
        throw new ApiError(400, "invalid_answer", validation.error);
      }

      const updated = writeProfileAnswer(
        state.profile,
        entry.answerKey,
        validation.value
      );
      const transition = getTransition(state, updated);
      await repository.saveTransition(state.profile.id, {
        age: updated.age,
        answersJson: updated.answersJson,
        completed: transition.completed,
        currentQuestionKey: transition.currentQuestionKey,
        name: updated.name,
        skippedQuestionKeysJson: updated.skippedQuestionKeysJson,
      });

      const nextState = await repository.loadState(input.identity);
      return jsonResponse(
        onboardingPayload(nextState, await repository.canBypass(input.identity))
      );
    }

    if (
      url.pathname === "/api/onboarding/question/skip" &&
      input.request.method === "POST"
    ) {
      const body = await readJsonBody(input.request);
      if (typeof body.questionKey !== "string") {
        throw new ApiError(400, "invalid_answer", "A question key is required.");
      }
      const state = await repository.loadState(input.identity);
      const entry = await repository.findQuestion(
        state.questionnaire.id,
        body.questionKey
      );
      if (!entry) {
        throw new ApiError(
          400,
          "invalid_answer",
          "This question is no longer available."
        );
      }
      if (getCurrentQuestion(state)?.answerKey !== entry.answerKey) {
        throw new ApiError(
          400,
          "invalid_answer",
          "Please answer the current question first."
        );
      }
      if (entry.required) {
        throw new ApiError(
          400,
          "invalid_answer",
          "This question is required."
        );
      }

      const updated = skipProfileQuestion(state.profile, entry.answerKey);
      const transition = getTransition(state, updated);
      await repository.saveTransition(state.profile.id, {
        age: updated.age,
        answersJson: updated.answersJson,
        completed: transition.completed,
        currentQuestionKey: transition.currentQuestionKey,
        name: updated.name,
        skippedQuestionKeysJson: updated.skippedQuestionKeysJson,
      });
      const nextState = await repository.loadState(input.identity);
      return jsonResponse(
        onboardingPayload(nextState, await repository.canBypass(input.identity))
      );
    }

    if (
      url.pathname === "/api/onboarding/skip" &&
      input.request.method === "POST"
    ) {
      await repository.skipSession(input.identity);
      try {
        const state = await repository.loadState(input.identity);
        return jsonResponse(onboardingPayload(state, true));
      } catch {
        return jsonResponse(bypassOnlyPayload());
      }
    }

    if (
      url.pathname === "/api/onboarding/complete" &&
      input.request.method === "POST"
    ) {
      const state = await repository.loadState(input.identity);
      const completion = canCompleteQuestionnaire(
        state.questions,
        readProfileAnswers(state.profile)
      );
      if (!completion.complete) {
        throw new ApiError(409, "onboarding_incomplete", undefined, {
          missingQuestionKey: completion.missingQuestionKey,
        });
      }
      await repository.complete(state.profile.id);
      const completedState = await repository.loadState(input.identity);
      return jsonResponse(
        onboardingPayload(completedState, true)
      );
    }

    if (url.pathname === "/api/profile" && input.request.method === "GET") {
      const state = await repository.loadState(input.identity);
      const answers = readProfileAnswers(state.profile);
      return jsonResponse({
        profile: serializeProfile(state.profile),
        questions: [
          serializeProfileNameQuestion(),
          ...getApplicableQuestions(state.questions, answers).map(serializeQuestion),
        ],
      });
    }

    if (url.pathname === "/api/profile" && input.request.method === "PUT") {
      const body = await readJsonBody(input.request);
      if (
        body.answers === null ||
        typeof body.answers !== "object" ||
        Array.isArray(body.answers)
      ) {
        throw new ApiError(
          400,
          "invalid_profile",
          "A profile answer map is required."
        );
      }
      const state = await repository.loadState(input.identity);
      const validatedAnswers: Array<{
        answerKey: string;
        value: unknown;
      }> = [];
      const fieldErrors = Object.create(null) as Record<string, string>;

      for (const [answerKey, value] of Object.entries(body.answers)) {
        const entry =
          answerKey === "name"
            ? PROFILE_NAME_QUESTION
            : state.questions.find(
                (question) => question.answerKey === answerKey
              );
        if (!entry) {
          fieldErrors[answerKey] = "This question is no longer available.";
          continue;
        }
        const validation = validateAnswer(entry, value);
        if ("error" in validation) {
          fieldErrors[answerKey] =
            validation.error ?? "This answer is invalid.";
          continue;
        }
        validatedAnswers.push({
          answerKey: entry.answerKey,
          value: validation.value,
        });
      }

      if (Object.keys(fieldErrors).length > 0) {
        throw new ApiError(400, "invalid_profile", undefined, {
          fieldErrors,
        });
      }

      const updated = validatedAnswers.reduce(
        (profile, answer) =>
          writeProfileAnswer(profile, answer.answerKey, answer.value),
        state.profile
      );
      await repository.saveAnswer(state.profile.id, {
        age: updated.age,
        answersJson: updated.answersJson,
        name: updated.name,
        skippedQuestionKeysJson: updated.skippedQuestionKeysJson,
      });
      const nextState = await repository.loadState(input.identity);
      return jsonResponse({
        profile: serializeProfile(nextState.profile),
        questions: [
          serializeProfileNameQuestion(),
          ...getApplicableQuestions(
            nextState.questions,
            readProfileAnswers(nextState.profile)
          ).map(serializeQuestion),
        ],
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
    return jsonResponse(
      { error: "questionnaire_unavailable" },
      { status: 503 }
    );
  }
}
