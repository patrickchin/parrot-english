// @ts-check

const ROOT_KEYS = new Set(["id", "version", "questions"]);
const QUESTION_KEYS = new Set([
  "answerKey",
  "position",
  "promptEn",
  "promptZh",
  "audioId",
  "canonicalField",
  "required",
  "maxLength",
  "fallbackAcknowledgment",
]);
const CANONICAL_FIELDS = new Set(["name", "age", null]);
const ANSWER_KEY_PATTERN = /^[a-z][A-Za-z0-9]*$/;
const AUDIO_ID_PATTERN = /^learner-profile-v2-[a-z0-9-]+$/;

/** @returns {never} */
function invalid() {
  throw new Error("Invalid learner-profile questionnaire.");
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {Record<string, unknown>} value @param {Set<string>} allowed */
function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

/** @param {unknown} value @param {number} maxLength */
function isBoundedText(value, maxLength) {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= maxLength
  );
}

/** @param {unknown} value */
function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * @param {unknown} source
 * @returns {Readonly<{
 *   id: string,
 *   version: number,
 *   questions: ReadonlyArray<Readonly<{
 *     answerKey: string,
 *     position: number,
 *     promptEn: string,
 *     promptZh: string,
 *     audioId: string,
 *     canonicalField: "name" | "age" | null,
 *     required: boolean,
 *     maxLength: number,
 *     fallbackAcknowledgment: string,
 *   }>>,
 * }>}
 */
export function validateLearnerProfileQuestionnaire(source) {
  if (!isRecord(source)) invalid();
  const definition = /** @type {Record<string, unknown>} */ (source);
  if (!hasOnlyKeys(definition, ROOT_KEYS)) invalid();
  if (definition.id !== "learner-profile-v2" || definition.version !== 2) invalid();
  const questions = definition.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    invalid();
  }

  const answerKeys = new Set();
  const positions = new Set();
  const canonicalCounts = { name: 0, age: 0 };

  for (const questionValue of questions) {
    if (!isRecord(questionValue)) invalid();
    const question = /** @type {Record<string, unknown>} */ (questionValue);
    if (!hasOnlyKeys(question, QUESTION_KEYS)) invalid();
    if (
      typeof question.answerKey !== "string" ||
      !ANSWER_KEY_PATTERN.test(question.answerKey) ||
      answerKeys.has(question.answerKey)
    ) {
      invalid();
    }
    if (
      !Number.isInteger(question.position) ||
      /** @type {number} */ (question.position) < 1 ||
      positions.has(question.position)
    ) {
      invalid();
    }
    if (
      !isBoundedText(question.promptEn, 200) ||
      !isBoundedText(question.promptZh, 200) ||
      !isBoundedText(question.fallbackAcknowledgment, 160) ||
      typeof question.audioId !== "string" ||
      !AUDIO_ID_PATTERN.test(question.audioId) ||
      !CANONICAL_FIELDS.has(
        /** @type {"name" | "age" | null} */ (
          question.canonicalField ?? null
        ),
      ) ||
      typeof question.required !== "boolean" ||
      !Number.isInteger(question.maxLength) ||
      /** @type {number} */ (question.maxLength) < 1 ||
      /** @type {number} */ (question.maxLength) > 500
    ) {
      invalid();
    }

    answerKeys.add(question.answerKey);
    positions.add(question.position);
    if (question.canonicalField === "name") canonicalCounts.name += 1;
    if (question.canonicalField === "age") canonicalCounts.age += 1;
  }

  const expectedPositions = questions.map((_, index) => index + 1);
  if (
    expectedPositions.some((position) => !positions.has(position)) ||
    canonicalCounts.name !== 1 ||
    canonicalCounts.age !== 1
  ) {
    invalid();
  }

  const clone = JSON.parse(JSON.stringify(source));
  return /** @type {ReturnType<typeof validateLearnerProfileQuestionnaire>} */ (
    deepFreeze(clone)
  );
}
