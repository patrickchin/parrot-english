// @ts-check

const PROFILE_ERROR = "Invalid learner profile data.";
const RESPONSE_ERROR = "Invalid learner-profile response.";
const ENVELOPE_KEYS = new Set([
  "schemaVersion",
  "questionnaireVersion",
  "responses",
  "legacyAnswers",
  "description",
]);
const RESPONSE_KEYS = new Set([
  "question",
  "rawAnswer",
  "summary",
  "acknowledgment",
  "enrichmentStatus",
  "answeredAt",
]);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {Record<string, unknown>} value @param {Set<string>} allowed */
function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

/** @param {unknown} value */
function isIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

/** @param {unknown} value @param {number} maxLength */
function isTrimmedText(value, maxLength) {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= maxLength
  );
}

/** @param {unknown} value */
function isResponse(value) {
  if (!isRecord(value)) return false;
  const response = /** @type {Record<string, unknown>} */ (value);
  return (
    hasOnlyKeys(response, RESPONSE_KEYS) &&
    isTrimmedText(response.question, 200) &&
    isTrimmedText(response.rawAnswer, 500) &&
    isTrimmedText(response.summary, 240) &&
    isTrimmedText(response.acknowledgment, 160) &&
    (response.enrichmentStatus === "generated" ||
      response.enrichmentStatus === "fallback") &&
    isIsoTimestamp(response.answeredAt)
  );
}

/** @param {{ answersJson?: string | null }} profile */
export function readV2Answers(profile) {
  let value;
  try {
    value = JSON.parse(profile.answersJson ?? "{}");
  } catch {
    throw new Error(PROFILE_ERROR);
  }
  if (!isRecord(value)) throw new Error(PROFILE_ERROR);
  const envelope = /** @type {Record<string, unknown>} */ (value);
  const responses = envelope.responses;
  if (
    !hasOnlyKeys(envelope, ENVELOPE_KEYS) ||
    envelope.schemaVersion !== 2 ||
    !Number.isInteger(envelope.questionnaireVersion) ||
    /** @type {number} */ (envelope.questionnaireVersion) < 1 ||
    !isRecord(responses) ||
    !Object.values(responses).every(isResponse) ||
    !(
      envelope.description === undefined ||
      envelope.description === null ||
      isTrimmedText(envelope.description, 2_000)
    ) ||
    !(
      envelope.legacyAnswers === null ||
      (isRecord(envelope.legacyAnswers) &&
        !Object.prototype.hasOwnProperty.call(envelope.legacyAnswers, "schemaVersion"))
    )
  ) {
    throw new Error(PROFILE_ERROR);
  }
  return /** @type {any} */ (envelope);
}

/** @param {{ answersJson?: string | null }} profile */
function readLegacyAnswers(profile) {
  let value;
  try {
    value = JSON.parse(profile.answersJson ?? "{}");
  } catch {
    throw new Error(PROFILE_ERROR);
  }
  if (!isRecord(value)) throw new Error(PROFILE_ERROR);
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {{ skippedQuestionKeysJson?: string | null }} profile */
function readSkipped(profile) {
  let value;
  try {
    value = JSON.parse(profile.skippedQuestionKeysJson ?? "[]");
  } catch {
    throw new Error(PROFILE_ERROR);
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(PROFILE_ERROR);
  }
  return [...new Set(value)];
}

/**
 * @template {{
 *   answersJson?: string | null,
 *   skippedQuestionKeysJson?: string | null,
 *   profileStatus?: string,
 *   currentQuestionKey?: string | null,
 *   name?: string | null,
 *   age?: number | null,
 * }} Profile
 * @param {Profile} profile
 * @param {{ version: number, questions: ReadonlyArray<{ answerKey: string }> }} definition
 * @param {{ forProfileEdit?: boolean }} [options]
 * @returns {Profile}
 */
export function ensureV2Profile(
  profile,
  definition,
  { forProfileEdit = false } = {},
) {
  let existingEnvelope = null;
  try {
    existingEnvelope = readV2Answers(profile);
  } catch {
    existingEnvelope = null;
  }

  if (existingEnvelope) {
    return /** @type {Profile} */ ({ ...profile });
  }
  if (profile.profileStatus === "completed" && !forProfileEdit) {
    return profile;
  }

  const legacy = readLegacyAnswers(profile);
  const envelope = {
    schemaVersion: 2,
    questionnaireVersion: definition.version,
    responses: {},
    legacyAnswers: Object.keys(legacy).length === 0 ? null : legacy,
    description: null,
  };
  const restarting = profile.profileStatus !== "completed";
  return /** @type {Profile} */ ({
    ...profile,
    answersJson: JSON.stringify(envelope),
    currentQuestionKey: restarting
      ? (definition.questions[0]?.answerKey ?? null)
      : profile.currentQuestionKey,
    profileStatus: restarting ? "not_started" : profile.profileStatus,
    skippedQuestionKeysJson: restarting ? "[]" : profile.skippedQuestionKeysJson,
  });
}

/**
 * @template {{
 *   answersJson?: string | null,
 *   skippedQuestionKeysJson?: string | null,
 *   profileStatus?: string,
 *   currentQuestionKey?: string | null,
 *   name?: string | null,
 *   age?: number | null,
 * }} Profile
 * @param {Profile} profile
 * @param {{
 *   answerKey: string,
 *   promptEn: string,
 *   canonicalField: "name" | "age" | null,
 *   maxLength: number,
 * }} question
 * @param {{
 *   rawAnswer: string,
 *   summary: string,
 *   acknowledgment: string,
 *   canonicalName: string | null,
 *   canonicalAge: number | null,
 *   enrichmentStatus: "generated" | "fallback",
 *   answeredAt: string,
 * }} enrichment
 * @returns {Profile}
 */
export function writeV2Response(profile, question, enrichment) {
  const rawAnswer =
    typeof enrichment.rawAnswer === "string" ? enrichment.rawAnswer.trim() : "";
  const response = {
    question: question.promptEn,
    rawAnswer,
    summary: enrichment.summary,
    acknowledgment: enrichment.acknowledgment,
    enrichmentStatus: enrichment.enrichmentStatus,
    answeredAt: enrichment.answeredAt,
  };
  if (
    !isTrimmedText(rawAnswer, Math.min(question.maxLength, 500)) ||
    !isResponse(response)
  ) {
    throw new Error(RESPONSE_ERROR);
  }

  const envelope = readV2Answers(profile);
  const updated = /** @type {Profile} */ ({ ...profile });
  if (question.canonicalField === "name") {
    const name = enrichment.canonicalName?.trim() ?? "";
    if (!isTrimmedText(name, 80)) throw new Error(RESPONSE_ERROR);
    updated.name = name;
  }
  if (question.canonicalField === "age") {
    const age = enrichment.canonicalAge;
    if (age === null || !Number.isSafeInteger(age) || age < 0) {
      throw new Error(RESPONSE_ERROR);
    }
    updated.age = age;
  }

  updated.answersJson = JSON.stringify({
    ...envelope,
    responses: {
      ...envelope.responses,
      [question.answerKey]: response,
    },
  });
  if ("skippedQuestionKeysJson" in profile) {
    updated.skippedQuestionKeysJson = JSON.stringify(
      readSkipped(profile).filter((key) => key !== question.answerKey),
    );
  }
  return updated;
}

/**
 * @template {{ answerKey: string, position: number, required: boolean }} Question
 * @param {{ answersJson?: string | null, skippedQuestionKeysJson?: string | null }} profile
 * @param {{ questions: ReadonlyArray<Question> }} definition
 * @returns {Question | null}
 */
export function getV2CurrentQuestion(profile, definition) {
  const { responses } = readV2Answers(profile);
  const skipped = new Set(readSkipped(profile));
  return /** @type {Question | null} */ (
    [...definition.questions]
      .sort((left, right) => left.position - right.position)
      .find(
        (question) =>
          !responses[question.answerKey] &&
          (question.required || !skipped.has(question.answerKey)),
      ) ?? null
  );
}

/**
 * @param {{ answersJson?: string | null, skippedQuestionKeysJson?: string | null }} profile
 * @param {{ questions: ReadonlyArray<{ answerKey: string, position: number, required: boolean }> }} definition
 */
export function getV2Progress(profile, definition) {
  const { responses } = readV2Answers(profile);
  const skipped = new Set(readSkipped(profile));
  const questions = [...definition.questions].sort(
    (left, right) => left.position - right.position,
  );
  const answered = questions.filter(
    (question) =>
      responses[question.answerKey] ||
      (!question.required && skipped.has(question.answerKey)),
  ).length;
  const current = getV2CurrentQuestion(profile, definition);
  return {
    answered,
    current: current?.position ?? Math.min(answered + 1, questions.length),
    total: questions.length,
  };
}

/**
 * @param {{ answersJson?: string | null }} profile
 * @param {{ questions: ReadonlyArray<{ answerKey: string, required: boolean }> }} definition
 */
export function isV2Complete(profile, definition) {
  const { responses } = readV2Answers(profile);
  return definition.questions.every(
    (question) => !question.required || Boolean(responses[question.answerKey]),
  );
}

/**
 * @param {{ answersJson?: string | null }} profile
 * @param {string} answerKey
 * @param {unknown} rawAnswer
 */
export function isSameV2Answer(profile, answerKey, rawAnswer) {
  if (typeof rawAnswer !== "string") return false;
  const response = readV2Answers(profile).responses[answerKey];
  return response?.rawAnswer === rawAnswer.trim();
}
