// @ts-check

export const DIRECTOR_SCHEMA_VERSION = "lesson-director.response.v1";

export const DIRECTOR_PURPOSES = [
  "scene_dialogue",
  "context_explain",
  "model_phrase",
  "slow_model",
  "prompt_repeat",
  "feedback_success",
  "feedback_retry",
  "feedback_no_speech",
  "transition",
  "completion",
];

export const DIRECTOR_STATUSES = [
  "prompt_child",
  "continue_current_scene",
  "advance_scene",
  "finish_lesson",
  "recover_error",
];

const CHINESE_PATTERN = /[\u3400-\u9fff]/;
const LATIN_PATTERN = /[A-Za-z]/;

/**
 * @typedef {{ [key: string]: any }} LooseRecord
 * @typedef {{ ok: boolean, errors: string[] }} ValidationResult
 */

/**
 * @param {unknown} value
 * @returns {value is LooseRecord}
 */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {string} text
 */
function hasMixedChineseAndEnglish(text) {
  return CHINESE_PATTERN.test(text) && LATIN_PATTERN.test(text);
}

/**
 * @param {string[]} errors
 * @param {unknown} object
 * @param {string} key
 * @param {string} path
 */
function pushRequired(errors, object, key, path) {
  if (!isObject(object) || !(key in object)) {
    errors.push(`${path}.${key} is required`);
  }
}

/**
 * @param {string[]} errors
 * @param {unknown} object
 * @param {string} key
 * @param {string} path
 */
function pushObjectShape(errors, object, key, path) {
  pushRequired(errors, object, key, path);
  if (isObject(object) && key in object && !isObject(object[key])) {
    errors.push(`${path}.${key} must be an object`);
  }
}

/**
 * @param {string[]} errors
 * @param {unknown} object
 * @param {string} key
 * @param {string} path
 */
function pushArrayShape(errors, object, key, path) {
  pushRequired(errors, object, key, path);
  if (isObject(object) && key in object && !Array.isArray(object[key])) {
    errors.push(`${path}.${key} must be an array`);
  }
}

/**
 * @param {unknown} lesson
 * @returns {ValidationResult}
 */
export function validateLessonDefinition(lesson) {
  /** @type {string[]} */
  const errors = [];
  pushRequired(errors, lesson, "lessonId", "lesson");
  pushRequired(errors, lesson, "title", "lesson");
  pushObjectShape(errors, lesson, "learner", "lesson");
  pushObjectShape(errors, lesson, "world", "lesson");
  pushArrayShape(errors, lesson, "characters", "lesson");
  pushObjectShape(errors, lesson, "availableAssets", "lesson");
  pushObjectShape(errors, lesson, "teachingPolicy", "lesson");
  pushArrayShape(errors, lesson, "scenes", "lesson");

  if (isObject(lesson) && Array.isArray(lesson.characters)) {
    const ids = new Set();
    for (const character of lesson.characters) {
      if (!isObject(character)) {
        errors.push("character must be an object");
        continue;
      }
      if (!character.id) errors.push("character.id is required");
      if (ids.has(character.id)) errors.push(`duplicate character ${character.id}`);
      ids.add(character.id);
      for (const purpose of character.allowedPurposes ?? []) {
        if (!DIRECTOR_PURPOSES.includes(purpose)) {
          errors.push(`unknown allowed purpose ${purpose} for ${character.id}`);
        }
      }
    }
  }

  if (isObject(lesson) && Array.isArray(lesson.scenes)) {
    for (const scene of lesson.scenes) {
      if (!isObject(scene)) {
        errors.push("scene must be an object");
        continue;
      }
      if (!scene.id) errors.push("scene.id is required");
      if (!scene.childTarget) errors.push(`scene ${scene.id} missing childTarget`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * @param {unknown} lesson
 * @returns {string[]}
 */
function collectLessonAssetShapeErrors(lesson) {
  /** @type {string[]} */
  const errors = [];
  if (
    isObject(lesson) &&
    isObject(lesson.availableAssets) &&
    "backgrounds" in lesson.availableAssets &&
    !Array.isArray(lesson.availableAssets.backgrounds)
  ) {
    errors.push("lesson.availableAssets.backgrounds must be an array");
  }
  return errors;
}

/**
 * @param {unknown} lesson
 */
function collectLessonIndexes(lesson) {
  const lessonObject = isObject(lesson) ? lesson : {};
  const availableAssets = isObject(lessonObject.availableAssets)
    ? lessonObject.availableAssets
    : {};
  const backgrounds = Array.isArray(availableAssets.backgrounds)
    ? availableAssets.backgrounds
    : [];
  const characters = Array.isArray(lessonObject.characters)
    ? lessonObject.characters
    : [];
  const scenes = Array.isArray(lessonObject.scenes) ? lessonObject.scenes : [];

  return {
    backgrounds: new Set(backgrounds),
    characters: new Set(characters.map(getCharacterId)),
    scenes: new Map(scenes.map(getSceneEntry)),
    poses: availableAssets.poses ?? {},
  };
}

/**
 * @param {unknown} character
 */
function getCharacterId(character) {
  return isObject(character) ? character.id : undefined;
}

/**
 * @param {unknown} scene
 * @returns {[any, unknown]}
 */
function getSceneEntry(scene) {
  return isObject(scene) ? [scene.id, scene] : [undefined, scene];
}

/**
 * @param {unknown} packet
 * @param {unknown} lesson
 * @returns {ValidationResult}
 */
export function validateLessonDirectorResponse(packet, lesson) {
  if (!isObject(packet)) {
    return { ok: false, errors: ["packet must be an object"] };
  }

  const errors = collectLessonAssetShapeErrors(lesson);
  const indexes = collectLessonIndexes(lesson);

  if (packet.schemaVersion !== DIRECTOR_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${DIRECTOR_SCHEMA_VERSION}`);
  }
  if (!indexes.scenes.has(packet.sceneId)) {
    errors.push(`unknown scene ${packet.sceneId}`);
  }
  if (!indexes.backgrounds.has(packet.background)) {
    errors.push(`unknown background ${packet.background}`);
  }

  if (!isObject(packet.characters)) {
    errors.push("packet.characters must be an object");
  } else {
    for (const [speaker, state] of Object.entries(packet.characters)) {
      if (!indexes.characters.has(speaker)) errors.push(`unknown character ${speaker}`);
      if (!indexes.poses[speaker]?.includes(state?.pose)) {
        errors.push(`unknown pose ${state?.pose} for ${speaker}`);
      }
    }
  }

  if (!Array.isArray(packet.turns)) {
    errors.push("packet.turns must be an array");
  } else {
    for (const [turnIndex, turn] of packet.turns.entries()) {
      if (!isObject(turn)) {
        errors.push(`turn ${turnIndex} must be an object`);
        continue;
      }
      if (!indexes.characters.has(turn.speaker)) {
        errors.push(`unknown turn speaker ${turn.speaker}`);
      }
      if (!DIRECTOR_PURPOSES.includes(turn.purpose)) {
        errors.push(`unknown purpose ${turn.purpose}`);
      }
      if (!indexes.poses[turn.speaker]?.includes(turn.pose)) {
        errors.push(`unknown pose ${turn.pose} for ${turn.speaker}`);
      }
      if (!Array.isArray(turn.speech)) {
        errors.push(`turn ${turn.turnId} speech must be an array`);
      } else {
        for (const segment of turn.speech) {
          if (hasMixedChineseAndEnglish(segment?.text ?? "")) {
            errors.push(`mixed Chinese and English in ${turn.turnId}`);
          }
        }
      }
    }
  }

  const status = packet.lessonControl?.status;
  if (!DIRECTOR_STATUSES.includes(status)) {
    errors.push(`unknown lessonControl.status ${status}`);
  }
  if (status === "prompt_child" && packet.childPrompt?.shouldListen !== true) {
    errors.push("prompt_child requires childPrompt.shouldListen");
  }
  if (packet.childPrompt?.shouldListen === true && status !== "prompt_child") {
    errors.push("childPrompt.shouldListen requires prompt_child status");
  }

  const scene = /** @type {LooseRecord | undefined} */ (
    indexes.scenes.get(packet.sceneId)
  );
  if (
    packet.childPrompt?.shouldListen &&
    packet.childPrompt.targetText !== scene?.childTarget
  ) {
    errors.push("childPrompt.targetText must match current scene childTarget");
  }

  return { ok: errors.length === 0, errors };
}
