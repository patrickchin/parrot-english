import { LessonPhase } from "./lesson-state.js";
import { findStaticAudioLineByText, getStaticAudioLine } from "./static-audio.js";

function createAssetLine(id, character, slow = false) {
  const audio = getStaticAudioLine(id);

  return {
    audioId: audio.id,
    audioSrc: audio.src,
    character,
    engine: "asset",
    lang: audio.lang,
    slow,
    ...(audio.style ? { style: audio.style } : {}),
    text: audio.text,
  };
}

export function getLessonAudioSequence(state, step) {
  if (state.phase === LessonPhase.ExampleSpeaking) {
    return [createAssetLine(`example-${step.id}`, "peppa")];
  }

  if (state.phase === LessonPhase.ParrotCoaching) {
    return [createAssetLine(`turn-${step.id}`, "polly")];
  }

  if (state.phase === LessonPhase.Feedback) {
    const feedbackText = state.feedback || step.tipZh;
    const audioId = findStaticAudioLineByText(feedbackText);

    if (!audioId) {
      throw new Error(`Missing static feedback audio: ${feedbackText}`);
    }

    return [createAssetLine(audioId, "polly")];
  }

  if (state.phase === LessonPhase.Finished) {
    return [createAssetLine("finished", "polly")];
  }

  return [];
}

export function getLessonAudioCompletionEvent(state) {
  if (state.phase === LessonPhase.ExampleSpeaking) return { type: "EXAMPLE_DONE" };
  if (state.phase === LessonPhase.ParrotCoaching) return { type: "COACH_DONE" };
  if (state.phase !== LessonPhase.Feedback) return null;
  return { type: state.lastOutcome === "retry" ? "RETRY" : "NEXT" };
}

export function getLessonAudioLine(state, step) {
  return getLessonAudioSequence(state, step)[0] ?? null;
}
