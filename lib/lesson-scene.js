// @ts-check

import { LessonPhase } from "./lesson-state.js";

/**
 * @typedef {import("./lesson-data.js").LessonStep} LessonStep
 * @typedef {import("./lesson-state.js").LessonState} LessonState
 * @typedef {{ id: string, src: string, alt: string }} SceneAsset
 * @typedef {{ text: string, tone: string, isActive: boolean }} SpeechBubble
 * @typedef {{
 *   backgroundAsset: SceneAsset,
 *   peppaAsset: SceneAsset,
 *   pollyAsset: SceneAsset,
 *   activeSpeaker: "peppa" | "polly" | "child" | null,
 *   peppaBubble: SpeechBubble,
 *   pollyBubble: SpeechBubble,
 *   statusText: string
 * }} LessonScenePresentation
 */

export const LESSON_SCENE_ASSETS = {
  backgrounds: {
    meadowDay: {
      id: "meadow_day",
      src: "/assets/backgrounds/meadow-day.webp",
      alt: "Sunny meadow lesson background",
    },
    meadowEvening: {
      id: "meadow_evening",
      src: "/assets/backgrounds/meadow-evening.webp",
      alt: "Evening meadow lesson background",
    },
    reward: {
      id: "reward_bg",
      src: "/assets/backgrounds/reward-bg.webp",
      alt: "Celebration meadow reward background",
    },
  },
  peppa: {
    wave: {
      id: "peppa_wave",
      src: "/assets/peppa/peppa-wave.webp",
      alt: "Peppa waving",
    },
    talk: {
      id: "peppa_talk",
      src: "/assets/peppa/peppa-talk.webp",
      alt: "Peppa speaking",
    },
    listen: {
      id: "peppa_listen",
      src: "/assets/peppa/peppa-listen.webp",
      alt: "Peppa listening",
    },
    clap: {
      id: "peppa_clap",
      src: "/assets/peppa/peppa-clap.webp",
      alt: "Peppa clapping",
    },
  },
  polly: {
    idle: {
      id: "polly_idle",
      src: "/assets/dolly/dolly-idle.webp",
      alt: "Polly waiting",
    },
    talk: {
      id: "polly_talk",
      src: "/assets/dolly/dolly-idle.webp",
      alt: "Polly speaking",
    },
    laugh: {
      id: "polly_laugh",
      src: "/assets/dolly/dolly-idle.webp",
      alt: "Polly celebrating",
    },
    flap: {
      id: "polly_flap",
      src: "/assets/dolly/dolly-idle.webp",
      alt: "Polly flapping",
    },
  },
};

/**
 * @param {LessonState} state
 * @returns {SceneAsset}
 */
function getBackgroundAsset(state) {
  if (state.phase === LessonPhase.Finished) {
    return LESSON_SCENE_ASSETS.backgrounds.reward;
  }

  if (state.stepIndex >= 3) {
    return LESSON_SCENE_ASSETS.backgrounds.meadowEvening;
  }

  return LESSON_SCENE_ASSETS.backgrounds.meadowDay;
}

/**
 * @param {LessonState} state
 * @param {LessonStep} step
 * @returns {LessonScenePresentation}
 */
function createSceneBase(state, step) {
  return {
    backgroundAsset: getBackgroundAsset(state),
    peppaAsset: LESSON_SCENE_ASSETS.peppa.wave,
    pollyAsset: LESSON_SCENE_ASSETS.polly.idle,
    activeSpeaker: null,
    peppaBubble: {
      text: step.exampleLine,
      tone: "example",
      isActive: false,
    },
    pollyBubble: {
      text: step.parrotPromptZh,
      tone: "coach",
      isActive: false,
    },
    statusText: step.tipZh,
  };
}

/**
 * @param {LessonState} state
 * @param {LessonStep} step
 * @returns {LessonScenePresentation}
 */
export function getLessonScenePresentation(state, step) {
  const scene = createSceneBase(state, step);

  switch (state.phase) {
    case LessonPhase.ExampleSpeaking:
      return {
        ...scene,
        peppaAsset: LESSON_SCENE_ASSETS.peppa.talk,
        activeSpeaker: "peppa",
        peppaBubble: {
          ...scene.peppaBubble,
          isActive: true,
        },
        statusText: "听佩奇说",
      };
    case LessonPhase.ParrotCoaching:
      return {
        ...scene,
        peppaAsset: LESSON_SCENE_ASSETS.peppa.listen,
        pollyAsset: LESSON_SCENE_ASSETS.polly.talk,
        activeSpeaker: "polly",
        pollyBubble: {
          ...scene.pollyBubble,
          isActive: true,
        },
        statusText: "多莉告诉你怎么说",
      };
    case LessonPhase.Listening:
      return {
        ...scene,
        peppaAsset: LESSON_SCENE_ASSETS.peppa.listen,
        pollyAsset: LESSON_SCENE_ASSETS.polly.flap,
        activeSpeaker: "child",
        pollyBubble: {
          text: `轮到你：${step.childTarget}`,
          tone: "listen",
          isActive: true,
        },
        statusText: "麦克风正在听，请开口说",
      };
    case LessonPhase.Evaluating:
      return {
        ...scene,
        peppaAsset: LESSON_SCENE_ASSETS.peppa.listen,
        pollyAsset: LESSON_SCENE_ASSETS.polly.flap,
        activeSpeaker: "child",
        pollyBubble: {
          text: "我来听一听...",
          tone: "listen",
          isActive: true,
        },
        statusText: "正在检查发音",
      };
    case LessonPhase.Feedback:
      return {
        ...scene,
        peppaAsset:
          state.lastOutcome === "retry"
            ? LESSON_SCENE_ASSETS.peppa.listen
            : LESSON_SCENE_ASSETS.peppa.clap,
        pollyAsset:
          state.lastOutcome === "retry"
            ? LESSON_SCENE_ASSETS.polly.talk
            : LESSON_SCENE_ASSETS.polly.laugh,
        activeSpeaker: "polly",
        pollyBubble: {
          text: state.feedback || step.tipZh,
          tone: "feedback",
          isActive: true,
        },
        statusText: state.transcript ? `我听到：${state.transcript}` : step.tipZh,
      };
    case LessonPhase.Error:
      return {
        ...scene,
        peppaAsset: LESSON_SCENE_ASSETS.peppa.listen,
        pollyAsset: LESSON_SCENE_ASSETS.polly.talk,
        activeSpeaker: "polly",
        pollyBubble: {
          text: state.feedback || step.tipZh,
          tone: "feedback",
          isActive: true,
        },
        statusText: state.feedback || "需要再试一次",
      };
    case LessonPhase.Finished:
      return {
        ...scene,
        peppaAsset: LESSON_SCENE_ASSETS.peppa.clap,
        pollyAsset: LESSON_SCENE_ASSETS.polly.laugh,
        activeSpeaker: "polly",
        pollyBubble: {
          text: "太棒啦，今天练习完成。",
          tone: "finished",
          isActive: true,
        },
        statusText: step.tipZh,
      };
    case LessonPhase.Idle:
    default:
      return {
        ...scene,
      };
  }
}
