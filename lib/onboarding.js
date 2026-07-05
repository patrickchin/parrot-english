// @ts-check

const CONFIGURATION_ERROR = "Invalid questionnaire configuration.";

/**
 * @param {string | null | undefined} source
 * @param {"array" | "object"} shape
 */
function parseJsonConfig(source, shape) {
  if (source == null) return shape === "array" ? null : {};

  try {
    const value = JSON.parse(source);
    const valid =
      shape === "array"
        ? Array.isArray(value) && value.every((entry) => typeof entry === "string")
        : value !== null && typeof value === "object" && !Array.isArray(value);
    if (!valid) throw new Error(CONFIGURATION_ERROR);
    return value;
  } catch {
    throw new Error(CONFIGURATION_ERROR);
  }
}

/**
 * @param {{
 *   branchingJson?: string | null,
 *   optionsJson?: string | null,
 *   validationJson?: string | null,
 * }} question
 */
export function parseQuestionConfig(question) {
  const branching = question.branchingJson
    ? parseJsonConfig(question.branchingJson, "object")
    : null;

  return {
    branching,
    options: parseJsonConfig(question.optionsJson, "array"),
    validation: parseJsonConfig(question.validationJson, "object"),
  };
}

/** @param {unknown} value */
function normalizedKey(value) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en") : value;
}

/**
 * @param {{ answerType: string }} question
 * @param {unknown} value
 * @param {string[] | null} options
 */
function normalizeScalar(question, value, options) {
  if (question.answerType === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
      return { error: "Please enter a whole number." };
    }
    return { value };
  }

  if (typeof value !== "string") {
    return { error: "Please enter an answer." };
  }

  const trimmed = value.trim();
  if (question.answerType !== "choice") return { value: trimmed };
  if (!options) throw new Error(CONFIGURATION_ERROR);

  const selected = options.find(
    (option) => normalizedKey(option) === normalizedKey(trimmed),
  );
  return selected
    ? { value: selected }
    : { error: "Please choose one of the available options." };
}

/**
 * @param {{
 *   answerType: string,
 *   cardinality: string,
 *   optionsJson?: string | null,
 *   validationJson?: string | null,
 * }} question
 * @param {unknown} value
 */
export function normalizeAnswer(question, value) {
  const { options } = parseQuestionConfig(question);

  if (question.cardinality === "scalar") {
    if (Array.isArray(value)) return { error: "Please provide one answer." };
    return normalizeScalar(question, value, options);
  }

  if (question.cardinality !== "array") throw new Error(CONFIGURATION_ERROR);
  if (!Array.isArray(value)) return { error: "Please provide a list of answers." };

  /** @type {unknown[]} */
  const normalized = [];
  const seen = new Set();
  for (const entry of value) {
    const result = normalizeScalar(question, entry, options);
    if ("error" in result) return result;
    const key = normalizedKey(result.value);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(result.value);
  }

  return { value: normalized };
}

/** @param {unknown} value */
function isEmptyAnswer(value) {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

/**
 * @param {{
 *   answerType: string,
 *   cardinality: string,
 *   optionsJson?: string | null,
 *   required: boolean | number,
 *   validationJson?: string | null,
 * }} question
 * @param {unknown} value
 */
export function validateAnswer(question, value) {
  const { validation } = parseQuestionConfig(question);
  const normalized = normalizeAnswer(question, value);
  if ("error" in normalized) return normalized;

  if (question.required && isEmptyAnswer(normalized.value)) {
    return { error: "Please answer this question." };
  }

  if (
    typeof normalized.value === "string" &&
    typeof validation.maxLength === "number" &&
    normalized.value.length > validation.maxLength
  ) {
    return { error: `Please use ${validation.maxLength} characters or fewer.` };
  }

  if (Array.isArray(normalized.value)) {
    if (
      typeof validation.maxItems === "number" &&
      normalized.value.length > validation.maxItems
    ) {
      return {
        error: `Please choose no more than ${validation.maxItems} answers.`,
      };
    }

    if (typeof validation.maxLength === "number") {
      const tooLong = normalized.value.some(
        (entry) =>
          typeof entry === "string" && entry.length > validation.maxLength,
      );
      if (tooLong) {
        return {
          error: `Please use ${validation.maxLength} characters or fewer per answer.`,
        };
      }
    }
  }

  if (typeof normalized.value === "number") {
    const min = typeof validation.min === "number" ? validation.min : null;
    const max = typeof validation.max === "number" ? validation.max : null;
    if ((min !== null && normalized.value < min) || (max !== null && normalized.value > max)) {
      if (min !== null && max !== null) {
        return { error: `Please enter a number from ${min} to ${max}.` };
      }
      if (min !== null) return { error: `Please enter ${min} or more.` };
      return { error: `Please enter ${max} or less.` };
    }
  }

  return normalized;
}

/** @param {{ answersJson?: string | null, name?: string | null, age?: number | null }} profile */
export function readProfileAnswers(profile) {
  let jsonAnswers;
  try {
    jsonAnswers = JSON.parse(profile.answersJson ?? "{}");
  } catch {
    throw new Error("Invalid learner profile data.");
  }
  if (jsonAnswers === null || typeof jsonAnswers !== "object" || Array.isArray(jsonAnswers)) {
    throw new Error("Invalid learner profile data.");
  }

  delete jsonAnswers.name;
  delete jsonAnswers.age;
  if (profile.name != null) jsonAnswers.name = profile.name;
  if (profile.age != null) jsonAnswers.age = profile.age;
  return jsonAnswers;
}

/**
 * @template {{ answersJson?: string | null, name?: string | null, age?: number | null }} Profile
 * @param {Profile} profile
 * @param {string} answerKey
 * @param {unknown} value
 * @returns {Profile}
 */
export function writeProfileAnswer(profile, answerKey, value) {
  const answers = readProfileAnswers(profile);
  delete answers.name;
  delete answers.age;

  if (answerKey === "name") {
    return /** @type {Profile} */ ({
      ...profile,
      name: value,
      answersJson: JSON.stringify(answers),
    });
  }
  if (answerKey === "age") {
    return /** @type {Profile} */ ({
      ...profile,
      age: value,
      answersJson: JSON.stringify(answers),
    });
  }

  answers[answerKey] = value;
  return /** @type {Profile} */ ({
    ...profile,
    answersJson: JSON.stringify(answers),
  });
}

/** @param {unknown} left @param {unknown} right */
function answersEqual(left, right) {
  return normalizedKey(left) === normalizedKey(right);
}

/**
 * @param {{ branchingJson?: string | null }} question
 * @param {Record<string, unknown>} answers
 */
export function isQuestionApplicable(question, answers) {
  const { branching } = parseQuestionConfig(question);
  if (!branching) return true;

  const key = typeof branching.key === "string" ? branching.key : null;
  const operator = typeof branching.operator === "string" ? branching.operator : null;
  if (!key || !operator || !("value" in branching)) {
    throw new Error(CONFIGURATION_ERROR);
  }

  const actual = answers[key];
  if (operator === "equals") return answersEqual(actual, branching.value);
  if (operator === "notEquals") return !answersEqual(actual, branching.value);
  if (operator === "includes") {
    return Array.isArray(actual) && actual.some((entry) => answersEqual(entry, branching.value));
  }
  if (operator === "notIncludes") {
    return !Array.isArray(actual) || !actual.some((entry) => answersEqual(entry, branching.value));
  }
  throw new Error(CONFIGURATION_ERROR);
}

/**
 * @template {{ position?: number, branchingJson?: string | null }} Question
 * @param {Question[]} questions
 * @param {Record<string, unknown>} answers
 */
export function getApplicableQuestions(questions, answers) {
  return [...questions]
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
    .filter((entry) => isQuestionApplicable(entry, answers));
}

/** @param {unknown} value */
function hasAnswer(value) {
  return !isEmptyAnswer(value);
}

/**
 * @template {{ answerKey: string, position?: number, branchingJson?: string | null, required?: boolean | number }} Question
 * @param {{ answers: Record<string, unknown>, currentQuestionKey?: string | null, questions: Question[] }} input
 */
export function getNextQuestion({ answers, currentQuestionKey, questions }) {
  const applicable = getApplicableQuestions(questions, answers);
  const saved = applicable.find(
    (entry) =>
      entry.answerKey === currentQuestionKey && !hasAnswer(answers[entry.answerKey]),
  );
  if (saved) return saved;

  return (
    applicable.find(
      (entry) => entry.required && !hasAnswer(answers[entry.answerKey]),
    ) ??
    applicable.find((entry) => !hasAnswer(answers[entry.answerKey])) ??
    null
  );
}

/**
 * @param {{ answerKey: string, position?: number, branchingJson?: string | null }[]} questions
 * @param {Record<string, unknown>} answers
 * @param {string | null | undefined} currentQuestionKey
 */
export function getProgress(questions, answers, currentQuestionKey) {
  const applicable = getApplicableQuestions(questions, answers);
  const answered = applicable.filter((entry) => hasAnswer(answers[entry.answerKey])).length;
  const currentIndex = applicable.findIndex(
    (entry) => entry.answerKey === currentQuestionKey,
  );
  return {
    answered,
    current: currentIndex >= 0 ? currentIndex + 1 : Math.min(answered + 1, applicable.length),
    total: applicable.length,
  };
}

/**
 * @param {Array<{
 *   answerKey: string,
 *   answerType: string,
 *   branchingJson?: string | null,
 *   cardinality: string,
 *   optionsJson?: string | null,
 *   position?: number,
 *   required: boolean | number,
 *   validationJson?: string | null,
 * }>} questions
 * @param {Record<string, unknown>} answers
 */
export function canCompleteQuestionnaire(questions, answers) {
  for (const entry of getApplicableQuestions(questions, answers)) {
    if (!entry.required) continue;
    const result = validateAnswer(entry, answers[entry.answerKey]);
    if ("error" in result) {
      return { complete: false, missingQuestionKey: entry.answerKey };
    }
  }
  return { complete: true };
}

/**
 * @param {{ onboardingStatus: string, questionnaireVersion?: number | null }} profile
 * @param {number} activeVersion
 */
export function assignQuestionnaireVersion(profile, activeVersion) {
  if (profile.questionnaireVersion != null) return profile.questionnaireVersion;
  if (profile.onboardingStatus === "completed") return profile.questionnaireVersion ?? null;
  return activeVersion;
}

/**
 * @param {{ onboardingStatus: string, lastSkippedSessionId?: string | null }} profile
 * @param {string} sessionId
 */
export function canSkipForSession(profile, sessionId) {
  return (
    profile.onboardingStatus !== "completed" &&
    Boolean(sessionId) &&
    profile.lastSkippedSessionId === sessionId
  );
}
