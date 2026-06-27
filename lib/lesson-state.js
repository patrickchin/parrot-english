// @ts-check

export const LessonPhase = {
  Idle: "idle",
  ExampleSpeaking: "example-speaking",
  ParrotCoaching: "parrot-coaching",
  Listening: "listening",
  Evaluating: "evaluating",
  Feedback: "feedback",
  Finished: "finished",
};

/**
 * @typedef {(typeof LessonPhase)[keyof typeof LessonPhase]} LessonPhaseValue
 * @typedef {"idle" | "started" | "advance" | "retry" | "finished"} LessonOutcome
 * @typedef {object} LessonState
 * @property {LessonPhaseValue} phase
 * @property {number} stepIndex
 * @property {number} retryCount
 * @property {string} feedback
 * @property {string} transcript
 * @property {LessonOutcome} lastOutcome
 * @typedef {{ type: "START" } | { type: "EXAMPLE_DONE" } | { type: "COACH_DONE" } | { type: "RECORDING_DONE" } | { type: "EVALUATED", passed: boolean, feedbackText: string, transcript: string } | { type: "EVALUATION_FAILED", feedbackText: string } | { type: "NEXT" } | { type: "RETRY" } | { type: "RESET" } | { type: "SCENE_NEXT" } | { type: "SCENE_PREVIOUS" }} LessonEvent
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
    case "START":
      return {
        ...state,
        phase: LessonPhase.ExampleSpeaking,
        stepIndex: 0,
        retryCount: 0,
        feedback: "",
        transcript: "",
        lastOutcome: "started",
      };
    case "EXAMPLE_DONE":
      return { ...state, phase: LessonPhase.ParrotCoaching };
    case "COACH_DONE":
      return { ...state, phase: LessonPhase.Listening };
    case "RECORDING_DONE":
      return { ...state, phase: LessonPhase.Evaluating };
    case "EVALUATION_FAILED":
      return {
        ...state,
        phase: LessonPhase.Feedback,
        retryCount: Math.max(state.retryCount, 1),
        feedback: event.feedbackText,
        transcript: "",
        lastOutcome: "retry",
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
        };
      }

      return {
        ...state,
        phase: LessonPhase.Feedback,
        retryCount: state.retryCount + 1,
        feedback: event.feedbackText,
        transcript: event.transcript,
        lastOutcome: "retry",
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
      };
    case "RETRY":
      return {
        ...state,
        phase: LessonPhase.ExampleSpeaking,
        feedback: "",
        transcript: "",
        lastOutcome: "retry",
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
