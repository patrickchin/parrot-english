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
  if (state.phase === LessonPhase.HostSpeaking) {
    return [
      createAssetLine("instruction-peppa", "coach"),
      createAssetLine(`host-${step.id}`, "peppa"),
    ];
  }

  if (state.phase === LessonPhase.ParrotSpeaking) {
    return [
      createAssetLine("instruction-polly", "coach"),
      createAssetLine(`parrot-${step.id}`, "polly", state.retryCount > 0),
      createAssetLine(`turn-${step.id}`, "coach"),
    ];
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
  if (state.phase === LessonPhase.HostSpeaking) return { type: "HOST_DONE" };
  if (state.phase === LessonPhase.ParrotSpeaking) return { type: "PARROT_DONE" };
  if (state.phase !== LessonPhase.Feedback) return null;
  return { type: state.lastOutcome === "retry" ? "RETRY" : "NEXT" };
}

export function getLessonAudioLine(state, step) {
  return getLessonAudioSequence(state, step)[0] ?? null;
}
