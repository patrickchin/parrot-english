// @ts-check

import { LessonPhase } from "./lesson-state.js";

/**
 * Returns the routed page selected by an event, or null when the event should
 * not change the current page.
 *
 * @param {{ phase: string, stepIndex: number }} state
 * @param {{ type: string }} event
 * @param {number} totalSteps
 * @returns {number | null}
 */
export function getLessonEventTargetPageIndex(state, event, totalSteps) {
  let targetPageIndex;

  if (event.type === "START" && state.phase === LessonPhase.Finished) {
    targetPageIndex = 0;
  } else if (event.type === "NEXT" || event.type === "SCENE_NEXT") {
    targetPageIndex = Math.min(state.stepIndex + 1, totalSteps - 1);
  } else if (event.type === "SCENE_PREVIOUS") {
    targetPageIndex = Math.max(state.stepIndex - 1, 0);
  } else {
    return null;
  }

  return targetPageIndex === state.stepIndex ? null : targetPageIndex;
}
