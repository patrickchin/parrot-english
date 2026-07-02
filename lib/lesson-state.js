// @ts-check

export const LessonPhase = {
  Idle: "idle",
  ExampleSpeaking: "example-speaking",
  ParrotCoaching: "parrot-coaching",
  Listening: "listening",
  Evaluating: "evaluating",
  Feedback: "feedback",
  Error: "error",
  Finished: "finished",
};

/**
 * @typedef {(typeof LessonPhase)[keyof typeof LessonPhase]} LessonPhaseValue
 * @typedef {"idle" | "started" | "advance" | "retry" | "error" | "finished"} LessonOutcome
 * @typedef {object} LessonState
 * @property {LessonPhaseValue} phase
 * @property {number} stepIndex
 * @property {number} retryCount
 * @property {string} feedback
 * @property {string} transcript
 * @property {LessonOutcome} lastOutcome
 * @property {boolean} lastPassed
 * @property {Blob | null} pendingAudioBlob
 * @typedef {{ type: "START" } | { type: "PAUSE" } | { type: "EXAMPLE_DONE" } | { type: "COACH_DONE" } | { type: "RECORDING_DONE", audioBlob: Blob } | { type: "EVALUATED", passed: boolean, feedbackText: string, transcript: string } | { type: "SYSTEM_ERROR", feedbackText: string } | { type: "NEXT" } | { type: "RETRY" } | { type: "RESET" } | { type: "SCENE_NEXT" } | { type: "SCENE_PREVIOUS" }} LessonEvent
 */

/** @returns {LessonState} */
export function createInitialLessonState() {
  return {
    phase: LessonPhase.Idle,
    stepIndex: 0,
    retryCount: 0,
    feedback: "",
    transcript: "",
    lastOutcome: "idle",
    lastPassed: false,
    pendingAudioBlob: null,
  };
}

/**
 * @param {LessonState} state
 * @param {LessonEvent} event
 * @param {number} totalSteps
 * @returns {LessonState}
 */
export function reduceLessonState(state, event, totalSteps) {
  switch (event.type) {
    case "START": {
      const stepIndex =
        state.phase === LessonPhase.Finished ? 0 : state.stepIndex;

      return {
        ...state,
        phase: LessonPhase.ExampleSpeaking,
        stepIndex,
        retryCount: 0,
        feedback: "",
        transcript: "",
        lastOutcome: "started",
        lastPassed: false,
        pendingAudioBlob: null,
      };
    }
    case "PAUSE":
      return {
        ...createInitialLessonState(),
        stepIndex: state.stepIndex,
      };
    case "EXAMPLE_DONE":
      return { ...state, phase: LessonPhase.ParrotCoaching };
    case "COACH_DONE":
      return { ...state, phase: LessonPhase.Listening };
    case "RECORDING_DONE":
      return {
        ...state,
        phase: LessonPhase.Evaluating,
        pendingAudioBlob: event.audioBlob,
      };
    case "SYSTEM_ERROR":
      return {
        ...state,
        phase: LessonPhase.Error,
        feedback: event.feedbackText,
        transcript: "",
        lastOutcome: "error",
        lastPassed: false,
        pendingAudioBlob: null,
      };
    case "EVALUATED": {
      const canRetry = !event.passed && state.retryCount < 1;
      if (event.passed || !canRetry) {
        const nextIndex = state.stepIndex + 1;
        const finished = nextIndex >= totalSteps;
        return {
          ...state,
          phase: finished ? LessonPhase.Finished : LessonPhase.Feedback,
          stepIndex: state.stepIndex,
          retryCount: 0,
          feedback: event.feedbackText,
          transcript: event.transcript,
          lastOutcome: finished ? "finished" : "advance",
          lastPassed: event.passed,
          pendingAudioBlob: null,
        };
      }

      return {
        ...state,
        phase: LessonPhase.Feedback,
        retryCount: state.retryCount + 1,
        feedback: event.feedbackText,
        transcript: event.transcript,
        lastOutcome: "retry",
        lastPassed: false,
        pendingAudioBlob: null,
      };
    }
    case "NEXT":
      return {
        ...state,
        phase: LessonPhase.ExampleSpeaking,
        stepIndex: Math.min(state.stepIndex + 1, totalSteps - 1),
        retryCount: 0,
        feedback: "",
        transcript: "",
        lastOutcome: "advance",
        lastPassed: false,
        pendingAudioBlob: null,
      };
    case "RETRY":
      return {
        ...state,
        phase: LessonPhase.ExampleSpeaking,
        feedback: "",
        transcript: "",
        lastOutcome: "retry",
        lastPassed: false,
        pendingAudioBlob: null,
      };
    case "SCENE_NEXT":
      return {
        ...createInitialLessonState(),
        stepIndex: Math.min(state.stepIndex + 1, totalSteps - 1),
      };
    case "SCENE_PREVIOUS":
      return {
        ...createInitialLessonState(),
        stepIndex: Math.max(state.stepIndex - 1, 0),
      };
    case "RESET":
      return createInitialLessonState();
    default:
      return state;
  }
}
