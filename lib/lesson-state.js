export const LessonPhase = {
  Idle: "idle",
  HostSpeaking: "host-speaking",
  ParrotSpeaking: "parrot-speaking",
  Listening: "listening",
  Evaluating: "evaluating",
  Feedback: "feedback",
  Finished: "finished",
};

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

export function reduceLessonState(state, event, totalSteps) {
  switch (event.type) {
    case "START":
      return {
        ...state,
        phase: LessonPhase.HostSpeaking,
        stepIndex: 0,
        retryCount: 0,
        feedback: "",
        transcript: "",
        lastOutcome: "started",
      };
    case "HOST_DONE":
      return { ...state, phase: LessonPhase.ParrotSpeaking };
    case "PARROT_DONE":
      return { ...state, phase: LessonPhase.Listening };
    case "RECORDING_DONE":
      return { ...state, phase: LessonPhase.Evaluating };
    case "EVALUATED": {
      const canRetry = !event.passed && state.retryCount < 1;
      if (event.passed || !canRetry) {
        const nextIndex = state.stepIndex + 1;
        const finished = nextIndex >= totalSteps;
        return {
          ...state,
          phase: finished ? LessonPhase.Finished : LessonPhase.Feedback,
          stepIndex: finished ? state.stepIndex : nextIndex,
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
        phase: LessonPhase.HostSpeaking,
        feedback: "",
        transcript: "",
        lastOutcome: "advance",
      };
    case "RETRY":
      return {
        ...state,
        phase: LessonPhase.ParrotSpeaking,
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
