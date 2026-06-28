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
 * @param {string[]} errors
 * @param {unknown} object
 * @param {string} key
 * @param {string} path
 */
function pushStringShape(errors, object, key, path) {
  pushRequired(errors, object, key, path);
  if (isObject(object) && key in object && typeof object[key] !== "string") {
    errors.push(`${path}.${key} must be a string`);
  }
}

/**
 * @param {string[]} errors
 * @param {unknown} object
 * @param {string} key
 * @param {string} path
 */
function pushNumberShape(errors, object, key, path) {
  pushRequired(errors, object, key, path);
  if (
    isObject(object) &&
    key in object &&
    (typeof object[key] !== "number" || !Number.isFinite(object[key]))
  ) {
    errors.push(`${path}.${key} must be a number`);
  }
}

/**
 * @param {string[]} errors
 * @param {unknown} object
 * @param {string} key
 * @param {string} path
 */
function pushBooleanShape(errors, object, key, path) {
  pushRequired(errors, object, key, path);
  if (isObject(object) && key in object && typeof object[key] !== "boolean") {
    errors.push(`${path}.${key} must be a boolean`);
  }
}

/**
 * @param {string[]} errors
 * @param {unknown} object
 * @param {string} key
 * @param {string} path
 */
function pushNullableStringShape(errors, object, key, path) {
  pushRequired(errors, object, key, path);
  if (
    isObject(object) &&
    key in object &&
    object[key] !== null &&
    typeof object[key] !== "string"
  ) {
    errors.push(`${path}.${key} must be a string or null`);
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

  pushStringShape(errors, packet, "schemaVersion", "packet");
  pushStringShape(errors, packet, "packetId", "packet");
  pushStringShape(errors, packet, "sceneId", "packet");
  pushStringShape(errors, packet, "background", "packet");
  pushObjectShape(errors, packet, "characters", "packet");
  pushArrayShape(errors, packet, "turns", "packet");
  pushObjectShape(errors, packet, "childPrompt", "packet");
  pushObjectShape(errors, packet, "lessonControl", "packet");

  if (
    typeof packet.schemaVersion === "string" &&
    packet.schemaVersion !== DIRECTOR_SCHEMA_VERSION
  ) {
    errors.push(`schemaVersion must be ${DIRECTOR_SCHEMA_VERSION}`);
  }
  if (typeof packet.sceneId === "string" && !indexes.scenes.has(packet.sceneId)) {
    errors.push(`unknown scene ${packet.sceneId}`);
  }
  if (
    typeof packet.background === "string" &&
    !indexes.backgrounds.has(packet.background)
  ) {
    errors.push(`unknown background ${packet.background}`);
  }

  if (isObject(packet.characters)) {
    for (const [speaker, state] of Object.entries(packet.characters)) {
      if (!indexes.characters.has(speaker)) errors.push(`unknown character ${speaker}`);
      if (!isObject(state)) {
        errors.push(`packet.characters.${speaker} must be an object`);
        continue;
      }
      pushStringShape(errors, state, "pose", `packet.characters.${speaker}`);
      if (
        typeof state.pose === "string" &&
        !indexes.poses[speaker]?.includes(state.pose)
      ) {
        errors.push(`unknown pose ${state.pose} for ${speaker}`);
      }
    }
  }

  if (Array.isArray(packet.turns)) {
    for (const [turnIndex, turn] of packet.turns.entries()) {
      if (!isObject(turn)) {
        errors.push(`turn ${turnIndex} must be an object`);
        continue;
      }
      const turnLabel =
        typeof turn.turnId === "string" ? `turn ${turn.turnId}` : `turn ${turnIndex}`;
      pushStringShape(errors, turn, "turnId", `turn ${turnIndex}`);
      pushStringShape(errors, turn, "speaker", turnLabel);
      pushStringShape(errors, turn, "purpose", turnLabel);
      pushStringShape(errors, turn, "visibleText", turnLabel);
      pushStringShape(errors, turn, "pose", turnLabel);

      if (typeof turn.speaker === "string" && !indexes.characters.has(turn.speaker)) {
        errors.push(`unknown turn speaker ${turn.speaker}`);
      }
      if (typeof turn.purpose === "string" && !DIRECTOR_PURPOSES.includes(turn.purpose)) {
        errors.push(`unknown purpose ${turn.purpose}`);
      }
      if (
        typeof turn.speaker === "string" &&
        typeof turn.pose === "string" &&
        !indexes.poses[turn.speaker]?.includes(turn.pose)
      ) {
        errors.push(`unknown pose ${turn.pose} for ${turn.speaker}`);
      }
      if (!Array.isArray(turn.speech)) {
        if (!("speech" in turn)) {
          errors.push(`${turnLabel}.speech is required`);
        } else {
          errors.push(`${turnLabel} speech must be an array`);
        }
      } else {
        for (const [segmentIndex, segment] of turn.speech.entries()) {
          const segmentLabel = `${turnLabel} speech segment ${segmentIndex}`;
          if (!isObject(segment)) {
            errors.push(`${segmentLabel} must be an object`);
            continue;
          }
          if (!("lang" in segment)) {
            errors.push(`${segmentLabel} lang is required`);
          } else if (typeof segment.lang !== "string") {
            errors.push(`${segmentLabel} lang must be a string`);
          }
          if (!("text" in segment)) {
            errors.push(`${segmentLabel} text is required`);
          } else if (typeof segment.text !== "string") {
            errors.push(`${segmentLabel} text must be a string`);
          } else if (hasMixedChineseAndEnglish(segment.text)) {
            errors.push(`mixed Chinese and English in ${turn.turnId}`);
          }
        }
      }
    }
  }

  if (isObject(packet.childPrompt)) {
    pushBooleanShape(errors, packet.childPrompt, "shouldListen", "packet.childPrompt");
    pushStringShape(errors, packet.childPrompt, "targetText", "packet.childPrompt");
    pushStringShape(errors, packet.childPrompt, "displayText", "packet.childPrompt");
    pushNumberShape(errors, packet.childPrompt, "recordingSeconds", "packet.childPrompt");
  }

  if (isObject(packet.lessonControl)) {
    pushStringShape(errors, packet.lessonControl, "status", "packet.lessonControl");
    pushNullableStringShape(
      errors,
      packet.lessonControl,
      "nextSceneId",
      "packet.lessonControl"
    );
    pushStringShape(errors, packet.lessonControl, "reason", "packet.lessonControl");
  }

  const status = isObject(packet.lessonControl) ? packet.lessonControl.status : undefined;
  if (typeof status === "string" && !DIRECTOR_STATUSES.includes(status)) {
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
    isObject(packet.childPrompt) &&
    packet.childPrompt.shouldListen === true &&
    packet.childPrompt.targetText !== scene?.childTarget
  ) {
    errors.push("childPrompt.targetText must match current scene childTarget");
  }

  return { ok: errors.length === 0, errors };
}
