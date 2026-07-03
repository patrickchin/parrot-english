// @ts-check

import {
  DEFAULT_LESSON_ID,
  LESSONS,
  isLessonPlayable,
} from "./lesson-data.js";

/**
 * @typedef {import("./lesson-data.js").Lesson} Lesson
 * @typedef {import("./lesson-data.js").LessonStep} LessonStep
 */

/**
 * @param {unknown} value
 * @returns {number | undefined}
 */
function parsePositiveInteger(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return undefined;
  }

  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

/**
 * @param {number} lessonNumber
 * @param {number} pageNumber
 * @returns {string}
 */
export function getLessonPagePath(lessonNumber, pageNumber) {
  return `/lessons/${lessonNumber}/pages/${pageNumber}`;
}

/**
 * @param {string | undefined} lessonNumberValue
 * @returns {{ lesson: Lesson, lessonNumber: number } | undefined}
 */
export function resolveLessonNumber(lessonNumberValue) {
  const lessonNumber = parsePositiveInteger(lessonNumberValue);

  if (lessonNumber === undefined) {
    return undefined;
  }

  const lesson = LESSONS[lessonNumber - 1];

  if (!isLessonPlayable(lesson)) {
    return undefined;
  }

  return { lesson: /** @type {Lesson} */ (lesson), lessonNumber };
}

/**
 * @param {string | undefined} lessonNumberValue
 * @param {string | undefined} pageNumberValue
 * @returns {{
 *   lesson: Lesson,
 *   lessonNumber: number,
 *   pageIndex: number,
 *   pageNumber: number,
 *   step: LessonStep,
 * } | undefined}
 */
export function resolveLessonPageRoute(lessonNumberValue, pageNumberValue) {
  const resolvedLesson = resolveLessonNumber(lessonNumberValue);
  const pageNumber = parsePositiveInteger(pageNumberValue);

  if (!resolvedLesson || pageNumber === undefined) {
    return undefined;
  }

  const pageIndex = pageNumber - 1;
  const step = resolvedLesson.lesson.steps[pageIndex];

  if (!step) {
    return undefined;
  }

  return {
    lesson: resolvedLesson.lesson,
    lessonNumber: resolvedLesson.lessonNumber,
    pageIndex,
    pageNumber,
    step,
  };
}

/** @returns {number} */
export function getDefaultLessonNumber() {
  const defaultLessonIndex = LESSONS.findIndex(
    (lesson) => lesson.id === DEFAULT_LESSON_ID
  );

  if (defaultLessonIndex === -1) {
    throw new Error(`Default lesson is missing: ${DEFAULT_LESSON_ID}`);
  }

  return defaultLessonIndex + 1;
}
