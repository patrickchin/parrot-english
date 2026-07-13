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

  const resolvedEmotes = Object.fromEntries(
    scene.characters.map((characterId) => [characterId, "idle"]),
  );
  for (let index = 0; index <= state.stepIndex; index += 1) {
    Object.assign(resolvedEmotes, scene.steps[index]?.emotes ?? {});
  }
  if (state.phase === LessonPhase.Responding) {
    Object.assign(resolvedEmotes, state.response?.emotes ?? {});
  }

  const speechStep =
    state.phase === LessonPhase.Responding && state.response
      ? state.response
      : step;
  const characters = scene.characters.filter((id) => id !== "user").map((id) => {
    const definition = catalog.characters.get(id);
    if (!definition) throw new Error(`Unknown character: ${id}`);
    const emote = resolvedEmotes[id] ?? "idle";
    const asset = definition.assets[emote];
    if (!asset) throw new Error(`Missing ${id} asset for emote: ${emote}`);

    return {
      id,
      name: definition.name,
      asset,
      emote,
      isActive:
        (state.phase === LessonPhase.Speaking ||
          state.phase === LessonPhase.Responding) &&
        speechStep.speaker === id,
    };
  });

  let speech;
  if (state.phase === LessonPhase.Responding) {
    speech = {
      speaker: speechStep.speaker,
      text: speechStep.dialogue,
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
