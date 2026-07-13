// @ts-check

export const LessonPhase = {
  Idle: "idle",
  Paused: "paused",
  Speaking: "speaking",
  WaitingForUser: "waiting-for-user",
  Recording: "recording",
  Evaluating: "evaluating",
  Responding: "responding",
  Finished: "finished",
};

/**
 * @typedef {(typeof LessonPhase)[keyof typeof LessonPhase]} LessonPhaseValue
 * @typedef {"correct" | "incorrect" | "incorrectFinal" | "noInput" | "noInputFinal" | null} ResponseOutcome
 * @typedef {object} LessonState
 * @property {LessonPhaseValue} phase
 * @property {number} sceneIndex
 * @property {number} stepIndex
 * @property {number} attemptCount
 * @property {import("./lesson-data.js").LessonResponse | null} response
 * @property {string} transcript
 * @property {ResponseOutcome} responseOutcome
 * @typedef {
 *   | { type: "PLAY_SCENE" }
 *   | { type: "PAUSE_SCENE" }
 *   | { type: "SCENE_PREVIOUS" }
 *   | { type: "SCENE_NEXT" }
 *   | { type: "REPLAY_LESSON" }
 *   | { type: "SELECT_SCENE", sceneIndex: number }
 *   | { type: "LINE_DONE" }
 *   | { type: "MIC_STARTED" }
 *   | { type: "MIC_RELEASED" }
 *   | { type: "RECORDING_CANCELLED" }
 *   | { type: "EVALUATED", outcome: import("./lesson-data.js").SpeechCheckOutcome, transcript: string }
 *   | { type: "EVALUATION_FAILED" }
 *   | { type: "RESPONSE_DONE" }
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
    response: null,
    transcript: "",
    responseOutcome: null,
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
      response: null,
      transcript: "",
      responseOutcome: null,
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
      response: null,
      transcript: "",
      responseOutcome: null,
    };
  }

  return {
    ...state,
    phase: LessonPhase.Finished,
    attemptCount: 0,
    response: null,
    responseOutcome: null,
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
    case "SELECT_SCENE":
      return Number.isInteger(event.sceneIndex) &&
        event.sceneIndex >= 0 &&
        event.sceneIndex < lesson.scenes.length
        ? { ...createInitialLessonState(), sceneIndex: event.sceneIndex }
        : state;
    case "LINE_DONE":
      if (state.phase !== LessonPhase.Speaking) return state;
      return advanceScriptPosition(state, lesson, false);
    case "MIC_STARTED":
      return state.phase === LessonPhase.WaitingForUser
        ? { ...state, phase: LessonPhase.Recording, response: null }
        : state;
    case "MIC_RELEASED": {
      if (state.phase !== LessonPhase.Recording) return state;
      const step = getCurrentStep(state, lesson);
      return step?.speaker === "user" && step.check
        ? { ...state, phase: LessonPhase.Evaluating }
        : advanceScriptPosition(state, lesson, true);
    }
    case "RECORDING_CANCELLED":
      return state.phase === LessonPhase.Recording
        ? { ...state, phase: LessonPhase.WaitingForUser }
        : state;
    case "EVALUATED": {
      if (state.phase !== LessonPhase.Evaluating) return state;
      const check = getCurrentStep(state, lesson)?.check;
      if (!check) return state;
      const isCorrect = event.outcome === "correct";
      const attemptCount = isCorrect
        ? state.attemptCount
        : state.attemptCount + 1;
      const isFinal = !isCorrect && attemptCount >= check.maxAttempts;
      const response =
        event.outcome === "correct"
          ? check.correct
          : event.outcome === "noInput"
            ? isFinal
              ? check.noInputFinal ?? check.incorrectFinal
              : check.noInput ?? check.incorrect
            : isFinal
              ? check.incorrectFinal
              : check.incorrect;
      /** @type {ResponseOutcome} */
      const responseOutcome =
        event.outcome === "correct"
          ? "correct"
          : isFinal
            ? event.outcome === "noInput"
              ? "noInputFinal"
              : "incorrectFinal"
            : event.outcome;

      return {
        ...state,
        phase: LessonPhase.Responding,
        attemptCount,
        response,
        transcript: event.transcript,
        responseOutcome,
      };
    }
    case "EVALUATION_FAILED":
      if (state.phase !== LessonPhase.Evaluating) return state;
      return {
        ...state,
        phase: LessonPhase.WaitingForUser,
        response: null,
        transcript: "",
        responseOutcome: null,
      };
    case "RESPONSE_DONE":
      if (state.phase !== LessonPhase.Responding || !state.response) return state;
      if (state.response.after === "retry") {
        const previousStep = getCurrentScene(state, lesson)?.steps[state.stepIndex - 1];
        const replayModel = previousStep && previousStep.speaker !== "user";
        return {
          ...state,
          phase: replayModel ? LessonPhase.Speaking : LessonPhase.WaitingForUser,
          stepIndex: replayModel ? state.stepIndex - 1 : state.stepIndex,
          response: null,
          transcript: "",
          responseOutcome: null,
        };
      }
      return advanceScriptPosition(state, lesson, true);
    case "RESET":
      return createInitialLessonState();
    default:
      return state;
  }
}
