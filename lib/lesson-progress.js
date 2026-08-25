// @ts-check

import { LessonPhase } from "./lesson-state.js";

/**
 * @param {import("./lesson-state.js").LessonState} state
 * @param {{ speaker?: string }} [step]
 */
export function getLessonProgressLabel(state, step) {
  switch (state.phase) {
    case LessonPhase.Idle:
      return "Press Start to begin";
    case LessonPhase.Paused:
      return "Story paused — press Play to resume";
    case LessonPhase.Speaking:
      if (step?.speaker === "narrator") return "Listen to the narrator";
      if (step?.speaker) {
        return `Listen to ${step.speaker[0].toUpperCase()}${step.speaker.slice(1)}`;
      }
      return "Listen carefully";
    case LessonPhase.JoiningIn:
      return "Join in if you want";
    case LessonPhase.Finished:
      return "Lesson complete";
    default:
      return "Get ready";
  }
}
