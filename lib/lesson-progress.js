// @ts-check

import { LessonPhase } from "./lesson-state.js";

/** @param {import("./lesson-state.js").LessonState} state */
export function getLessonProgressLabel(state) {
  switch (state.phase) {
    case LessonPhase.Idle:
      return "按开始";
    case LessonPhase.ExampleSpeaking:
      return "听佩奇说";
    case LessonPhase.ParrotCoaching:
      return "多莉告诉你怎么说";
    case LessonPhase.Listening:
      return "麦克风正在听，请说";
    case LessonPhase.Evaluating:
      return "正在检查发音";
    case LessonPhase.Feedback:
      return state.lastOutcome === "retry" ? "准备再试一次" : "准备下一句";
    case LessonPhase.Error:
      return "需要再试一次";
    case LessonPhase.Finished:
      return "今天练习完成";
    default:
      return "准备下一句";
  }
}
