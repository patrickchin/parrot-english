// @ts-check

import { LESSON_SCENE_ASSETS } from "./lesson-scene.js";
import { DirectorPacketPhase } from "./director-packet-state.js";

/**
 * @typedef {{ id: string, src: string, alt: string }} SceneAsset
 * @typedef {{ speaker: string, text: string, lang: string }} DirectorLine
 * @typedef {{ id: string, titleZh: string, backgroundPreference: string, goal: string, sceneLine: DirectorLine, tutorCueZh: string, modelLine: DirectorLine, childTarget: string }} DirectorSceneDefinition
 * @typedef {{ scenes: DirectorSceneDefinition[] }} DirectorLesson
 * @typedef {{ shouldListen: boolean, targetText: string, displayText: string, recordingSeconds: number }} DirectorChildPrompt
 * @typedef {{ turnId: string, speaker: string, purpose: string, visibleText: string, pose: string }} DirectorPacketTurn
 * @typedef {{ packetId: string, sceneId: string, background: string, characters: Record<string, { pose: string }>, turns: DirectorPacketTurn[], childPrompt: DirectorChildPrompt }} DirectorPacket
 * @typedef {{ phase: string, currentSceneId: string, packet: DirectorPacket | null, activeTurnIndex: number, activePrompt: DirectorChildPrompt | null }} DirectorPacketState
 * @typedef {{ text: string, tone: string, isActive: boolean }} DirectorBubble
 */

/** @type {Record<string, SceneAsset>} */
const BACKGROUNDS = {
  meadowDay: LESSON_SCENE_ASSETS.backgrounds.meadowDay,
  meadowEvening: LESSON_SCENE_ASSETS.backgrounds.meadowEvening,
  reward: LESSON_SCENE_ASSETS.backgrounds.reward,
};

/** @type {Record<string, Record<string, SceneAsset>>} */
const POSES = {
  peppa: LESSON_SCENE_ASSETS.peppa,
  polly: LESSON_SCENE_ASSETS.polly,
};

/**
 * @param {DirectorLesson} lesson
 * @param {string} sceneId
 * @returns {DirectorSceneDefinition}
 */
function findScene(lesson, sceneId) {
  return lesson.scenes.find((scene) => scene.id === sceneId) ?? lesson.scenes[0];
}

/**
 * @param {string} [text]
 * @param {string} [tone]
 * @param {boolean} [isActive]
 * @returns {DirectorBubble}
 */
function createBubble(text = "", tone = "coach", isActive = false) {
  return { text, tone, isActive };
}

/**
 * @param {DirectorLesson} lesson
 * @param {DirectorPacketState} state
 */
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
