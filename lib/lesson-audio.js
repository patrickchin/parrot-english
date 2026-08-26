// @ts-check

import { LessonPhase, getCurrentStep } from "./lesson-state.js";
import {
  LESSON_JOIN_IN_AUDIO_LINES,
  STATIC_AUDIO_BASE_PATH,
  STATIC_AUDIO_LINES,
  getStaticAudioLineForSpeech,
} from "./static-audio.js";

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
 * @returns {{ speaker: "peppa" | "dolly" | "narrator", text: string } | null}
 */
export function getLessonSpeechLine(state, lesson) {
  if (state.phase === LessonPhase.Speaking) {
    const step = getCurrentStep(state, lesson);
    if (!step || step.speaker === "user") return null;
    return { speaker: step.speaker, text: step.dialogue };
  }

  return null;
}

/**
 * @param {LessonState} state
 * @param {RunnableLesson} lesson
 * @returns {LessonAudioLine | null}
 */
export function getLessonAudioLine(state, lesson) {
  const line = getLessonSpeechLine(state, lesson);
  return line ? createAssetLine(line.speaker, line.text) : null;
}

/**
 * @param {LessonState} state
 * @param {RunnableLesson} lesson
 * @returns {(LessonAudioLine & { volume: number }) | null}
 */
export function getLessonJoinInAudioLine(state, lesson) {
  if (state.phase !== LessonPhase.JoiningIn) return null;

  const step = getCurrentStep(state, lesson);
  if (!step || step.speaker !== "user") return null;

  const cue = LESSON_JOIN_IN_AUDIO_LINES[step.dialogue];
  if (!cue) return null;
  const source = STATIC_AUDIO_LINES[cue.sourceAudioId];
  if (!source) throw new Error(`Missing join-in source audio: ${cue.sourceAudioId}`);

  return {
    audioId: cue.id,
    audioSrc: `${STATIC_AUDIO_BASE_PATH}/${cue.id}.mp3`,
    lang: source.lang,
    speaker: source.speaker,
    text: cue.text,
    volume: 0.28,
  };
}
