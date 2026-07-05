// @ts-check

export const LessonPhase = {
  Idle: "idle",
  Paused: "paused",
  Speaking: "speaking",
  WaitingForUser: "waiting-for-user",
  Recording: "recording",
  Evaluating: "evaluating",
  Feedback: "feedback",
  Finished: "finished",
};

/**
 * @typedef {(typeof LessonPhase)[keyof typeof LessonPhase]} LessonPhaseValue
 * @typedef {"success" | "retry" | "continue" | null} FeedbackOutcome
 * @typedef {object} LessonState
 * @property {LessonPhaseValue} phase
 * @property {number} sceneIndex
 * @property {number} stepIndex
 * @property {number} attemptCount
 * @property {string} feedback
 * @property {string} transcript
 * @property {FeedbackOutcome} feedbackOutcome
 * @typedef {
 *   | { type: "PLAY_SCENE" }
 *   | { type: "PAUSE_SCENE" }
 *   | { type: "SCENE_PREVIOUS" }
 *   | { type: "SCENE_NEXT" }
 *   | { type: "REPLAY_LESSON" }
 *   | { type: "LINE_DONE" }
 *   | { type: "MIC_STARTED" }
 *   | { type: "MIC_RELEASED" }
 *   | { type: "RECORDING_CANCELLED" }
 *   | { type: "EVALUATED", passed: boolean, transcript: string }
 *   | { type: "EVALUATION_FAILED" }
 *   | { type: "FEEDBACK_DONE" }
 *   | { type: "RESET" }
 * } LessonEvent
 * @typedef {import("./lesson-data.js").Lesson} RunnableLesson
 */

/** @returns {LessonState} */
export function createInitialLessonState() {
  return {
    phase: LessonPhase.Idle,
    sceneIndex: 0,
    stepIndex: 0,
    attemptCount: 0,
    feedback: "",
    transcript: "",
    feedbackOutcome: null,
  };
}

/**
 * @param {LessonState} state
 * @param {RunnableLesson} lesson
 */
export function getCurrentScene(state, lesson) {
  return lesson.scenes[state.sceneIndex];
}

/**
 * @param {LessonState} state
 * @param {RunnableLesson} lesson
 */
export function getCurrentStep(state, lesson) {
  return getCurrentScene(state, lesson)?.steps[state.stepIndex];
}

/** @param {{ speaker: string } | undefined} step */
function getStepPhase(step) {
  return step?.speaker === "user"
    ? LessonPhase.WaitingForUser
    : LessonPhase.Speaking;
}

/**
 * @param {LessonState} state
 * @param {RunnableLesson} lesson
 * @param {number} sceneIndex
 * @returns {LessonState}
 */
function startScene(state, lesson, sceneIndex) {
  const firstStep = lesson.scenes[sceneIndex]?.steps[0];
  if (!firstStep) return state;

  return {
    ...createInitialLessonState(),
    phase: getStepPhase(firstStep),
    sceneIndex,
    stepIndex: 0,
  };
}

/**
 * @param {LessonState} state
 * @param {RunnableLesson} lesson
 * @param {boolean} resetAttempt
 * @returns {LessonState}
 */
function advanceScriptPosition(state, lesson, resetAttempt) {
  const scene = getCurrentScene(state, lesson);
  if (!scene) return { ...state, phase: LessonPhase.Finished };

  const nextStepIndex = state.stepIndex + 1;
  if (nextStepIndex < scene.steps.length) {
    const nextStep = scene.steps[nextStepIndex];
    return {
      ...state,
      phase: getStepPhase(nextStep),
      stepIndex: nextStepIndex,
      attemptCount: resetAttempt ? 0 : state.attemptCount,
      feedback: "",
      transcript: "",
      feedbackOutcome: null,
    };
  }

  const nextSceneIndex = state.sceneIndex + 1;
  if (nextSceneIndex < lesson.scenes.length) {
    const nextStep = lesson.scenes[nextSceneIndex].steps[0];
    return {
      ...state,
      phase: getStepPhase(nextStep),
      sceneIndex: nextSceneIndex,
      stepIndex: 0,
      attemptCount: resetAttempt ? 0 : state.attemptCount,
      feedback: "",
      transcript: "",
      feedbackOutcome: null,
    };
  }

  return {
    ...state,
    phase: LessonPhase.Finished,
    attemptCount: 0,
    feedback: "",
    feedbackOutcome: null,
  };
}

/**
 * @param {LessonState} state
 * @param {LessonEvent} event
 * @param {RunnableLesson} lesson
 * @returns {LessonState}
 */
export function reduceLessonState(state, event, lesson) {
  switch (event.type) {
    case "PLAY_SCENE":
      return startScene(state, lesson, state.sceneIndex);
    case "PAUSE_SCENE":
      return {
        ...createInitialLessonState(),
        phase: LessonPhase.Paused,
        sceneIndex: state.sceneIndex,
      };
    case "SCENE_PREVIOUS":
      return state.sceneIndex <= 0
        ? state
        : startScene(state, lesson, state.sceneIndex - 1);
    case "SCENE_NEXT":
      return state.sceneIndex >= lesson.scenes.length - 1
        ? state
        : startScene(state, lesson, state.sceneIndex + 1);
    case "REPLAY_LESSON":
      return startScene(state, lesson, 0);
    case "LINE_DONE":
      if (state.phase !== LessonPhase.Speaking) return state;
      return advanceScriptPosition(state, lesson, false);
    case "MIC_STARTED":
      return state.phase === LessonPhase.WaitingForUser
        ? { ...state, phase: LessonPhase.Recording, feedback: "" }
        : state;
    case "MIC_RELEASED":
      return state.phase === LessonPhase.Recording
        ? { ...state, phase: LessonPhase.Evaluating }
        : state;
    case "RECORDING_CANCELLED":
      return state.phase === LessonPhase.Recording
        ? { ...state, phase: LessonPhase.WaitingForUser }
        : state;
    case "EVALUATED":
      if (state.phase !== LessonPhase.Evaluating) return state;
      if (event.passed) {
        return {
          ...state,
          phase: LessonPhase.Feedback,
          feedback: "Great job!",
          transcript: event.transcript,
          feedbackOutcome: "success",
        };
      }
      if (state.attemptCount < 1) {
        return {
          ...state,
          phase: LessonPhase.Feedback,
          attemptCount: 1,
          feedback: `Almost! Try again, ${lesson.childName}.`,
          transcript: event.transcript,
          feedbackOutcome: "retry",
        };
      }
      return {
        ...state,
        phase: LessonPhase.Feedback,
        feedback: "Almost! Let's keep going.",
        transcript: event.transcript,
        feedbackOutcome: "continue",
      };
    case "EVALUATION_FAILED":
      if (state.phase !== LessonPhase.Evaluating) return state;
      if (state.attemptCount < 1) {
        return {
          ...state,
          phase: LessonPhase.Feedback,
          attemptCount: 1,
          feedback: `I couldn't hear that. Try again, ${lesson.childName}.`,
          transcript: "",
          feedbackOutcome: "retry",
        };
      }
      return {
        ...state,
        phase: LessonPhase.Feedback,
        feedback: "I couldn't hear that. Let's keep going.",
        transcript: "",
        feedbackOutcome: "continue",
      };
    case "FEEDBACK_DONE":
      if (state.phase !== LessonPhase.Feedback) return state;
      if (state.feedbackOutcome === "retry") {
        return {
          ...state,
          phase: LessonPhase.Speaking,
          stepIndex: Math.max(0, state.stepIndex - 1),
          feedback: "",
          transcript: "",
          feedbackOutcome: null,
        };
      }
      return advanceScriptPosition(state, lesson, true);
    case "RESET":
      return createInitialLessonState();
    default:
      return state;
  }
}
