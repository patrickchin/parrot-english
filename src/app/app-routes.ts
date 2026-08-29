import { LESSONS, type LessonCatalogEntry } from "../lessons/lesson-catalog";
import {
  resolveStory as resolveCatalogStory,
  type Story,
} from "../stories/story-catalog";
import { isSafeRouteId } from "../../lib/route-id";

export type LessonSource = "parrot" | "my";
export type GateRouteKind = "login" | "learner-profile" | "profile";
type ResolvedLessonScene = {
  entry: LessonCatalogEntry;
  sceneIndex: number;
};
export type LessonRouteDecision =
  | { kind: "redirect"; replace: true; to: string }
  | ({ kind: "lesson" } & ResolvedLessonScene);
export type StoryRouteDecision =
  | { kind: "redirect"; replace: true; to: string }
  | { kind: "story"; pageIndex: number; story: Story };

const GATE_ROUTE_PATH =
  /^\/(login|profile\/setup|profile|guardian\/profile\/setup|guardian\/profile)\/*$/i;
const TALK_TO_PEPPA_ROUTE_PATH = /^\/talk-to-peppa\/*$/i;
const GUARDIAN_LEARNERS_ROUTE_PATH = /^\/guardian\/learners\/*$/i;
const GUARDIAN_LEARNER_ROUTE_PATH =
  /^\/guardian\/learners\/([^/]+)\/*$/i;
const GUARDIAN_ROUTE_PATHS = [
  /^\/guardian\/*$/i,
  /^\/guardian\/account\/*$/i,
  /^\/guardian\/dubbing\/*$/i,
  GUARDIAN_LEARNERS_ROUTE_PATH,
  /^\/guardian\/lessons\/*$/i,
  /^\/guardian\/profile\/*$/i,
  /^\/guardian\/profile\/setup\/*$/i,
  /^\/guardian\/stories\/*$/i,
];
const GUARDIAN_MANAGEMENT_ROUTE_PATHS = [
  ...GUARDIAN_ROUTE_PATHS,
  /^\/profile\/*$/i,
  /^\/lessons\/my\/create\/*$/i,
];
const SAFE_RETURN_PATHS = [
  /^\/$/,
  TALK_TO_PEPPA_ROUTE_PATH,
  /^\/dubs\/*$/i,
  /^\/dubs\/five-little-ducks\/*$/i,
  /^\/dubs\/old-macdonald\/*$/i,
  ...GUARDIAN_ROUTE_PATHS,
  /^\/profile\/*$/i,
  /^\/lessons\/*$/i,
  /^\/lessons\/my\/create\/*$/i,
  /^\/lessons\/(?:parrot|my)\/[^/]+\/*$/i,
  /^\/lessons\/(?:parrot|my)\/[^/]+\/scenes\/[^/]+\/*$/i,
  /^\/progress\/*$/i,
  /^\/stories\/*$/i,
  /^\/stories\/[^/]+\/*$/i,
  /^\/stories\/[^/]+\/pages\/[^/]+\/*$/i,
];
const RETURN_TO_ORIGIN = "https://parrot.invalid";
const PARROT_LESSONS = new Map(LESSONS.map((entry) => [entry.id, entry]));

export function getGuardianPath() {
  return "/guardian";
}

export function getGuardianAccountPath() {
  return "/guardian/account" as const;
}

function withLearnerProfileTarget(path: string, learnerProfileId?: string) {
  return learnerProfileId === undefined
    ? path
    : `${path}?${new URLSearchParams({ learnerProfileId })}`;
}

export function getGuardianDubbingPath(learnerProfileId?: string) {
  return withLearnerProfileTarget("/guardian/dubbing", learnerProfileId);
}

export function getGuardianLessonsPath(learnerProfileId?: string) {
  return withLearnerProfileTarget("/guardian/lessons", learnerProfileId);
}

export function getGuardianLearnersPath() {
  return "/guardian/learners" as const;
}

export function getGuardianLearnerPath(learnerId: string) {
  if (!isSafeRouteId(learnerId)) {
    throw new TypeError(
      "Learner ID must be non-empty, encodable, and cannot be a dot segment.",
    );
  }
  return `${getGuardianLearnersPath()}/${encodeURIComponent(learnerId)}`;
}

export function getGuardianLearnerRouteId(pathname: string) {
  const match = GUARDIAN_LEARNER_ROUTE_PATH.exec(pathname);
  if (!match) return null;
  try {
    const learnerId = decodeURIComponent(match[1]);
    return isSafeRouteId(learnerId) ? learnerId : null;
  } catch {
    return null;
  }
}

export function isGuardianLearnerChildRoute(pathname: string) {
  return GUARDIAN_LEARNER_ROUTE_PATH.test(pathname);
}

export function isGuardianLearnerManagerRoute(pathname: string) {
  return (
    GUARDIAN_LEARNERS_ROUTE_PATH.test(pathname) ||
    getGuardianLearnerRouteId(pathname) !== null
  );
}

export function getGuardianStoriesPath(learnerProfileId?: string) {
  return withLearnerProfileTarget("/guardian/stories", learnerProfileId);
}

function parseSceneNumber(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function getLessonPath(source: LessonSource, lessonId: string) {
  if (!isSafeRouteId(lessonId)) {
    throw new TypeError(
      "Lesson ID must be non-empty, encodable, and cannot be a dot segment.",
    );
  }

  return `/lessons/${source}/${encodeURIComponent(lessonId)}`;
}

export function getStoryPath(storyId: string) {
  if (!isSafeRouteId(storyId)) {
    throw new TypeError(
      "Story ID must be non-empty, encodable, and cannot be a dot segment.",
    );
  }

  return `/stories/${encodeURIComponent(storyId)}`;
}

export function getDuckDubPath() {
  return "/dubs/five-little-ducks" as const;
}

export function getNurseryRhymesPath() {
  return "/dubs" as const;
}

export function getOldMacDonaldDubPath() {
  return "/dubs/old-macdonald" as const;
}

export function getStoryShelfPath() {
  return "/stories" as const;
}

export function getStoryPagePath(storyId: string, pageIndex: number) {
  return `${getStoryPath(storyId)}/pages/${pageIndex + 1}`;
}

export function getLessonScenePath(
  source: LessonSource,
  lessonId: string,
  sceneIndex: number,
) {
  return `${getLessonPath(source, lessonId)}/scenes/${sceneIndex + 1}`;
}

export function getMyLessonCreatePath(learnerProfileId?: string) {
  return withLearnerProfileTarget("/lessons/my/create", learnerProfileId);
}

export function getLoginPath(returnTo: string) {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getLearnerProfilePath(returnTo: string) {
  return `/profile/setup?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getProfilePath(returnTo: string) {
  return `/guardian/profile?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getRedoLearnerProfilePath(returnTo: string) {
  return `/guardian/profile/setup?redo=1&returnTo=${encodeURIComponent(returnTo)}`;
}

export function isRedoLearnerProfileRequest(search: string) {
  return new URLSearchParams(search).get("redo") === "1";
}

export function isGuardianRoute(pathname: string, search = "") {
  if (/^\/profile\/setup\/*$/i.test(pathname)) {
    return isRedoLearnerProfileRequest(search);
  }
  return (
    isGuardianLearnerManagerRoute(pathname) ||
    GUARDIAN_MANAGEMENT_ROUTE_PATHS.some((path) => path.test(pathname))
  );
}

export function getGateRouteKind(pathname: string): GateRouteKind | null {
  const match = GATE_ROUTE_PATH.exec(pathname);
  if (!match) return null;
  const route = match[1].toLowerCase();
  if (route === "profile/setup" || route === "guardian/profile/setup") {
    return "learner-profile";
  }
  return route === "profile" || route === "guardian/profile"
    ? "profile"
    : "login";
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
    (!SAFE_RETURN_PATHS.some((path) => path.test(destination.pathname)) &&
      getGuardianLearnerRouteId(destination.pathname) === null)
  ) {
    return null;
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function getSafeGuardianReturnTo(search: string) {
  const safe = getSafeReturnTo(search);
  if (!safe) return getGuardianPath();
  const { pathname } = new URL(safe, RETURN_TO_ORIGIN);
  if (!isGuardianRoute(pathname) || getGateRouteKind(pathname)) {
    return getGuardianPath();
  }
  return safe;
}

export function getSafeGuardianUnlockDestination(
  pathname: string,
  search: string,
  hash: string,
) {
  return isGuardianRoute(pathname, search)
    ? `${pathname}${search}${hash}`
    : getGuardianPath();
}

export function getRequestedProtectedTarget(
  pathname: string,
  search: string,
  hash: string,
) {
  const gateRoute = getGateRouteKind(pathname);
  if (
    gateRoute === "login" ||
    (gateRoute === "learner-profile" && !isGuardianRoute(pathname, search))
  ) {
    return getSafeReturnTo(search) ?? "/";
  }

  return `${pathname}${search}${hash}`;
}

export function resolveParrotLesson(lessonId: string | undefined) {
  return lessonId ? (PARROT_LESSONS.get(lessonId) ?? null) : null;
}

export function resolveStory(storyId: string | undefined) {
  return storyId ? resolveCatalogStory(storyId) : null;
}

export function resolveStoryPage(
  storyId: string | undefined,
  pageNumberValue: string | undefined,
) {
  const story = resolveStory(storyId);
  const pageNumber = parseSceneNumber(pageNumberValue);
  if (!story || pageNumber === null || pageNumber > story.pages.length) {
    return null;
  }

  return { pageIndex: pageNumber - 1, story };
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

function redirectStoryTo(to: string): StoryRouteDecision {
  return { kind: "redirect", replace: true, to };
}

export function resolveStoryRouteDecision(
  storyId: string | undefined,
  pageNumberValue: string | undefined,
): StoryRouteDecision {
  const story = resolveStory(storyId);
  if (!story) return redirectStoryTo("/stories");

  const resolved = resolveStoryPage(storyId, pageNumberValue);
  if (!resolved) {
    return redirectStoryTo(getStoryPagePath(story.id, 0));
  }

  return { kind: "story", ...resolved };
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
