// @ts-check

import { LessonPhase, getCurrentStep } from "./lesson-state.js";
import { getStaticAudioLineForSpeech } from "./static-audio.js";

/**
 * @typedef {import("./lesson-state.js").LessonState} LessonState
 * @typedef {import("./lesson-state.js").RunnableLesson} RunnableLesson
 * @typedef {{ audioId: string, audioSrc: string, lang: string, speaker: string, text: string }} LessonAudioLine
 */

/**
 * @param {string} speaker
 * @param {string} text
 * @returns {LessonAudioLine}
 */
function createAssetLine(speaker, text) {
  const audio = getStaticAudioLineForSpeech(speaker, text);
  return {
    audioId: audio.id,
    audioSrc: audio.src,
    lang: audio.lang,
    speaker: audio.speaker,
    text: audio.text,
  };
}

/**
 * @param {LessonState} state
 * @param {RunnableLesson} lesson
 * @returns {LessonAudioLine | null}
 */
export function getLessonAudioLine(state, lesson) {
  if (state.phase === LessonPhase.Speaking) {
    const step = getCurrentStep(state, lesson);
    if (!step || step.speaker === "user") return null;
    return createAssetLine(step.speaker, step.dialogue);
  }

  if (state.phase === LessonPhase.Feedback && state.feedback) {
    return createAssetLine("narrator", state.feedback);
  }

  return null;
}
