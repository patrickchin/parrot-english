// @ts-check

import { LESSON_SCENE_ASSETS } from "./lesson-scene.js";
import { DirectorPacketPhase } from "./director-packet-state.js";

const BACKGROUNDS = {
  meadowDay: LESSON_SCENE_ASSETS.backgrounds.meadowDay,
  meadowEvening: LESSON_SCENE_ASSETS.backgrounds.meadowEvening,
  reward: LESSON_SCENE_ASSETS.backgrounds.reward,
};

const POSES = {
  peppa: LESSON_SCENE_ASSETS.peppa,
  polly: LESSON_SCENE_ASSETS.polly,
};

function findScene(lesson, sceneId) {
  return lesson.scenes.find((scene) => scene.id === sceneId) ?? lesson.scenes[0];
}

function createBubble(text = "", tone = "coach", isActive = false) {
  return { text, tone, isActive };
}

export function getDirectorPacketScenePresentation(lesson, state) {
  const sceneDefinition = findScene(lesson, state.currentSceneId);
  const packet = state.packet;
  const activeTurn =
    state.phase === DirectorPacketPhase.PlayingTurn
      ? packet?.turns[state.activeTurnIndex] ?? null
      : null;
  const peppaPose =
    activeTurn?.speaker === "peppa"
      ? activeTurn.pose
      : packet?.characters?.peppa?.pose ?? "wave";
  const pollyPose =
    activeTurn?.speaker === "polly"
      ? activeTurn.pose
      : packet?.characters?.polly?.pose ?? "idle";
  const background = packet?.background ?? sceneDefinition.backgroundPreference;

  const presentation = {
    backgroundAsset: BACKGROUNDS[background] ?? LESSON_SCENE_ASSETS.backgrounds.meadowDay,
    peppaAsset: POSES.peppa[peppaPose] ?? LESSON_SCENE_ASSETS.peppa.wave,
    pollyAsset: POSES.polly[pollyPose] ?? LESSON_SCENE_ASSETS.polly.idle,
    activeSpeaker: activeTurn?.speaker ?? null,
    peppaBubble: createBubble(sceneDefinition.sceneLine.text, "example", false),
    pollyBubble: createBubble(sceneDefinition.tutorCueZh, "coach", false),
    statusText: sceneDefinition.goal,
  };

  if (state.phase === DirectorPacketPhase.Listening) {
    return {
      ...presentation,
      activeSpeaker: "child",
      peppaAsset: LESSON_SCENE_ASSETS.peppa.listen,
      pollyAsset: LESSON_SCENE_ASSETS.polly.flap,
      pollyBubble: createBubble(state.activePrompt?.displayText ?? "", "listen", true),
      statusText: "麦克风正在听，请开口说",
    };
  }

  if (state.phase === DirectorPacketPhase.Finished) {
    return {
      ...presentation,
      backgroundAsset: LESSON_SCENE_ASSETS.backgrounds.reward,
      peppaAsset: LESSON_SCENE_ASSETS.peppa.clap,
      pollyAsset: LESSON_SCENE_ASSETS.polly.laugh,
      activeSpeaker: "polly",
      pollyBubble: createBubble("太棒啦，今天练习完成。", "finished", true),
    };
  }

  if (activeTurn) {
    const bubble = createBubble(activeTurn.visibleText, activeTurn.purpose, true);
    if (activeTurn.speaker === "peppa") {
      return { ...presentation, activeSpeaker: "peppa", peppaBubble: bubble };
    }
    return { ...presentation, activeSpeaker: "polly", pollyBubble: bubble };
  }

  return presentation;
}
