// @ts-check

import { reduceLessonState } from "./lesson-state.js";

/**
 * @typedef {{ destinationKey: string, sequence: number }} LessonHistoryPopToken
 */

/**
 * @param {unknown} state
 * @returns {string | null}
 */
function getHistoryStateKey(state) {
  if (!state || typeof state !== "object" || !("key" in state)) return null;
  return typeof state.key === "string" && state.key ? state.key : null;
}

/**
 * @param {number} previousSequence
 * @param {unknown} eventState
 * @param {unknown} historyState
 * @returns {LessonHistoryPopToken}
 */
export function createLessonHistoryPopToken(
  previousSequence,
  eventState,
  historyState,
) {
  return {
    destinationKey:
      getHistoryStateKey(eventState) ??
      getHistoryStateKey(historyState) ??
      "default",
    sequence: previousSequence + 1,
  };
}

/**
 * @param {LessonHistoryPopToken | null} pendingToken
 * @param {string} routedLocationKey
 * @returns {{ isHistoryPop: boolean, pendingToken: LessonHistoryPopToken | null }}
 */
export function consumeLessonHistoryPopToken(
  pendingToken,
  routedLocationKey,
) {
  if (pendingToken?.destinationKey !== routedLocationKey) {
    return { isHistoryPop: false, pendingToken };
  }
  return { isHistoryPop: true, pendingToken: null };
}

/**
 * @param {import("./lesson-state.js").LessonState} state
 * @param {import("./lesson-state.js").LessonEvent} event
 * @param {import("./lesson-data.js").Lesson} lesson
 * @returns {number | null}
 */
export function getLessonEventTargetSceneIndex(state, event, lesson) {
  const nextState = reduceLessonState(state, event, lesson);
  return nextState.sceneIndex === state.sceneIndex ? null : nextState.sceneIndex;
}

/**
 * @param {{ event: import("./lesson-state.js").LessonEvent, sceneIndex: number } | null} pending
 * @param {number} routedSceneIndex
 * @param {{ currentSceneIndex?: number, isHistoryPop?: boolean }} [options]
 * @returns {import("./lesson-state.js").LessonEvent | null}
 */
export function getLessonRouteReconciliationEvent(
  pending,
  routedSceneIndex,
  options,
) {
  if (options?.isHistoryPop) {
    return { type: "SELECT_SCENE", sceneIndex: routedSceneIndex };
  }
  if (options?.currentSceneIndex === routedSceneIndex) {
    return null;
  }
  return pending?.sceneIndex === routedSceneIndex
    ? pending.event
    : { type: "SELECT_SCENE", sceneIndex: routedSceneIndex };
}
