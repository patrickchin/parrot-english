// @ts-check

import { reduceLessonState } from "./lesson-state.js";

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
