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
      return "Scene paused — press Play to restart";
    case LessonPhase.Speaking:
      if (step?.speaker === "narrator") return "Listen to the narrator";
      if (step?.speaker) {
        return `Listen to ${step.speaker[0].toUpperCase()}${step.speaker.slice(1)}`;
      }
      return "Listen carefully";
    case LessonPhase.WaitingForUser:
      return "Hold the microphone to speak";
    case LessonPhase.Recording:
      return "Keep holding while you speak";
    case LessonPhase.Evaluating:
      return "Checking your speech";
    case LessonPhase.Feedback:
      return "Listen to the narrator";
    case LessonPhase.Finished:
      return "Lesson complete";
    default:
      return "Get ready";
  }
}
