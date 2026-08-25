import { LESSONS, type LessonCatalogEntry } from "../lessons/lesson-catalog";
import {
  resolveStory as resolveCatalogStory,
  type Story,
  STORY_LEVELS,
} from "../stories/story-catalog";
import type { StoryLevelId } from "../stories/story-types";
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

const GATE_ROUTE_PATH = /^\/(login|profile\/setup|profile)\/*$/i;
const TALK_TO_PEPPA_ROUTE_PATH = /^\/talk-to-peppa\/*$/i;
const GUARDIAN_ROUTE_PATHS = [
  /^\/guardian\/*$/i,
  /^\/guardian\/lessons\/*$/i,
  /^\/guardian\/stories\/*$/i,
];
const GUARDIAN_MANAGEMENT_ROUTE_PATHS = [
  ...GUARDIAN_ROUTE_PATHS,
  /^\/profile\/*$/i,
  /^\/lessons\/my\/create\/*$/i,
  /^\/lessons\/my\/[^/]+\/edit\/*$/i,
];
const SAFE_RETURN_PATHS = [
  /^\/$/,
  TALK_TO_PEPPA_ROUTE_PATH,
  /^\/dubs\/five-little-ducks\/*$/i,
  ...GUARDIAN_ROUTE_PATHS,
  /^\/profile\/*$/i,
  /^\/lessons\/*$/i,
  /^\/lessons\/my\/create\/*$/i,
  /^\/lessons\/my\/[^/]+\/edit\/*$/i,
  /^\/lessons\/(?:parrot|my)\/[^/]+\/*$/i,
  /^\/lessons\/(?:parrot|my)\/[^/]+\/scenes\/[^/]+\/*$/i,
  /^\/progress\/*$/i,
  /^\/stories\/*$/i,
  /^\/stories\/[^/]+\/*$/i,
  /^\/stories\/[^/]+\/pages\/[^/]+\/*$/i,
];
const RETURN_TO_ORIGIN = "https://parrot.invalid";
const PARROT_LESSONS = new Map(LESSONS.map((entry) => [entry.id, entry]));
const STORY_LEVEL_IDS = new Set<StoryLevelId>(
  STORY_LEVELS.map(({ id }) => id),
);

export const DEFAULT_STORY_LEVEL_ID: StoryLevelId = "first-words";

export function getGuardianPath() {
  return "/guardian";
}

export function getGuardianLessonsPath() {
  return "/guardian/lessons";
}

export function getGuardianStoriesPath() {
  return "/guardian/stories";
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

export function getStoryShelfPath(
  levelId: StoryLevelId = DEFAULT_STORY_LEVEL_ID,
) {
  return levelId === DEFAULT_STORY_LEVEL_ID
    ? "/stories"
    : `/stories?level=${encodeURIComponent(levelId)}`;
}

export function resolveStoryShelfLevel(search: string): StoryLevelId {
  const levelId = new URLSearchParams(search).get("level");
  return levelId && STORY_LEVEL_IDS.has(levelId as StoryLevelId)
    ? (levelId as StoryLevelId)
    : DEFAULT_STORY_LEVEL_ID;
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

export function getMyLessonEditPath(lessonId: string) {
  return `${getLessonPath("my", lessonId)}/edit`;
}

export function getLoginPath(returnTo: string) {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getLearnerProfilePath(returnTo: string) {
  return `/profile/setup?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getProfilePath(returnTo: string) {
  return `/profile?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getRedoLearnerProfilePath(returnTo: string) {
  return `/profile/setup?redo=1&returnTo=${encodeURIComponent(returnTo)}`;
}

export function isRedoLearnerProfileRequest(search: string) {
  return new URLSearchParams(search).get("redo") === "1";
}

export function isGuardianRoute(pathname: string, search = "") {
  if (/^\/profile\/setup\/*$/i.test(pathname)) {
    return isRedoLearnerProfileRequest(search);
  }
  return GUARDIAN_MANAGEMENT_ROUTE_PATHS.some((path) => path.test(pathname));
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
