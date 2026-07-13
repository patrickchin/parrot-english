// @ts-check

export const LESSON_EMOTES = [
  "idle",
  "talking",
  "listening",
  "happy",
  "sad",
  "surprised",
];

const ROOT_KEYS = [
  "childName",
  "detailedSummary",
  "goalPhrases",
  "location",
  "scenes",
  "summary",
  "title",
];
const LOCATION_KEYS = ["description", "name"];
const SCENE_KEYS = [
  "background",
  "characters",
  "settingDescription",
  "steps",
  "title",
];
const STEP_KEYS = ["dialogue", "emotes", "speaker"];
const REQUIRED_CHARACTERS = ["peppa", "dolly"];

/**
 * @typedef {{ src: string, alt: string }} VisualAsset
 * @typedef {{ id: string, name: string, assets: Record<string, VisualAsset> }} CharacterDefinition
 * @typedef {{ id: string, src: string, alt: string }} BackgroundDefinition
 * @typedef {{
 *   emotes: Map<string, string>,
 *   characters: Map<string, CharacterDefinition>,
 *   backgrounds: Map<string, BackgroundDefinition>
 * }} VisualCatalog
 * @typedef {{ speaker: "peppa" | "dolly" | "user" | "narrator", dialogue: string, emotes: Record<string, string> }} LessonStep
 * @typedef {{ title: string, settingDescription: string, background: string, characters: string[], steps: LessonStep[] }} LessonScene
 * @typedef {{
 *   title: string,
 *   childName: string,
 *   goalPhrases: string[],
 *   summary: string,
 *   detailedSummary: string,
 *   location: { name: string, description: string },
 *   scenes: LessonScene[]
 * }} Lesson
 */

/** @param {unknown} value */
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {asserts value is Record<string, unknown>}
 */
function requireRecord(value, path) {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {asserts value is string}
 */
function requireText(value, path) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} must be a non-empty string`);
  }
}

/**
 * @param {Record<string, unknown>} value
 * @param {string[]} keys
 * @param {string} path
 */
function requireKeys(value, keys, path) {
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  if (missing.length > 0) {
    throw new Error(`${path} must include: ${missing.join(", ")}`);
  }
}

/**
 * @param {Record<string, unknown>} value
 * @param {string[]} keys
 * @param {string} path
 */
function requireExactKeys(value, keys, path) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${path} must contain exactly: ${expected.join(", ")}`);
  }
}

/**
 * @param {{ emotes: unknown, characters: unknown, backgrounds: unknown }} input
 * @returns {VisualCatalog}
 */
export function createLessonCatalog({ emotes, characters, backgrounds }) {
  if (!Array.isArray(emotes)) throw new Error("emotes must be an array");
  if (!Array.isArray(characters)) throw new Error("characters must be an array");
  if (!Array.isArray(backgrounds)) throw new Error("backgrounds must be an array");

  const emoteIds = emotes.map((emote, index) => {
    requireText(emote, `emotes[${index}]`);
    return emote;
  });
  if (
    emoteIds.length !== LESSON_EMOTES.length ||
    [...emoteIds].sort().some((emote, index) => emote !== [...LESSON_EMOTES].sort()[index])
  ) {
    throw new Error(`emotes must contain exactly: ${LESSON_EMOTES.join(", ")}`);
  }

  /** @type {Map<string, CharacterDefinition>} */
  const characterMap = new Map();
  characters.forEach((value, index) => {
    const path = `characters[${index}]`;
    requireRecord(value, path);
    requireExactKeys(value, ["assets", "id", "name"], path);
    requireText(value.id, `${path}.id`);
    requireText(value.name, `${path}.name`);
    requireRecord(value.assets, `${path}.assets`);
    requireExactKeys(value.assets, LESSON_EMOTES, `${path}.assets`);

    /** @type {Record<string, VisualAsset>} */
    const assets = {};
    for (const emote of LESSON_EMOTES) {
      const asset = value.assets[emote];
      requireRecord(asset, `${path}.assets.${emote}`);
      requireExactKeys(asset, ["alt", "src"], `${path}.assets.${emote}`);
      requireText(asset.src, `${path}.assets.${emote}.src`);
      requireText(asset.alt, `${path}.assets.${emote}.alt`);
      assets[emote] = { src: asset.src, alt: asset.alt };
    }

    if (characterMap.has(value.id)) throw new Error(`${path}.id must be unique`);
    characterMap.set(value.id, { id: value.id, name: value.name, assets });
  });

  for (const id of REQUIRED_CHARACTERS) {
    if (!characterMap.has(id)) throw new Error(`characters must include ${id}`);
  }

  /** @type {Map<string, BackgroundDefinition>} */
  const backgroundMap = new Map();
  backgrounds.forEach((value, index) => {
    const path = `backgrounds[${index}]`;
    requireRecord(value, path);
    requireExactKeys(value, ["alt", "id", "src"], path);
    requireText(value.id, `${path}.id`);
    requireText(value.src, `${path}.src`);
    requireText(value.alt, `${path}.alt`);
    if (backgroundMap.has(value.id)) throw new Error(`${path}.id must be unique`);
    backgroundMap.set(value.id, { id: value.id, src: value.src, alt: value.alt });
  });
  if (backgroundMap.size === 0) throw new Error("backgrounds must not be empty");

  return {
    emotes: new Map(emoteIds.map((id) => [id, id])),
    characters: characterMap,
    backgrounds: backgroundMap,
  };
}

/**
 * @param {unknown} value
 * @param {VisualCatalog} catalog
 * @param {string} sourceName
 * @returns {Lesson}
 */
export function validateLesson(value, catalog, sourceName) {
  requireRecord(value, sourceName);
  requireKeys(value, ROOT_KEYS, sourceName);

  requireText(value.title, `${sourceName} title`);
  requireText(value.childName, `${sourceName} childName`);
  requireText(value.summary, `${sourceName} summary`);
  requireText(value.detailedSummary, `${sourceName} detailedSummary`);

  if (!Array.isArray(value.goalPhrases)) {
    throw new Error(`${sourceName} goalPhrases must be an array`);
  }
  value.goalPhrases.forEach((phrase, index) =>
    requireText(phrase, `${sourceName} goalPhrases[${index}]`)
  );

  requireRecord(value.location, `${sourceName} location`);
  requireKeys(value.location, LOCATION_KEYS, `${sourceName} location`);
  requireText(value.location.name, `${sourceName} location.name`);
  requireText(value.location.description, `${sourceName} location.description`);

  if (!Array.isArray(value.scenes) || value.scenes.length === 0) {
    throw new Error(`${sourceName} scenes must contain at least one scene`);
  }

  value.scenes.forEach((sceneValue, sceneIndex) => {
    const scenePath = `${sourceName} scenes[${sceneIndex}]`;
    requireRecord(sceneValue, scenePath);
    requireKeys(sceneValue, SCENE_KEYS, scenePath);
    requireText(sceneValue.title, `${scenePath}.title`);
    requireText(sceneValue.settingDescription, `${scenePath}.settingDescription`);
    requireText(sceneValue.background, `${scenePath}.background`);
    if (!catalog.backgrounds.has(sceneValue.background)) {
      throw new Error(`${scenePath}.background is not in the background catalog`);
    }

    if (!Array.isArray(sceneValue.characters)) {
      throw new Error(`${scenePath}.characters must be an array`);
    }
    const characterIds = sceneValue.characters.map((character, characterIndex) => {
      const path = `${scenePath}.characters[${characterIndex}]`;
      requireText(character, path);
      if (!catalog.characters.has(character)) {
        throw new Error(`${path} is not in the character catalog`);
      }
      return character;
    });
    if (new Set(characterIds).size !== characterIds.length) {
      throw new Error(`${scenePath}.characters must not contain duplicates`);
    }

    const steps = sceneValue.steps;
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error(`${scenePath}.steps must not be empty`);
    }
    steps.forEach((stepValue, stepIndex) => {
      const stepPath = `${scenePath}.steps[${stepIndex}]`;
      requireRecord(stepValue, stepPath);
      requireKeys(stepValue, STEP_KEYS, stepPath);
      requireText(stepValue.speaker, `${stepPath}.speaker`);
      requireText(stepValue.dialogue, `${stepPath}.dialogue`);
      if (
        stepValue.speaker !== "narrator" &&
        stepValue.speaker !== "user" &&
        !catalog.characters.has(stepValue.speaker)
      ) {
        throw new Error(`${stepPath}.speaker is not supported`);
      }

      requireRecord(stepValue.emotes, `${stepPath}.emotes`);
      for (const characterId of characterIds.filter((id) => id !== "user")) {
        const emote = stepValue.emotes[characterId];
        if (emote === undefined) continue;
        requireText(emote, `${stepPath}.emotes.${characterId}`);
        if (!catalog.emotes.has(emote)) {
          throw new Error(`${stepPath}.emotes.${characterId} is not supported`);
        }
        if (!catalog.characters.get(characterId)?.assets[emote]) {
          throw new Error(`${stepPath}.emotes.${characterId} has no visual asset`);
        }
      }
    });
  });

  return /** @type {Lesson} */ (value);
}
