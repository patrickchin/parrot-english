// @ts-check

export const LessonPhase = {
  Idle: "idle",
  JoiningIn: "joining-in",
  Paused: "paused",
  Speaking: "speaking",
  Finished: "finished",
};

/**
 * @typedef {(typeof LessonPhase)[keyof typeof LessonPhase]} LessonPhaseValue
 * @typedef {object} LessonState
 * @property {LessonPhaseValue} phase
 * @property {number} sceneIndex
 * @property {number} stepIndex
 * @property {"speaking" | "joining-in" | null} resumePhase
 * @typedef {
 *   | { type: "PLAY_SCENE" }
 *   | { type: "PAUSE_SCENE" }
 *   | { type: "SCENE_PREVIOUS" }
 *   | { type: "SCENE_NEXT" }
 *   | { type: "REPLAY_LESSON" }
 *   | { type: "SELECT_SCENE", sceneIndex: number }
 *   | { type: "LINE_DONE" }
 *   | { type: "JOIN_IN_DONE" }
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
    resumePhase: null,
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
    ? LessonPhase.JoiningIn
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
  };
}

/**
 * @param {LessonState} state
 * @param {RunnableLesson} lesson
 * @returns {LessonState}
 */
function advanceScriptPosition(state, lesson) {
  const scene = getCurrentScene(state, lesson);
  if (!scene) return { ...state, phase: LessonPhase.Finished, resumePhase: null };

  const nextStepIndex = state.stepIndex + 1;
  if (nextStepIndex < scene.steps.length) {
    return {
      ...state,
      phase: getStepPhase(scene.steps[nextStepIndex]),
      stepIndex: nextStepIndex,
      resumePhase: null,
    };
  }

  const nextSceneIndex = state.sceneIndex + 1;
  if (nextSceneIndex < lesson.scenes.length) {
    return {
      ...state,
      phase: getStepPhase(lesson.scenes[nextSceneIndex].steps[0]),
      sceneIndex: nextSceneIndex,
      stepIndex: 0,
      resumePhase: null,
    };
  }

  return { ...state, phase: LessonPhase.Finished, resumePhase: null };
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
      return state.phase === LessonPhase.Paused && state.resumePhase
        ? { ...state, phase: state.resumePhase, resumePhase: null }
        : startScene(state, lesson, state.sceneIndex);
    case "PAUSE_SCENE":
      if (
        state.phase !== LessonPhase.Speaking &&
        state.phase !== LessonPhase.JoiningIn
      ) {
        return state;
      }
      return {
        ...state,
        phase: LessonPhase.Paused,
        resumePhase:
          state.phase === LessonPhase.Speaking ? "speaking" : "joining-in",
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
      return state.phase === LessonPhase.Speaking
        ? advanceScriptPosition(state, lesson)
        : state;
    case "JOIN_IN_DONE":
      return state.phase === LessonPhase.JoiningIn
        ? advanceScriptPosition(state, lesson)
        : state;
    case "RESET":
      return createInitialLessonState();
    default:
      return state;
  }
}
