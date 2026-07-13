import { validateLesson } from "../lib/lesson-data";
import { VISUAL_CATALOG, type Lesson } from "./lesson-catalog";

export const MAX_LESSON_SCRIPT_BYTES = 256 * 1024;

export function getLessonScriptByteLength(source: string) {
  return new TextEncoder().encode(source).byteLength;
}

export function formatLessonScript(lesson: Lesson) {
  return JSON.stringify(lesson, null, 2);
}

export function parseLessonScript(
  source: string,
  sourceName = "lesson.json",
): Lesson {
  if (getLessonScriptByteLength(source) > MAX_LESSON_SCRIPT_BYTES) {
    throw new Error(`${sourceName} must be smaller than 256 KB.`);
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(`${sourceName} must contain valid JSON.`);
  }

  return validateLesson(value, VISUAL_CATALOG, sourceName);
}
