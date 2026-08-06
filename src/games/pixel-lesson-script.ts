import {
  preparePixelLesson,
  type PixelLesson,
} from "../../lib/pixel-lesson-data";

export const MAX_PIXEL_LESSON_SCRIPT_BYTES = 64 * 1024;

export function getPixelLessonScriptByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export function formatPixelLessonScript(lesson: PixelLesson) {
  return JSON.stringify(lesson, null, 2);
}

export function parsePixelLessonScript(
  value: string,
  sourceName = "pixel lesson script",
) {
  if (getPixelLessonScriptByteLength(value) > MAX_PIXEL_LESSON_SCRIPT_BYTES) {
    throw new Error(`${sourceName} must be smaller than 64 KB.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${sourceName} must contain valid JSON.`);
  }

  return preparePixelLesson(parsed, sourceName);
}
