import { LESSONS, type LessonCatalogEntry } from "../lessons/lesson-catalog";

export type LessonSource = "parrot" | "my";
export type GateRouteKind = "login" | "learner-profile" | "profile";
type ResolvedLessonScene = {
  entry: LessonCatalogEntry;
  sceneIndex: number;
};
export type LessonRouteDecision =
  | { kind: "redirect"; replace: true; to: string }
  | ({ kind: "lesson" } & ResolvedLessonScene);

const GATE_ROUTE_PATH = /^\/(login|profile\/setup|profile)\/*$/i;
const TALK_TO_PEPPA_ROUTE_PATH = /^\/talk-to-peppa\/*$/i;
const SAFE_RETURN_PATHS = [
  /^\/$/,
  TALK_TO_PEPPA_ROUTE_PATH,
  /^\/profile\/*$/i,
  /^\/lessons\/*$/i,
  /^\/lessons\/my\/create\/*$/i,
  /^\/lessons\/my\/[^/]+\/edit\/*$/i,
  /^\/lessons\/(?:parrot|my)\/[^/]+\/*$/i,
  /^\/lessons\/(?:parrot|my)\/[^/]+\/scenes\/[^/]+\/*$/i,
  /^\/(?:progress|stories)\/*$/i,
];
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

export function getMyLessonEditPath(lessonId: string) {
  return `${getLessonPath("my", lessonId)}/edit`;
}

export function getLoginPath(returnTo: string) {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getLearnerProfilePath(returnTo: string) {
  return `/profile/setup?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getRedoLearnerProfilePath(returnTo: string) {
  return `/profile/setup?redo=1&returnTo=${encodeURIComponent(returnTo)}`;
}

export function isRedoLearnerProfileRequest(search: string) {
  return new URLSearchParams(search).get("redo") === "1";
}

export function getGateRouteKind(pathname: string): GateRouteKind | null {
  const match = GATE_ROUTE_PATH.exec(pathname);
  if (!match) return null;
  const route = match[1].toLowerCase();
  return route === "profile/setup" ? "learner-profile" : (route as GateRouteKind);
}

export function isTalkToPeppaRoute(pathname: string) {
  return TALK_TO_PEPPA_ROUTE_PATH.test(pathname);
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
    !SAFE_RETURN_PATHS.some((path) => path.test(destination.pathname))
  ) {
    return null;
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function getRequestedProtectedTarget(
  pathname: string,
  search: string,
  hash: string,
) {
  const gateRoute = getGateRouteKind(pathname);
  if (gateRoute === "login" || gateRoute === "learner-profile") {
    return getSafeReturnTo(search) ?? "/";
  }

  return `${pathname}${search}${hash}`;
}

export function resolveParrotLesson(lessonId: string | undefined) {
  return lessonId ? (PARROT_LESSONS.get(lessonId) ?? null) : null;
}

export function resolveParrotLessonScene(
  lessonId: string | undefined,
  sceneNumberValue: string | undefined,
): ResolvedLessonScene | null {
  const entry = resolveParrotLesson(lessonId);
  const sceneNumber = parseSceneNumber(sceneNumberValue);
  if (!entry || sceneNumber === null || sceneNumber > entry.lesson.scenes.length) {
    return null;
  }

  return { entry, sceneIndex: sceneNumber - 1 };
}

export function resolveMyLessonScene(
  entry: LessonCatalogEntry | null,
  lessonId: string | undefined,
  sceneNumberValue: string | undefined,
): ResolvedLessonScene | null {
  const sceneNumber = parseSceneNumber(sceneNumberValue);
  if (
    !entry ||
    !lessonId ||
    entry.id !== lessonId ||
    sceneNumber === null ||
    sceneNumber > entry.lesson.scenes.length
  ) {
    return null;
  }
  return { entry, sceneIndex: sceneNumber - 1 };
}

function redirectTo(to: string): LessonRouteDecision {
  return { kind: "redirect", replace: true, to };
}

export function resolveParrotLessonRouteDecision(
  lessonId: string | undefined,
  sceneNumberValue: string | undefined,
): LessonRouteDecision {
  const entry = resolveParrotLesson(lessonId);
  if (!entry) return redirectTo("/lessons");

  const resolved = resolveParrotLessonScene(lessonId, sceneNumberValue);
  if (!resolved) {
    return redirectTo(getLessonScenePath("parrot", entry.id, 0));
  }

  return { kind: "lesson", ...resolved };
}

export function resolveMyLessonRouteDecision(
  entry: LessonCatalogEntry | null,
  lessonId: string | undefined,
  sceneNumberValue: string | undefined,
): LessonRouteDecision {
  if (!entry || !lessonId || entry.id !== lessonId) {
    return redirectTo("/lessons");
  }
  const resolved = resolveMyLessonScene(entry, lessonId, sceneNumberValue);
  return resolved
    ? { kind: "lesson", ...resolved }
    : redirectTo(getLessonScenePath("my", entry.id, 0));
}
