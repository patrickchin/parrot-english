import { LESSONS, type LessonCatalogEntry } from "../lessons/lesson-catalog";
import {
  getStoryShelfLevelId,
  isStoryLevelId,
  resolveStory as resolveCatalogStory,
  type Story,
  type StoryLevelId,
} from "../stories/story-catalog";
import { isSafeRouteId } from "../../lib/route-id";
import {
  DUB_DEFINITIONS,
  type DubDefinition,
} from "../dubbing/rhyme-catalog";
import {
  resolveWordGameTopic,
  type WordGameTopic,
} from "../games/word-game-catalog";

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
export type WordGameRouteDecision =
  | { kind: "redirect"; replace: true; to: string }
  | { kind: "game"; topic: WordGameTopic };

const GATE_ROUTE_PATH =
  /^\/(login|profile\/setup|profile|guardian\/profile\/setup|guardian\/profile)\/*$/i;
const TALK_TO_PEPPA_ROUTE_PATH = /^\/talk-to-peppa\/*$/i;
const WORD_GAME_ROUTE_PATH = /^\/word-game\/*$/i;
const WORD_GAMES_ROUTE_PATH = /^\/word-games\/*$/i;
const WORD_GAME_TOPIC_ROUTE_PATH = /^\/word-games\/([^/]+)\/*$/i;
const GUARDIAN_LEARNERS_ROUTE_PATH = /^\/guardian\/learners\/*$/i;
const GUARDIAN_LEARNER_ROUTE_PATH =
  /^\/guardian\/learners\/([^/]+)\/*$/i;
const GUARDIAN_ROUTE_PATHS = [
  /^\/guardian\/*$/i,
  /^\/guardian\/account\/*$/i,
  /^\/guardian\/dubbing\/*$/i,
  GUARDIAN_LEARNERS_ROUTE_PATH,
  /^\/guardian\/profile\/*$/i,
  /^\/guardian\/profile\/setup\/*$/i,
  /^\/guardian\/stories\/*$/i,
];
const GUARDIAN_MANAGEMENT_ROUTE_PATHS = [
  ...GUARDIAN_ROUTE_PATHS,
  /^\/profile\/*$/i,
];
export function getDubRoutePaths(
  definitions: readonly DubDefinition[] = DUB_DEFINITIONS,
) {
  return definitions.map(({ route }) => route);
}

const DUB_ROUTE_PATHS = getDubRoutePaths().map(
  (route) => new RegExp(`^${route}\\/*$`, "i"),
);
const SAFE_RETURN_PATHS = [
  /^\/$/,
  TALK_TO_PEPPA_ROUTE_PATH,
  /^\/dubs\/*$/i,
  ...DUB_ROUTE_PATHS,
  ...GUARDIAN_ROUTE_PATHS,
  /^\/profile\/*$/i,
  /^\/lessons\/*$/i,
  /^\/lessons\/parrot\/[^/]+\/*$/i,
  /^\/lessons\/parrot\/[^/]+\/scenes\/[^/]+\/*$/i,
  /^\/progress\/*$/i,
  /^\/stories\/*$/i,
  /^\/stories\/[^/]+\/*$/i,
  /^\/stories\/[^/]+\/pages\/[^/]+\/*$/i,
  WORD_GAME_ROUTE_PATH,
  WORD_GAMES_ROUTE_PATH,
];
const RETURN_TO_ORIGIN = "https://parrot.invalid";
const PARROT_LESSONS = new Map(LESSONS.map((entry) => [entry.id, entry]));
const DEFAULT_STORY_LEVEL_ID: StoryLevelId = "first-words";

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

export function getLessonPath(lessonId: string) {
  if (!isSafeRouteId(lessonId)) {
    throw new TypeError(
      "Lesson ID must be non-empty, encodable, and cannot be a dot segment.",
    );
  }

  return `/lessons/parrot/${encodeURIComponent(lessonId)}`;
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

export function getStoryShelfPath(
  levelId?: StoryLevelId,
) {
  return levelId === undefined
    ? "/stories"
    : `/stories?level=${encodeURIComponent(getStoryShelfLevelId(levelId))}`;
}

export function resolveStoryShelfLevel(
  search: string,
  fallbackLevelId: StoryLevelId = DEFAULT_STORY_LEVEL_ID,
): StoryLevelId {
  const levelId = new URLSearchParams(search).get("level");
  return getStoryShelfLevelId(
    isStoryLevelId(levelId) ? levelId : fallbackLevelId,
  );
}

export function getStoryPagePath(storyId: string, pageIndex: number) {
  return `${getStoryPath(storyId)}/pages/${pageIndex + 1}`;
}

export function getLessonScenePath(lessonId: string, sceneIndex: number) {
  return `${getLessonPath(lessonId)}/scenes/${sceneIndex + 1}`;
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

function resolveWordGameRouteTopic(topicId: string | undefined) {
  return topicId ? resolveWordGameTopic(topicId.toLowerCase()) : null;
}

function getWordGameRouteId(pathname: string) {
  const match = WORD_GAME_TOPIC_ROUTE_PATH.exec(pathname);
  if (!match || match[1].includes("%")) return null;
  return resolveWordGameRouteTopic(match[1])?.id ?? null;
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
      getGuardianLearnerRouteId(destination.pathname) === null &&
      getWordGameRouteId(destination.pathname) === null)
  ) {
    return null;
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function getPostLoginDestination(search: string) {
  const safe = getSafeReturnTo(search);
  if (!safe) return "/";
  const destination = new URL(safe, RETURN_TO_ORIGIN);
  return isGuardianRoute(destination.pathname, destination.search) ? "/" : safe;
}

export function resolveWordGameRouteDecision(
  topicId: string | undefined,
  pathname?: string,
): WordGameRouteDecision {
  if (pathname && getWordGameRouteId(pathname) === null) {
    return { kind: "redirect", replace: true, to: "/word-games" };
  }
  const topic = resolveWordGameRouteTopic(topicId);
  return topic
    ? { kind: "game", topic }
    : { kind: "redirect", replace: true, to: "/word-games" };
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
    return redirectTo(getLessonScenePath(entry.id, 0));
  }

  return { kind: "lesson", ...resolved };
}
