import { LessonPhase } from "./lesson-state.js";

export const LESSON_SCENE_ASSETS = {
  backgrounds: {
    meadowDay: {
      id: "meadow_day",
      src: "/assets/backgrounds/episode-garden.png",
      futureSrc: "/assets/backgrounds/meadow_day.png",
      alt: "Sunny meadow lesson background",
    },
  },
  peppa: {
    wave: {
      id: "peppa_wave",
      src: "/assets/characters/pig-host.png",
      futureSrc: "/assets/peppa/peppa_wave.png",
      alt: "Peppa waving",
    },
    talk: {
      id: "peppa_talk",
      src: "/assets/characters/pig-host.png",
      futureSrc: "/assets/peppa/peppa_talk.png",
      alt: "Peppa speaking",
    },
    listen: {
      id: "peppa_listen",
      src: "/assets/characters/pig-host.png",
      futureSrc: "/assets/peppa/peppa_listen.png",
      alt: "Peppa listening",
    },
    clap: {
      id: "peppa_clap",
      src: "/assets/characters/pig-host.png",
      futureSrc: "/assets/peppa/peppa_clap.png",
      alt: "Peppa clapping",
    },
  },
  polly: {
    idle: {
      id: "polly_idle",
      src: "/assets/characters/parrot-coach.png",
      futureSrc: "/assets/polly/polly_idle.png",
      alt: "Polly waiting",
    },
    talk: {
      id: "polly_talk",
      src: "/assets/characters/parrot-coach.png",
      futureSrc: "/assets/polly/polly_talk.png",
      alt: "Polly speaking",
    },
    laugh: {
      id: "polly_laugh",
      src: "/assets/characters/parrot-coach.png",
      futureSrc: "/assets/polly/polly_laugh.png",
      alt: "Polly celebrating",
    },
    flap: {
      id: "polly_flap",
      src: "/assets/characters/parrot-coach.png",
      futureSrc: "/assets/polly/polly_flap.png",
      alt: "Polly flapping",
    },
  },
};

const baseScene = {
  backgroundAsset: LESSON_SCENE_ASSETS.backgrounds.meadowDay,
  peppaAsset: LESSON_SCENE_ASSETS.peppa.wave,
  pollyAsset: LESSON_SCENE_ASSETS.polly.idle,
  activeSpeaker: null,
  sparkle: false,
};

function createSceneBase(step) {
  return {
    ...baseScene,
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

export function getLessonScenePresentation(state, step) {
  const scene = createSceneBase(step);

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
        sparkle: true,
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
        sparkle: true,
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
        sparkle: state.lastOutcome !== "retry",
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
        sparkle: true,
      };
    case LessonPhase.Idle:
    default:
      return {
        ...scene,
      };
  }
}
