import { validateLesson } from "../lib/lesson-data";
import { VISUAL_CATALOG, type Lesson } from "./lesson-catalog";

export function parseLessonScript(
  source: string,
  sourceName = "lesson.json",
): Lesson {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(`${sourceName} must contain valid JSON.`);
  }

  return validateLesson(value, VISUAL_CATALOG, sourceName);
}
