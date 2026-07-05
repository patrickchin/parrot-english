import { LESSONS, type LessonCatalogEntry } from "./lesson-catalog";

export type LessonSource = "parrot" | "my";

const SAFE_RETURN_PATH =
  /^(?:\/$|\/profile(?:\/|$)|\/lessons(?:\/|$)|\/progress(?:\/|$)|\/stories(?:\/|$))/;
const RETURN_TO_ORIGIN = "https://parrot.invalid";
const PARROT_LESSONS = new Map(LESSONS.map((entry) => [entry.id, entry]));

function parseSceneNumber(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function getLessonPath(source: LessonSource, lessonId: string) {
  if (!lessonId.trim() || lessonId === "." || lessonId === "..") {
    throw new TypeError("Lesson ID must be non-empty and cannot be a dot segment.");
  }

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
  if (!value) return null;

  let destination: URL;
  try {
    destination = new URL(value, RETURN_TO_ORIGIN);
  } catch {
    return null;
  }

  if (
    destination.origin !== RETURN_TO_ORIGIN ||
    !SAFE_RETURN_PATH.test(destination.pathname)
  ) {
    return null;
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
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

export function resolveMyLessonScene(
  _lessonId: string | undefined,
  _sceneNumberValue: string | undefined,
) {
  void _lessonId;
  void _sceneNumberValue;
  return null;
}
