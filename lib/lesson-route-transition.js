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
 * @returns {import("./lesson-state.js").LessonEvent}
 */
export function getLessonRouteReconciliationEvent(pending, routedSceneIndex) {
  return pending?.sceneIndex === routedSceneIndex
    ? pending.event
    : { type: "SELECT_SCENE", sceneIndex: routedSceneIndex };
}
