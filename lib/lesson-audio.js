// @ts-check

import { LessonPhase } from "./lesson-state.js";
import { findStaticAudioLineByText, getStaticAudioLine } from "./static-audio.js";

const COACHING_HANDOFF_PAUSE_MS = 350;

/**
 * @typedef {import("./lesson-data.js").LessonStep} LessonStep
 * @typedef {import("./lesson-state.js").LessonState} LessonState
 * @typedef {{ type: "EXAMPLE_DONE" } | { type: "COACH_DONE" } | { type: "RETRY" } | { type: "NEXT" }} AudioCompletionEvent
 * @typedef {{ audioId: string, audioSrc: string, lang: string, pauseAfterMs?: number, style?: "character", text: string }} LessonAudioLine
 */

/**
 * @param {string} id
 * @returns {LessonAudioLine}
 */
function createAssetLine(id) {
  const audio = getStaticAudioLine(id);

  return {
    audioId: audio.id,
    audioSrc: audio.src,
    lang: audio.lang,
    ...(audio.style ? { style: audio.style } : {}),
    text: audio.text,
  };
}

/**
 * @param {LessonState} state
 * @param {LessonStep} step
 * @returns {LessonAudioLine[]}
 */
export function getLessonAudioSequence(state, step) {
  if (state.phase === LessonPhase.ExampleSpeaking) {
    return [createAssetLine(step.audio.example)];
  }

  if (state.phase === LessonPhase.ParrotCoaching) {
    return [
      {
        ...createAssetLine(step.audio.prompt),
        pauseAfterMs: COACHING_HANDOFF_PAUSE_MS,
      },
      createAssetLine(step.audio.model),
    ];
  }

  if (state.phase === LessonPhase.Feedback) {
    const feedbackText = state.feedback || step.tipZh;
    const audioId = findStaticAudioLineByText(feedbackText);

    if (!audioId) {
      throw new Error(`Missing static feedback audio: ${feedbackText}`);
    }

    return [createAssetLine(audioId)];
  }

  if (state.phase === LessonPhase.Finished) {
    return [createAssetLine("finished")];
  }

  return [];
}

/**
 * @param {LessonState} state
 * @returns {AudioCompletionEvent | null}
 */
export function getLessonAudioCompletionEvent(state) {
  if (state.phase === LessonPhase.ExampleSpeaking) return { type: "EXAMPLE_DONE" };
  if (state.phase === LessonPhase.ParrotCoaching) return { type: "COACH_DONE" };
  if (state.phase !== LessonPhase.Feedback) return null;
  if (state.lastOutcome === "retry") return { type: "RETRY" };
  if (state.lastOutcome === "advance" && state.lastPassed) return { type: "NEXT" };
  return null;
}

/**
 * @param {LessonState} state
 * @param {LessonStep} step
 * @returns {LessonAudioLine | null}
 */
export function getLessonAudioLine(state, step) {
  return getLessonAudioSequence(state, step)[0] ?? null;
}
