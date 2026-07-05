// @ts-check

import { LessonPhase, getCurrentScene, getCurrentStep } from "./lesson-state.js";

/**
 * @typedef {import("./lesson-data.js").VisualCatalog} VisualCatalog
 * @typedef {import("./lesson-data.js").Lesson} Lesson
 * @typedef {import("./lesson-state.js").LessonState} LessonState
 */

/**
 * @param {LessonState} state
 * @param {Lesson} lesson
 * @param {VisualCatalog} catalog
 */
export function getLessonScenePresentation(state, lesson, catalog) {
  const scene = getCurrentScene(state, lesson);
  const step = getCurrentStep(state, lesson);
  if (!scene || !step) throw new Error("Lesson position is outside the script.");

  const background = catalog.backgrounds.get(scene.background);
  if (!background) throw new Error(`Unknown background: ${scene.background}`);

  const characters = scene.characters.filter((id) => id !== "user").map((id) => {
    const definition = catalog.characters.get(id);
    if (!definition) throw new Error(`Unknown character: ${id}`);
    const emote = step.emotes[id];
    const asset = definition.assets[emote];
    if (!asset) throw new Error(`Missing ${id} asset for emote: ${emote}`);

    return {
      id,
      name: definition.name,
      asset,
      emote,
      isActive: state.phase === LessonPhase.Speaking && step.speaker === id,
    };
  });

  let speech;
  if (state.phase === LessonPhase.Feedback) {
    speech = {
      speaker: "narrator",
      text: state.feedback,
      kind: "feedback",
    };
  } else if (state.phase === LessonPhase.Finished) {
    speech = {
      speaker: step.speaker,
      text: step.dialogue,
      kind: "finished",
    };
  } else {
    speech = {
      speaker: step.speaker,
      text: step.dialogue,
      kind:
        step.speaker === "narrator"
          ? "narration"
          : step.speaker === "user"
            ? "user"
            : "character",
    };
  }

  return {
    backgroundAsset: {
      id: background.id,
      src: background.src,
      alt: background.alt,
    },
    characters,
    speech,
    settingDescription: scene.settingDescription,
    title: scene.title,
  };
}
