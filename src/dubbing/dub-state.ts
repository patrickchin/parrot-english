import { FIVE_LITTLE_DUCKS_DUB } from "./dub-script.ts";
import type { DubDefinition } from "./rhyme-catalog.ts";

export type DubSaveRecovery = "record" | "save";
export type DubView = "loading" | "intro" | "project" | "scene";
export type DubOperation =
  | "idle"
  | "guide-playing"
  | "mic-opening"
  | "recording"
  | "saving"
  | "take-playing"
  | "playback-loading"
  | "playback";
export type DubPlaybackScope = "full" | "scene" | null;
export type DubState = {
  error: string;
  needsRetake: Record<string, true>;
  operation: DubOperation;
  playbackScope: DubPlaybackScope;
  saveRecovery: DubSaveRecovery | null;
  saved: Record<string, string>;
  selectedLineIndex: number;
  selectedSceneIndex: number;
  view: DubView;
};
export type DubSceneStatus =
  | { kind: "not-started"; recorded: 0 }
  | { kind: "in-progress"; recorded: number }
  | { kind: "done"; recorded: number }
  | { kind: "needs-retake"; recorded: number };
export type DubEvent =
  | { type: "LOADED"; savedLineIds: string[] }
  | { type: "STARTED" }
  | { type: "OPEN_SCENE"; sceneIndex: number }
  | { type: "CONTINUE" }
  | { type: "SELECT_LINE"; lineId: string }
  | { type: "BACK_TO_PROJECT" }
  | { type: "OPERATION_STARTED"; operation: DubOperation; playbackScope?: DubPlaybackScope }
  | { type: "OPERATION_FINISHED" }
  | { type: "SAVE_FAILED"; message: string; recovery: DubSaveRecovery }
  | { type: "SAVE_SUCCEEDED"; lineId: string; recordedAt: string }
  | { type: "MARK_NEEDS_RETAKE"; lineId: string }
  | { type: "CLEAR_NEEDS_RETAKE"; lineId: string }
  | { type: "SET_ERROR"; message: string };

const DUB_UNSAFE_OPERATIONS = new Set<DubOperation>([
  "mic-opening",
  "recording",
  "saving",
]);

export const createInitialDubState = (
  _definition: DubDefinition = FIVE_LITTLE_DUCKS_DUB,
): DubState => ({
  error: "",
  needsRetake: {},
  operation: "idle",
  playbackScope: null,
  saveRecovery: null,
  saved: {},
  selectedLineIndex: 0,
  selectedSceneIndex: 0,
  view: "loading",
});

function getSceneIndexForLine(
  lineIndex: number,
  definition: DubDefinition = FIVE_LITTLE_DUCKS_DUB,
): number {
  return Math.floor(lineIndex / definition.linesPerScene);
}

function getSceneStartIndex(
  sceneIndex: number,
  definition: DubDefinition = FIVE_LITTLE_DUCKS_DUB,
): number {
  return sceneIndex * definition.linesPerScene;
}

function isSceneIndex(
  sceneIndex: number,
  definition: DubDefinition = FIVE_LITTLE_DUCKS_DUB,
): boolean {
  return Number.isInteger(sceneIndex)
    && sceneIndex >= 0
    && sceneIndex < definition.lines.length / definition.linesPerScene;
}

function getLineIndex(
  lineId: string,
  definition: DubDefinition = FIVE_LITTLE_DUCKS_DUB,
): number {
  return definition.lines.findIndex(({ id }) => id === lineId);
}

function hasSavedLine(saved: Record<string, string>, lineId: string): boolean {
  return Object.hasOwn(saved, lineId);
}

function canChangeSelection(state: DubState): boolean {
  return !DUB_UNSAFE_OPERATIONS.has(state.operation) && state.saveRecovery !== "save";
}

function getFirstMissingSceneLineIndex(
  savedLineIds: ReadonlySet<string>,
  sceneIndex: number,
  definition: DubDefinition = FIVE_LITTLE_DUCKS_DUB,
): number {
  const sceneStart = getSceneStartIndex(sceneIndex, definition);
  const index = definition.lines.findIndex(
    ({ id }, lineIndex) =>
      lineIndex >= sceneStart
      && lineIndex < sceneStart + definition.linesPerScene
      && !savedLineIds.has(id),
  );
  return index < 0 ? sceneStart : index;
}

function selectScene(
  state: DubState,
  sceneIndex: number,
  definition: DubDefinition = FIVE_LITTLE_DUCKS_DUB,
): DubState {
  if (!isSceneIndex(sceneIndex, definition)) return state;
  const selectedLineIndex = getFirstMissingSceneLineIndex(
    new Set(Object.keys(state.saved)),
    sceneIndex,
    definition,
  );
  return {
    ...state,
    error: "",
    operation: "idle",
    playbackScope: null,
    selectedLineIndex,
    selectedSceneIndex: sceneIndex,
    view: "scene",
  };
}

export function getDubSceneStatus(
  state: Pick<DubState, "saved" | "needsRetake">,
  sceneIndex: number,
  definition: DubDefinition = FIVE_LITTLE_DUCKS_DUB,
): DubSceneStatus {
  if (!isSceneIndex(sceneIndex, definition)) throw new RangeError("Unknown dub scene.");
  const sceneStart = getSceneStartIndex(sceneIndex, definition);
  const sceneLines = definition.lines.slice(sceneStart, sceneStart + definition.linesPerScene);
  const recorded = sceneLines.reduce(
    (count, { id }) => count + (hasSavedLine(state.saved, id) ? 1 : 0),
    0,
  );
  if (sceneLines.some(({ id }) => Object.hasOwn(state.needsRetake, id))) {
    return { kind: "needs-retake", recorded };
  }
  if (recorded === 0) return { kind: "not-started", recorded: 0 };
  if (recorded === definition.linesPerScene) return { kind: "done", recorded };
  return { kind: "in-progress", recorded };
}

export function firstMissingDubLineIndex(
  savedLineIds: ReadonlySet<string>,
  definition: DubDefinition = FIVE_LITTLE_DUCKS_DUB,
): number {
  const index = definition.lines.findIndex(({ id }) => !savedLineIds.has(id));
  return index < 0 ? 0 : index;
}

export function reduceDubState(
  state: DubState,
  event?: DubEvent,
  definition: DubDefinition = FIVE_LITTLE_DUCKS_DUB,
): DubState {
  if (!event) return state;
  if (event.type === "LOADED") {
    const savedLineIds = new Set(event.savedLineIds);
    const saved = Object.fromEntries(
      definition.lines.filter(({ id }) => savedLineIds.has(id)).map(({ id }) => [id, ""]),
    );
    const selectedLineIndex = firstMissingDubLineIndex(new Set(Object.keys(saved)), definition);
    return {
      ...createInitialDubState(definition),
      saved,
      selectedLineIndex,
      selectedSceneIndex: getSceneIndexForLine(selectedLineIndex, definition),
      view: "intro",
    };
  }
  if (event.type === "STARTED") {
    return state.view === "loading" || state.view === "intro"
      ? { ...state, error: "", view: "project" }
      : state;
  }
  if (event.type === "OPEN_SCENE") {
    return canChangeSelection(state) && (state.view === "project" || state.view === "scene")
      ? selectScene(state, event.sceneIndex, definition)
      : state;
  }
  if (event.type === "CONTINUE") {
    if (!canChangeSelection(state) || state.view !== "project") return state;
    const selectedLineIndex = firstMissingDubLineIndex(new Set(Object.keys(state.saved)), definition);
    return selectScene(state, getSceneIndexForLine(selectedLineIndex, definition), definition);
  }
  if (event.type === "SELECT_LINE") {
    if (!canChangeSelection(state) || state.view !== "scene") return state;
    const selectedLineIndex = getLineIndex(event.lineId, definition);
    if (
      selectedLineIndex < 0
      || getSceneIndexForLine(selectedLineIndex, definition) !== state.selectedSceneIndex
    ) {
      return state;
    }
    return {
      ...state,
      error: "",
      operation: "idle",
      playbackScope: null,
      selectedLineIndex,
    };
  }
  if (event.type === "BACK_TO_PROJECT") {
    if (!canChangeSelection(state) || state.view !== "scene") return state;
    return {
      ...state,
      error: "",
      operation: "idle",
      playbackScope: null,
      view: "project",
    };
  }
  if (event.type === "OPERATION_STARTED") {
    const preserveRecoveryError = state.saveRecovery !== null
      && (event.operation === "guide-playing" || event.operation === "take-playing");
    return {
      ...state,
      error: preserveRecoveryError ? state.error : "",
      operation: event.operation,
      playbackScope: event.playbackScope ?? null,
      saveRecovery: event.operation === "mic-opening" ? null : state.saveRecovery,
    };
  }
  if (event.type === "OPERATION_FINISHED") {
    return { ...state, operation: "idle", playbackScope: null };
  }
  if (event.type === "SAVE_FAILED") {
    return {
      ...state,
      error: event.message,
      operation: "idle",
      playbackScope: null,
      saveRecovery: event.recovery,
    };
  }
  if (event.type === "SAVE_SUCCEEDED") {
    const selectedLineIndex = getLineIndex(event.lineId, definition);
    if (selectedLineIndex < 0) return state;
    const needsRetake = { ...state.needsRetake };
    delete needsRetake[event.lineId];
    return {
      ...state,
      error: "",
      needsRetake,
      operation: "idle",
      playbackScope: null,
      saveRecovery: null,
      saved: { ...state.saved, [event.lineId]: event.recordedAt },
      selectedLineIndex,
      selectedSceneIndex: getSceneIndexForLine(selectedLineIndex, definition),
    };
  }
  if (event.type === "MARK_NEEDS_RETAKE") {
    return getLineIndex(event.lineId, definition) < 0
      ? state
      : { ...state, needsRetake: { ...state.needsRetake, [event.lineId]: true } };
  }
  if (event.type === "CLEAR_NEEDS_RETAKE") {
    if (!Object.hasOwn(state.needsRetake, event.lineId)) return state;
    const needsRetake = { ...state.needsRetake };
    delete needsRetake[event.lineId];
    return { ...state, needsRetake };
  }
  if (event.type === "SET_ERROR") return { ...state, error: event.message };
  return state;
}
