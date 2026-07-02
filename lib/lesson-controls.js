// @ts-check

import { LessonPhase } from "./lesson-state.js";

/**
 * @typedef {"start" | "play" | "pause" | "retry" | "restart" | "status"} LessonControlKind
 * @typedef {"start" | "play" | "pause" | "retry" | "restart" | "none"} LessonControlAction
 * @typedef {{ kind: LessonControlKind, label: string, ariaLabel: string, action: LessonControlAction }} LessonPrimaryControl
 */

/** @type {LessonPrimaryControl} */
const statusControl = {
  kind: "status",
  label: "",
  ariaLabel: "",
  action: "none",
};

/**
 * @param {import("./lesson-state.js").LessonState} state
 * @returns {LessonPrimaryControl}
 */
export function getLessonPrimaryControl(state) {
  if (state.phase === LessonPhase.Error) {
    return {
      kind: "retry",
      label: "再试一次",
      ariaLabel: "Retry scene",
      action: "retry",
    };
  }

  if (state.phase === LessonPhase.Finished) {
    return {
      kind: "restart",
      label: "再来一次",
      ariaLabel: "Restart lesson",
      action: "restart",
    };
  }

  if (state.stepIndex === 0) {
    if (state.phase === LessonPhase.Idle) {
      return {
        kind: "start",
        label: "开始",
        ariaLabel: "Start lesson",
        action: "start",
      };
    }

    return statusControl;
  }

  if (state.phase === LessonPhase.Idle) {
    return {
      kind: "play",
      label: "播放",
      ariaLabel: `Play scene ${state.stepIndex + 1}`,
      action: "play",
    };
  }

  return {
    kind: "pause",
    label: "暂停",
    ariaLabel: `Pause scene ${state.stepIndex + 1}`,
    action: "pause",
  };
}
