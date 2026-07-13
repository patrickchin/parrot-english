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
 * @typedef {{ lesson: Lesson, warnings: string[] }} LessonDraft
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
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

/**
 * Convert an editable or generated draft into a playable lesson. Recoverable
 * problems become warnings; the only fatal content error is having no dialogue
 * that the player can run.
 *
 * @param {unknown} value
 * @param {VisualCatalog} catalog
 * @param {string} sourceName
 * @param {{ childName?: string }} [defaults]
 * @returns {LessonDraft}
 */
export function prepareLesson(value, catalog, sourceName, defaults = {}) {
  const maxWarnings = 14;
  /** @type {string[]} */
  const warnings = [];
  let additionalWarningCount = 0;
  /**
   * @param {string} path
   * @param {string} message
   */
  const warn = (path, message) => {
    if (warnings.length < maxWarnings) {
      warnings.push(`${path}: ${message}`);
    } else {
      additionalWarningCount += 1;
    }
  };
  /** @type {Record<string, unknown>} */
  const root = isRecord(value)
    ? value
    : Array.isArray(value)
      ? (warn(sourceName, "using the root array as scenes"), { scenes: value })
      : {};

  /**
   * @param {Record<string, unknown>} record
   * @param {string} key
   * @param {string} path
   * @param {string} fallback
   */
  function textOrFallback(record, key, path, fallback) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    warn(path, `missing text; using ${JSON.stringify(fallback)}`);
    return fallback;
  }

  const title = textOrFallback(root, "title", `${sourceName} title`, "Untitled lesson");
  const fallbackChildName =
    typeof defaults.childName === "string" && defaults.childName.trim()
      ? defaults.childName
      : "Learner";
  const childName = textOrFallback(
    root,
    "childName",
    `${sourceName} childName`,
    fallbackChildName,
  );
  const summary = textOrFallback(root, "summary", `${sourceName} summary`, title);
  const detailedSummary = textOrFallback(
    root,
    "detailedSummary",
    `${sourceName} detailedSummary`,
    summary,
  );

  /** @type {string[]} */
  const goalPhrases = [];
  if (!Array.isArray(root.goalPhrases)) {
    warn(`${sourceName} goalPhrases`, "missing array; using no goal phrases");
  } else {
    root.goalPhrases.forEach((phrase, index) => {
      if (typeof phrase === "string" && phrase.trim()) {
        goalPhrases.push(phrase);
      } else {
        warn(`${sourceName} goalPhrases[${index}]`, "ignored blank phrase");
      }
    });
  }

  const locationValue = isRecord(root.location) ? root.location : {};
  if (!isRecord(root.location)) {
    warn(`${sourceName} location`, "missing object; using a generic location");
  }
  const locationName = textOrFallback(
    locationValue,
    "name",
    `${sourceName} location.name`,
    "Lesson location",
  );
  const locationDescription = textOrFallback(
    locationValue,
    "description",
    `${sourceName} location.description`,
    locationName,
  );

  const fallbackBackground = catalog.backgrounds.keys().next().value;
  if (typeof fallbackBackground !== "string") {
    throw new Error("The lesson background catalog is empty.");
  }
  /** @type {unknown[]} */
  const sceneValues = Array.isArray(root.scenes) ? root.scenes : [];
  if (!Array.isArray(root.scenes)) {
    warn(`${sourceName} scenes`, "missing array");
  }

  /** @type {LessonScene[]} */
  const scenes = [];
  sceneValues.forEach((sceneCandidate, sourceSceneIndex) => {
    const scenePath = `${sourceName} scenes[${sourceSceneIndex}]`;
    if (!isRecord(sceneCandidate)) {
      warn(scenePath, "ignored non-object scene");
      return;
    }

    const titleFallback = `Scene ${scenes.length + 1}`;
    const sceneTitle = textOrFallback(
      sceneCandidate,
      "title",
      `${scenePath}.title`,
      titleFallback,
    );
    const settingDescription = textOrFallback(
      sceneCandidate,
      "settingDescription",
      `${scenePath}.settingDescription`,
      locationDescription,
    );
    const backgroundCandidate = sceneCandidate.background;
    const background =
      typeof backgroundCandidate === "string" &&
      catalog.backgrounds.has(backgroundCandidate)
        ? backgroundCandidate
        : fallbackBackground;
    if (background !== backgroundCandidate) {
      warn(
        `${scenePath}.background`,
        `unsupported background; using ${JSON.stringify(fallbackBackground)}`,
      );
    }

    /** @type {string[]} */
    const characters = [];
    if (!Array.isArray(sceneCandidate.characters)) {
      warn(`${scenePath}.characters`, "missing array; using no visible characters");
    } else {
      sceneCandidate.characters.forEach((character, characterIndex) => {
        const characterPath = `${scenePath}.characters[${characterIndex}]`;
        if (typeof character !== "string" || !catalog.characters.has(character)) {
          warn(characterPath, "ignored unsupported character");
        } else if (characters.includes(character)) {
          warn(characterPath, "ignored duplicate character");
        } else {
          characters.push(character);
        }
      });
    }

    const stepValues = Array.isArray(sceneCandidate.steps)
      ? sceneCandidate.steps
      : [];
    if (!Array.isArray(sceneCandidate.steps)) {
      warn(`${scenePath}.steps`, "missing array");
    }
    /** @type {LessonStep[]} */
    const steps = [];
    stepValues.forEach((stepCandidate, stepIndex) => {
      const stepPath = `${scenePath}.steps[${stepIndex}]`;
      if (!isRecord(stepCandidate)) {
        warn(stepPath, "ignored non-object step");
        return;
      }
      if (
        typeof stepCandidate.dialogue !== "string" ||
        !stepCandidate.dialogue.trim()
      ) {
        warn(`${stepPath}.dialogue`, "ignored step without dialogue");
        return;
      }

      const speakerCandidate = stepCandidate.speaker;
      const speaker =
        speakerCandidate === "narrator" ||
        speakerCandidate === "user" ||
        (typeof speakerCandidate === "string" &&
          catalog.characters.has(speakerCandidate))
          ? speakerCandidate
          : "narrator";
      if (speaker !== speakerCandidate) {
        warn(`${stepPath}.speaker`, "unsupported speaker; using narrator");
      }

      const emoteCandidateValues = stepCandidate.emotes;
      const hasEmoteObject = isRecord(emoteCandidateValues);
      const emoteValues = isRecord(emoteCandidateValues)
        ? emoteCandidateValues
        : {};
      if (!hasEmoteObject) {
        warn(`${stepPath}.emotes`, "missing object; using idle visuals");
      }
      /** @type {Record<string, string>} */
      const emotes = {};
      for (const characterId of characters) {
        const emoteCandidate = emoteValues[characterId];
        const emote =
          typeof emoteCandidate === "string" &&
          catalog.emotes.has(emoteCandidate) &&
          catalog.characters.get(characterId)?.assets[emoteCandidate]
            ? emoteCandidate
            : "idle";
        if (hasEmoteObject && emote !== emoteCandidate) {
          warn(`${stepPath}.emotes.${characterId}`, "using idle visual");
        }
        emotes[characterId] = emote;
      }

      steps.push(
        /** @type {LessonStep} */ ({
          ...stepCandidate,
          speaker,
          dialogue: stepCandidate.dialogue,
          emotes,
        }),
      );
    });

    if (steps.length === 0) {
      warn(scenePath, "ignored scene without playable dialogue");
      return;
    }

    scenes.push(
      /** @type {LessonScene} */ ({
        ...sceneCandidate,
        title: sceneTitle,
        settingDescription,
        background,
        characters,
        steps,
      }),
    );
  });

  if (scenes.length === 0) {
    throw new Error(`${sourceName} must contain at least one playable dialogue step`);
  }

  const lesson = /** @type {Lesson} */ ({
    ...root,
    title,
    childName,
    goalPhrases,
    summary,
    detailedSummary,
    location: {
      ...locationValue,
      name: locationName,
      description: locationDescription,
    },
    scenes,
  });
  validateLesson(lesson, catalog, sourceName);
  if (additionalWarningCount > 0) {
    warnings.push(
      `${sourceName}: ${additionalWarningCount} additional repairs were applied`,
    );
  }
  return { lesson, warnings };
}
