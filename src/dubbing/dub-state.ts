import { DUB_LINES, DUB_LINES_PER_VERSE } from "./dub-script.ts";

export type DubPhase = "loading" | "intro" | "line-ready" | "mic-opening" | "recording" | "saving" | "save-error" | "line-review" | "verse-loading" | "verse-playing" | "final-ready" | "final-loading" | "final-playing";
export type DubLineMode = "fresh" | "replacement";
export type DubSaveRecovery = "record" | "save";
export type DubState = { currentLineIndex: number; error: string; lineMode: DubLineMode; phase: DubPhase; saved: Record<string, string>; saveRecovery: DubSaveRecovery };
export type DubEvent =
  | { type: "LOADED"; savedLineIds: string[] }
  | { type: "CONFIRMED" } | { type: "MIC_OPENING" } | { type: "MIC_STARTED" }
  | { type: "SAVE_STARTED" } | { type: "SAVE_FAILED"; message: string; recovery: DubSaveRecovery }
  | { type: "SAVE_SUCCEEDED"; lineId: string; recordedAt: string }
  | { type: "NEXT_LINE" } | { type: "RETAKE" }
  | { type: "SELECT_LINE"; lineId: string }
  | { type: "VERSE_LOADING" } | { type: "VERSE_STARTED" } | { type: "VERSE_FAILED" } | { type: "VERSE_FINISHED" }
  | { type: "FINAL_LOADING" } | { type: "FINAL_STARTED" } | { type: "FINAL_FINISHED" }
  | { type: "RESET_SUCCEEDED" };

export const createInitialDubState = (): DubState => ({ currentLineIndex: 0, error: "", lineMode: "fresh", phase: "loading", saved: {}, saveRecovery: "save" });

export type DubView = "loading" | "intro" | "project" | "scene";
export type DubOperation =
  | "idle"
  | "guide-playing"
  | "mic-opening"
  | "recording"
  | "saving"
  | "take-playing"
  | "playback-loading"
  | "playback"
  | "deleting";
export type DubPlaybackScope = "full" | "scene" | null;
export type DubEditorState = {
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
  | { kind: "in-progress"; recorded: 1 | 2 | 3 }
  | { kind: "done"; recorded: 4 }
  | { kind: "needs-retake"; recorded: number };
export type DubEditorEvent =
  | { type: "LOADED"; savedLineIds: string[] }
  | { type: "CONFIRMED" }
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
  | { type: "SET_ERROR"; message: string }
  | { type: "RESET_SUCCEEDED" };

const DUB_UNSAFE_EDITOR_OPERATIONS = new Set<DubOperation>([
  "deleting",
  "mic-opening",
  "recording",
  "saving",
]);

export const createInitialDubEditorState = (): DubEditorState => ({
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

function getDubSceneIndexForLine(lineIndex: number): number {
  return Math.floor(lineIndex / DUB_LINES_PER_VERSE);
}

function getDubSceneStartIndex(sceneIndex: number): number {
  return sceneIndex * DUB_LINES_PER_VERSE;
}

function isDubSceneIndex(sceneIndex: number): boolean {
  return Number.isInteger(sceneIndex) && sceneIndex >= 0 && sceneIndex < DUB_LINES.length / DUB_LINES_PER_VERSE;
}

function getDubLineIndex(lineId: string): number {
  return DUB_LINES.findIndex(({ id }) => id === lineId);
}

function hasDubSavedLine(saved: Record<string, string>, lineId: string): boolean {
  return Object.hasOwn(saved, lineId);
}

function canChangeDubEditorSelection(state: DubEditorState): boolean {
  return !DUB_UNSAFE_EDITOR_OPERATIONS.has(state.operation) && state.saveRecovery === null;
}

function getFirstMissingDubSceneLineIndex(savedLineIds: ReadonlySet<string>, sceneIndex: number): number {
  const sceneStart = getDubSceneStartIndex(sceneIndex);
  const index = DUB_LINES.findIndex(
    ({ id }, lineIndex) =>
      lineIndex >= sceneStart &&
      lineIndex < sceneStart + DUB_LINES_PER_VERSE &&
      !savedLineIds.has(id),
  );
  return index < 0 ? sceneStart : index;
}

function selectDubEditorScene(state: DubEditorState, sceneIndex: number): DubEditorState {
  if (!isDubSceneIndex(sceneIndex)) return state;
  const nextLineIndex = getFirstMissingDubSceneLineIndex(new Set(Object.keys(state.saved)), sceneIndex);
  return {
    ...state,
    error: "",
    selectedLineIndex: nextLineIndex,
    selectedSceneIndex: sceneIndex,
    view: "scene",
  };
}

export function getDubSceneStatus(
  state: Pick<DubEditorState, "saved" | "needsRetake">,
  sceneIndex: number,
): DubSceneStatus {
  if (!isDubSceneIndex(sceneIndex)) throw new RangeError("Unknown dub scene.");
  const sceneStart = getDubSceneStartIndex(sceneIndex);
  const sceneLines = DUB_LINES.slice(sceneStart, sceneStart + DUB_LINES_PER_VERSE);
  const recorded = sceneLines.reduce(
    (count, { id }) => count + (hasDubSavedLine(state.saved, id) ? 1 : 0),
    0,
  );
  if (sceneLines.some(({ id }) => Object.hasOwn(state.needsRetake, id))) {
    return { kind: "needs-retake", recorded };
  }
  if (recorded === 0) return { kind: "not-started", recorded: 0 };
  if (recorded === DUB_LINES_PER_VERSE) return { kind: "done", recorded: 4 };
  return { kind: "in-progress", recorded: recorded as 1 | 2 | 3 };
}

export function reduceDubEditorState(
  state: DubEditorState,
  event: DubEditorEvent,
): DubEditorState {
  if (event.type === "LOADED") {
    const savedLineIds = new Set(event.savedLineIds);
    const saved = Object.fromEntries(
      DUB_LINES.filter(({ id }) => savedLineIds.has(id)).map(({ id }) => [id, ""]),
    );
    const selectedLineIndex = firstMissingDubLineIndex(new Set(Object.keys(saved)));
    return {
      ...createInitialDubEditorState(),
      saved,
      selectedLineIndex,
      selectedSceneIndex: getDubSceneIndexForLine(selectedLineIndex),
      view: "intro",
    };
  }
  if (event.type === "CONFIRMED") return state.view === "loading" || state.view === "intro"
    ? { ...state, error: "", view: "project" }
    : state;
  if (event.type === "OPEN_SCENE") {
    return canChangeDubEditorSelection(state) && (state.view === "project" || state.view === "scene")
      ? selectDubEditorScene(state, event.sceneIndex)
      : state;
  }
  if (event.type === "CONTINUE") {
    if (!canChangeDubEditorSelection(state) || state.view !== "project") return state;
    return selectDubEditorScene(
      { ...state, selectedSceneIndex: getDubSceneIndexForLine(firstMissingDubLineIndex(new Set(Object.keys(state.saved)))) },
      getDubSceneIndexForLine(firstMissingDubLineIndex(new Set(Object.keys(state.saved)))),
    );
  }
  if (event.type === "SELECT_LINE") {
    if (!canChangeDubEditorSelection(state) || state.view !== "scene") return state;
    const selectedLineIndex = getDubLineIndex(event.lineId);
    if (selectedLineIndex < 0 || getDubSceneIndexForLine(selectedLineIndex) !== state.selectedSceneIndex) return state;
    return { ...state, error: "", selectedLineIndex };
  }
  if (event.type === "BACK_TO_PROJECT") {
    if (!canChangeDubEditorSelection(state) || state.view !== "scene") return state;
    return { ...state, error: "", view: "project" };
  }
  if (event.type === "OPERATION_STARTED") {
    return {
      ...state,
      error: "",
      operation: event.operation,
      playbackScope: event.playbackScope ?? null,
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
    const selectedLineIndex = getDubLineIndex(event.lineId);
    if (selectedLineIndex < 0) return state;
    const { [event.lineId]: _removedRetake, ...needsRetake } = state.needsRetake;
    return {
      ...state,
      error: "",
      needsRetake,
      operation: "idle",
      playbackScope: null,
      saveRecovery: null,
      saved: { ...state.saved, [event.lineId]: event.recordedAt },
      selectedLineIndex,
      selectedSceneIndex: getDubSceneIndexForLine(selectedLineIndex),
    };
  }
  if (event.type === "MARK_NEEDS_RETAKE") {
    return getDubLineIndex(event.lineId) < 0
      ? state
      : { ...state, needsRetake: { ...state.needsRetake, [event.lineId]: true } };
  }
  if (event.type === "CLEAR_NEEDS_RETAKE") {
    if (!Object.hasOwn(state.needsRetake, event.lineId)) return state;
    const { [event.lineId]: _removedRetake, ...needsRetake } = state.needsRetake;
    return { ...state, needsRetake };
  }
  if (event.type === "SET_ERROR") return { ...state, error: event.message };
  if (event.type === "RESET_SUCCEEDED") return { ...createInitialDubEditorState(), view: "intro" };
  return state;
}

export function firstMissingDubLineIndex(savedLineIds: ReadonlySet<string>): number {
  const index = DUB_LINES.findIndex(({ id }) => !savedLineIds.has(id));
  return index < 0 ? 0 : index;
}

export function reduceDubState(state: DubState, event: DubEvent): DubState {
  if (event.type === "LOADED") {
    const saved = Object.fromEntries(event.savedLineIds.map((id) => [id, ""]));
    return { currentLineIndex: firstMissingDubLineIndex(new Set(event.savedLineIds)), error: "", lineMode: "fresh", phase: "intro", saved, saveRecovery: "save" };
  }
  if (event.type === "CONFIRMED") return { ...state, phase: DUB_LINES.every(({ id }) => id in state.saved) ? "final-ready" : "line-ready" };
  if (event.type === "MIC_OPENING") return { ...state, error: "", phase: "mic-opening" };
  if (event.type === "MIC_STARTED") return { ...state, phase: "recording" };
  if (event.type === "SAVE_STARTED") return { ...state, error: "", phase: "saving", saveRecovery: "save" };
  if (event.type === "SAVE_FAILED") return { ...state, error: event.message, phase: "save-error", saveRecovery: event.recovery };
  if (event.type === "SAVE_SUCCEEDED") return { ...state, error: "", phase: "line-review", saved: { ...state.saved, [event.lineId]: event.recordedAt }, saveRecovery: "save" };
  if (event.type === "SELECT_LINE") {
    const currentLineIndex = DUB_LINES.findIndex(
      ({ id }) => id === event.lineId && Object.hasOwn(state.saved, id),
    );
    return currentLineIndex < 0
      ? state
      : { ...state, currentLineIndex, error: "", lineMode: "replacement" };
  }
  if (event.type === "NEXT_LINE" || event.type === "VERSE_FINISHED") {
    if (DUB_LINES.every(({ id }) => id in state.saved)) return { ...state, phase: "final-ready" };
    const next = DUB_LINES.findIndex(({ id }, index) => index > state.currentLineIndex && !(id in state.saved));
    return { ...state, currentLineIndex: next < 0 ? firstMissingDubLineIndex(new Set(Object.keys(state.saved))) : next, error: "", lineMode: "fresh", phase: "line-ready" };
  }
  if (event.type === "RETAKE") return {
    ...state,
    error: "",
    lineMode: state.phase === "final-ready" ? "replacement" : state.lineMode,
    phase: "line-ready",
    saveRecovery: "save",
  };
  if (event.type === "VERSE_LOADING") return { ...state, error: "", phase: "verse-loading" };
  if (event.type === "VERSE_STARTED") return { ...state, phase: "verse-playing" };
  if (event.type === "VERSE_FAILED") return { ...state, phase: "line-review" };
  if (event.type === "FINAL_LOADING") return { ...state, phase: "final-loading" };
  if (event.type === "FINAL_STARTED") return { ...state, phase: "final-playing" };
  if (event.type === "FINAL_FINISHED") return { ...state, phase: "final-ready" };
  if (event.type === "RESET_SUCCEEDED") return { ...createInitialDubState(), phase: "intro" };
  return state;
}
