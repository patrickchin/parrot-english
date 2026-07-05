import { LESSONS, type LessonCatalogEntry } from "./lesson-catalog";

export type LessonSource = "parrot" | "my";

const SAFE_RETURN_PATH =
  /^(?:\/$|\/profile(?:[/?]|$)|\/lessons(?:[/?]|$)|\/progress(?:[/?]|$)|\/stories(?:[/?]|$))/;
const PARROT_LESSONS = new Map(LESSONS.map((entry) => [entry.id, entry]));

function parseSceneNumber(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function getLessonPath(source: LessonSource, lessonId: string) {
  return `/lessons/${source}/${encodeURIComponent(lessonId)}`;
}

export function getLessonScenePath(
  source: LessonSource,
  lessonId: string,
  sceneIndex: number,
) {
  return `${getLessonPath(source, lessonId)}/scenes/${sceneIndex + 1}`;
}

export function getLoginPath(returnTo: string) {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getOnboardingPath(returnTo: string) {
  return `/onboarding?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getSafeReturnTo(search: string) {
  const value = new URLSearchParams(search).get("returnTo");
  return value && !value.startsWith("//") && SAFE_RETURN_PATH.test(value)
    ? value
    : null;
}

export function resolveParrotLesson(lessonId: string | undefined) {
  return lessonId ? (PARROT_LESSONS.get(lessonId) ?? null) : null;
}

export function resolveParrotLessonScene(
  lessonId: string | undefined,
  sceneNumberValue: string | undefined,
): { entry: LessonCatalogEntry; sceneIndex: number } | null {
  const entry = resolveParrotLesson(lessonId);
  const sceneNumber = parseSceneNumber(sceneNumberValue);
  if (!entry || sceneNumber === null || sceneNumber > entry.lesson.scenes.length) {
    return null;
  }

  return { entry, sceneIndex: sceneNumber - 1 };
}
