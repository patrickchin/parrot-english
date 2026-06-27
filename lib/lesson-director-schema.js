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

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasMixedChineseAndEnglish(text) {
  return CHINESE_PATTERN.test(text) && LATIN_PATTERN.test(text);
}

function pushRequired(errors, object, key, path) {
  if (!isObject(object) || !(key in object)) {
    errors.push(`${path}.${key} is required`);
  }
}

export function validateLessonDefinition(lesson) {
  const errors = [];
  pushRequired(errors, lesson, "lessonId", "lesson");
  pushRequired(errors, lesson, "title", "lesson");
  pushRequired(errors, lesson, "learner", "lesson");
  pushRequired(errors, lesson, "world", "lesson");
  pushRequired(errors, lesson, "characters", "lesson");
  pushRequired(errors, lesson, "availableAssets", "lesson");
  pushRequired(errors, lesson, "teachingPolicy", "lesson");
  pushRequired(errors, lesson, "scenes", "lesson");

  if (Array.isArray(lesson?.characters)) {
    const ids = new Set();
    for (const character of lesson.characters) {
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

  if (Array.isArray(lesson?.scenes)) {
    for (const scene of lesson.scenes) {
      if (!scene.id) errors.push("scene.id is required");
      if (!scene.childTarget) errors.push(`scene ${scene.id} missing childTarget`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function collectLessonIndexes(lesson) {
  return {
    backgrounds: new Set(lesson.availableAssets?.backgrounds ?? []),
    characters: new Set((lesson.characters ?? []).map((character) => character.id)),
    scenes: new Map((lesson.scenes ?? []).map((scene) => [scene.id, scene])),
    poses: lesson.availableAssets?.poses ?? {},
  };
}

export function validateLessonDirectorResponse(packet, lesson) {
  const errors = [];
  const indexes = collectLessonIndexes(lesson);

  if (!isObject(packet)) {
    return { ok: false, errors: ["packet must be an object"] };
  }

  if (packet.schemaVersion !== DIRECTOR_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${DIRECTOR_SCHEMA_VERSION}`);
  }
  if (!indexes.scenes.has(packet.sceneId)) {
    errors.push(`unknown scene ${packet.sceneId}`);
  }
  if (!indexes.backgrounds.has(packet.background)) {
    errors.push(`unknown background ${packet.background}`);
  }

  for (const [speaker, state] of Object.entries(packet.characters ?? {})) {
    if (!indexes.characters.has(speaker)) errors.push(`unknown character ${speaker}`);
    if (!indexes.poses[speaker]?.includes(state?.pose)) {
      errors.push(`unknown pose ${state?.pose} for ${speaker}`);
    }
  }

  for (const turn of packet.turns ?? []) {
    if (!indexes.characters.has(turn.speaker)) {
      errors.push(`unknown turn speaker ${turn.speaker}`);
    }
    if (!DIRECTOR_PURPOSES.includes(turn.purpose)) {
      errors.push(`unknown purpose ${turn.purpose}`);
    }
    if (!indexes.poses[turn.speaker]?.includes(turn.pose)) {
      errors.push(`unknown pose ${turn.pose} for ${turn.speaker}`);
    }
    for (const segment of turn.speech ?? []) {
      if (hasMixedChineseAndEnglish(segment.text ?? "")) {
        errors.push(`mixed Chinese and English in ${turn.turnId}`);
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

  const scene = indexes.scenes.get(packet.sceneId);
  if (
    packet.childPrompt?.shouldListen &&
    packet.childPrompt.targetText !== scene?.childTarget
  ) {
    errors.push("childPrompt.targetText must match current scene childTarget");
  }

  return { ok: errors.length === 0, errors };
}
