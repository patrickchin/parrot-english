// @ts-check

import lessonCatalog from "./lessons.json" with { type: "json" };

/**
 * @typedef {"available" | "disabled"} LessonStatus
 * @typedef {object} LessonStepAudio
 * @property {string} example
 * @property {string} prompt
 * @property {string} model
 * @typedef {object} LessonStep
 * @property {string} id
 * @property {string} sceneTitleZh
 * @property {string} exampleLine
 * @property {string} parrotPromptZh
 * @property {string} parrotModelLine
 * @property {string} childTarget
 * @property {string} tipZh
 * @property {number} durationHintSeconds
 * @property {LessonStepAudio} audio
 * @typedef {object} Lesson
 * @property {string} id
 * @property {string} title
 * @property {string} subtitle
 * @property {string} description
 * @property {LessonStatus} status
 * @property {string} statusLabel
 * @property {LessonStep[]} steps
 * @typedef {object} LessonCatalog
 * @property {string} defaultLessonId
 * @property {Lesson[]} lessons
 */

const catalog = /** @type {LessonCatalog} */ (
  /** @type {unknown} */ (lessonCatalog)
);

export const DEFAULT_LESSON_ID = catalog.defaultLessonId;

/** @type {Lesson[]} */
export const LESSONS = catalog.lessons;

/**
 * Compatibility export for modules and tests that still refer to the current
 * script directly.
 */
export const LESSON_STEPS = getDefaultLesson().steps;

/**
 * @param {string} id
 * @returns {Lesson | undefined}
 */
export function getLessonById(id) {
  return LESSONS.find((lesson) => lesson.id === id);
}

/**
 * @param {Lesson | undefined} lesson
 * @returns {boolean}
 */
export function isLessonPlayable(lesson) {
  return Boolean(lesson && lesson.status === "available" && lesson.steps.length > 0);
}

/** @returns {Lesson} */
export function getDefaultLesson() {
  const lesson = getLessonById(DEFAULT_LESSON_ID);

  if (!isLessonPlayable(lesson)) {
    throw new Error(`Default lesson is not playable: ${DEFAULT_LESSON_ID}`);
  }

  return /** @type {Lesson} */ (lesson);
}

/**
 * @param {number} index
 * @param {Lesson} [lesson]
 * @returns {LessonStep}
 */
export function getLessonStep(index, lesson = getDefaultLesson()) {
  return lesson.steps[Math.max(0, Math.min(index, lesson.steps.length - 1))];
}
