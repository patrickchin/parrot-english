import { DUB_LINES } from "./dub-script.ts";

export type DubPhase = "loading" | "intro" | "line-ready" | "mic-opening" | "recording" | "saving" | "save-error" | "line-review" | "final-ready" | "final-loading" | "final-playing";
export type DubSaveRecovery = "record" | "save";
export type DubState = { currentLineIndex: number; error: string; phase: DubPhase; saved: Record<string, string>; saveRecovery: DubSaveRecovery };
export type DubEvent =
  | { type: "LOADED"; savedLineIds: string[] }
  | { type: "STARTED" } | { type: "MIC_OPENING" } | { type: "MIC_STARTED" }
  | { type: "SAVE_STARTED" } | { type: "SAVE_FAILED"; message: string; recovery: DubSaveRecovery }
  | { type: "SAVE_SUCCEEDED"; lineId: string; recordedAt: string }
  | { type: "NEXT_LINE" } | { type: "RETAKE" }
  | { type: "SELECT_LINE"; lineId: string }
  | { type: "FINAL_LOADING" } | { type: "FINAL_STARTED" } | { type: "FINAL_FINISHED" };

export const createInitialDubState = (): DubState => ({ currentLineIndex: 0, error: "", phase: "loading", saved: {}, saveRecovery: "save" });

export function firstMissingDubLineIndex(savedLineIds: ReadonlySet<string>): number {
  const index = DUB_LINES.findIndex(({ id }) => !savedLineIds.has(id));
  return index < 0 ? 0 : index;
}

export function reduceDubState(state: DubState, event: DubEvent): DubState {
  if (event.type === "LOADED") {
    const saved = Object.fromEntries(event.savedLineIds.map((id) => [id, ""]));
    return { currentLineIndex: firstMissingDubLineIndex(new Set(event.savedLineIds)), error: "", phase: "intro", saved, saveRecovery: "save" };
  }
  if (event.type === "STARTED") return { ...state, phase: DUB_LINES.every(({ id }) => id in state.saved) ? "final-ready" : "line-ready" };
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
      : { ...state, currentLineIndex, error: "" };
  }
  if (event.type === "NEXT_LINE") {
    if (DUB_LINES.every(({ id }) => id in state.saved)) return { ...state, phase: "final-ready" };
    const next = DUB_LINES.findIndex(({ id }, index) => index > state.currentLineIndex && !(id in state.saved));
    return { ...state, currentLineIndex: next < 0 ? firstMissingDubLineIndex(new Set(Object.keys(state.saved))) : next, phase: "line-ready" };
  }
  if (event.type === "RETAKE") return { ...state, error: "", phase: "line-ready", saveRecovery: "save" };
  if (event.type === "FINAL_LOADING") return { ...state, phase: "final-loading" };
  if (event.type === "FINAL_STARTED") return { ...state, phase: "final-playing" };
  if (event.type === "FINAL_FINISHED") return { ...state, phase: "final-ready" };
  return state;
}
