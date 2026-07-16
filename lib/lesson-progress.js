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
      return "Tap the microphone to start speaking";
    case LessonPhase.Recording:
      return "Tap the microphone when you're finished";
    case LessonPhase.Evaluating:
      return "Checking your speech";
    case LessonPhase.Responding:
      if (step?.speaker === "narrator") return "Listen to the narrator";
      if (step?.speaker) {
        return `Listen to ${step.speaker[0].toUpperCase()}${step.speaker.slice(1)}`;
      }
      return "Listen to the response";
    case LessonPhase.Finished:
      return "Lesson complete";
    default:
      return "Get ready";
  }
}
