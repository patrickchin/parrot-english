export const PIXEL_LESSON_SCHEMA_VERSION = 1 as const;
export const PIXEL_LESSON_WORLD_ID = "lesson-garden" as const;
export const PIXEL_LESSON_MAX_MISSIONS = 4;

export const PIXEL_LESSON_TARGET_IDS = [
  "lesson-tree",
  "flower-patch",
  "lesson-basket",
  "apple-counter",
] as const;

export const PIXEL_LESSON_EMOTES = [
  "idle",
  "talking",
  "happy",
  "surprised",
] as const;

export const PIXEL_LESSON_TEXT_LIMITS = Object.freeze({
  title: 80,
  learnerName: 60,
  summary: 240,
  intro: 320,
  instruction: 200,
  phrase: 160,
  success: 200,
  completion: 320,
});

export type PixelLessonTargetId = (typeof PIXEL_LESSON_TARGET_IDS)[number];
export type PixelLessonEmote = (typeof PIXEL_LESSON_EMOTES)[number];

export interface PixelLessonMission {
  targetId: PixelLessonTargetId;
  instruction: string;
  phrase: string;
  success: string;
  emote: PixelLessonEmote;
}

export interface PixelLesson {
  schemaVersion: typeof PIXEL_LESSON_SCHEMA_VERSION;
  title: string;
  learnerName: string;
  summary: string;
  worldId: typeof PIXEL_LESSON_WORLD_ID;
  intro: string;
  missions: PixelLessonMission[];
  completion: string;
}

export interface PixelLessonDraft {
  lesson: PixelLesson;
  warnings: string[];
}

export type PreparedPixelLesson = PixelLessonDraft;

export interface PreparePixelLessonOptions {
  learnerName?: string;
}

export const DEFAULT_PIXEL_LESSON: PixelLesson = {
  schemaVersion: PIXEL_LESSON_SCHEMA_VERSION,
  title: "Garden English Adventure",
  learnerName: "Learner",
  summary: "Practise useful English phrases around the lesson garden.",
  worldId: PIXEL_LESSON_WORLD_ID,
  intro: "Explore the garden and visit each lesson spot.",
  missions: [
    {
      targetId: "lesson-tree",
      instruction: "Walk to the lesson tree and ask for help.",
      phrase: "Can you help me, please?",
      success: "Great asking!",
      emote: "happy",
    },
    {
      targetId: "flower-patch",
      instruction: "Walk to the flower patch and describe the flowers.",
      phrase: "These flowers are beautiful.",
      success: "Lovely description!",
      emote: "happy",
    },
    {
      targetId: "lesson-basket",
      instruction: "Walk to the basket and make a polite request.",
      phrase: "May I have the basket, please?",
      success: "That was very polite!",
      emote: "talking",
    },
    {
      targetId: "apple-counter",
      instruction: "Walk to the apple counter and order an apple.",
      phrase: "I would like an apple, please.",
      success: "Excellent ordering!",
      emote: "surprised",
    },
  ],
  completion: "You completed the garden adventure!",
};

const ROOT_KEYS = new Set([
  "schemaVersion",
  "title",
  "learnerName",
  "summary",
  "worldId",
  "intro",
  "missions",
  "completion",
]);

const MISSION_KEYS = new Set([
  "targetId",
  "instruction",
  "phrase",
  "success",
  "emote",
]);

const targetIds = new Set<string>(PIXEL_LESSON_TARGET_IDS);
const emotes = new Set<string>(PIXEL_LESSON_EMOTES);

const targetNames: Record<PixelLessonTargetId, string> = {
  "lesson-tree": "lesson tree",
  "flower-patch": "flower patch",
  "lesson-basket": "lesson basket",
  "apple-counter": "apple counter",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTargetId(value: unknown): value is PixelLessonTargetId {
  return typeof value === "string" && targetIds.has(value);
}

function isEmote(value: unknown): value is PixelLessonEmote {
  return typeof value === "string" && emotes.has(value);
}

function compactText(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

function truncateText(value: string, maximum: number) {
  const characters = Array.from(value);
  return characters.length <= maximum
    ? value
    : characters.slice(0, maximum).join("").trimEnd();
}

function normalizeText(
  value: unknown,
  path: string,
  fallback: string,
  maximum: number,
  warnings: string[],
) {
  if (typeof value !== "string" || !value.trim()) {
    warnings.push(`${path} was missing or empty; a safe default was used.`);
    return fallback;
  }

  const compacted = compactText(value);
  const truncated = truncateText(compacted, maximum);
  if (truncated !== compacted) {
    warnings.push(`${path} was capped at ${maximum} characters.`);
  }
  return truncated;
}

function normalizeRequiredPhrase(
  value: unknown,
  path: string,
  warnings: string[],
) {
  if (typeof value !== "string" || !value.trim()) {
    warnings.push(`${path} was missing or empty, so the mission was skipped.`);
    return null;
  }

  const compacted = compactText(value);
  const truncated = truncateText(compacted, PIXEL_LESSON_TEXT_LIMITS.phrase);
  if (truncated !== compacted) {
    warnings.push(
      `${path} was capped at ${PIXEL_LESSON_TEXT_LIMITS.phrase} characters.`,
    );
  }
  return truncated;
}

function warnAboutUnknownFields(
  value: Record<string, unknown>,
  allowedKeys: Set<string>,
  path: string,
  warnings: string[],
) {
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length === 0) return;

  warnings.push(
    `${path} contained unknown fields that were stripped: ${unknownKeys.join(", ")}.`,
  );
}

function prepareMissions(
  value: unknown,
  sourceName: string,
  warnings: string[],
) {
  if (!Array.isArray(value)) {
    warnings.push(`${sourceName}.missions was not an array.`);
    return [];
  }

  if (value.length > PIXEL_LESSON_MAX_MISSIONS) {
    warnings.push(
      `${sourceName}.missions contained ${value.length} entries; no more than ${PIXEL_LESSON_MAX_MISSIONS} unique playable missions were kept.`,
    );
  }

  const missions: PixelLessonMission[] = [];
  const usedTargets = new Set<PixelLessonTargetId>();

  value.forEach((candidate, index) => {
    const path = `${sourceName}.missions[${index}]`;
    if (!isRecord(candidate)) {
      warnings.push(`${path} was not an object, so it was skipped.`);
      return;
    }

    warnAboutUnknownFields(candidate, MISSION_KEYS, path, warnings);

    if (!isTargetId(candidate.targetId)) {
      warnings.push(
        `${path}.targetId was missing or unsupported, so the mission was skipped.`,
      );
      return;
    }
    if (usedTargets.has(candidate.targetId)) {
      warnings.push(
        `${path}.targetId duplicated ${candidate.targetId}, so the mission was skipped.`,
      );
      return;
    }

    const phrase = normalizeRequiredPhrase(
      candidate.phrase,
      `${path}.phrase`,
      warnings,
    );
    if (!phrase) return;

    const targetName = targetNames[candidate.targetId];
    const instruction = normalizeText(
      candidate.instruction,
      `${path}.instruction`,
      `Walk to the ${targetName} and say the phrase.`,
      PIXEL_LESSON_TEXT_LIMITS.instruction,
      warnings,
    );
    const success = normalizeText(
      candidate.success,
      `${path}.success`,
      "Great speaking!",
      PIXEL_LESSON_TEXT_LIMITS.success,
      warnings,
    );

    let emote: PixelLessonEmote = "happy";
    if (isEmote(candidate.emote)) {
      emote = candidate.emote;
    } else {
      warnings.push(
        `${path}.emote was missing or unsupported; happy was used.`,
      );
    }

    usedTargets.add(candidate.targetId);
    missions.push({
      targetId: candidate.targetId,
      instruction,
      phrase,
      success,
      emote,
    });
  });

  return missions.slice(0, PIXEL_LESSON_MAX_MISSIONS);
}

/**
 * Converts model-authored pixel lesson data into the strict runtime contract.
 * Unsupported targets and missions without a speaking phrase are not playable
 * and are discarded. Other generated-field problems are repaired with a
 * warning so callers can still preview a useful draft.
 */
export function preparePixelLesson(
  value: unknown,
  sourceName: string,
  options: PreparePixelLessonOptions = {},
): PixelLessonDraft {
  if (!isRecord(value)) {
    throw new Error(`${sourceName} must be an object with playable missions`);
  }

  const warnings: string[] = [];
  warnAboutUnknownFields(value, ROOT_KEYS, sourceName, warnings);

  if (value.schemaVersion !== PIXEL_LESSON_SCHEMA_VERSION) {
    warnings.push(
      `${sourceName}.schemaVersion was missing or unsupported; version ${PIXEL_LESSON_SCHEMA_VERSION} was used.`,
    );
  }
  if (value.worldId !== PIXEL_LESSON_WORLD_ID) {
    warnings.push(
      `${sourceName}.worldId was missing or unsupported; ${PIXEL_LESSON_WORLD_ID} was used.`,
    );
  }

  const hasAuthoritativeLearnerName = options.learnerName !== undefined;
  const learnerName = normalizeText(
    hasAuthoritativeLearnerName ? options.learnerName : value.learnerName,
    hasAuthoritativeLearnerName
      ? "authoritative learnerName"
      : `${sourceName}.learnerName`,
    DEFAULT_PIXEL_LESSON.learnerName,
    PIXEL_LESSON_TEXT_LIMITS.learnerName,
    warnings,
  );
  if (
    hasAuthoritativeLearnerName &&
    typeof value.learnerName === "string" &&
    compactText(value.learnerName) !== learnerName
  ) {
    warnings.push(
      `${sourceName}.learnerName was overridden by the authoritative learnerName.`,
    );
  }

  const missions = prepareMissions(value.missions, sourceName, warnings);
  if (missions.length === 0) {
    throw new Error(
      `${sourceName} must contain at least one playable mission with a supported targetId and non-empty phrase`,
    );
  }

  return {
    lesson: {
      schemaVersion: PIXEL_LESSON_SCHEMA_VERSION,
      title: normalizeText(
        value.title,
        `${sourceName}.title`,
        DEFAULT_PIXEL_LESSON.title,
        PIXEL_LESSON_TEXT_LIMITS.title,
        warnings,
      ),
      learnerName,
      summary: normalizeText(
        value.summary,
        `${sourceName}.summary`,
        DEFAULT_PIXEL_LESSON.summary,
        PIXEL_LESSON_TEXT_LIMITS.summary,
        warnings,
      ),
      worldId: PIXEL_LESSON_WORLD_ID,
      intro: normalizeText(
        value.intro,
        `${sourceName}.intro`,
        DEFAULT_PIXEL_LESSON.intro,
        PIXEL_LESSON_TEXT_LIMITS.intro,
        warnings,
      ),
      missions,
      completion: normalizeText(
        value.completion,
        `${sourceName}.completion`,
        DEFAULT_PIXEL_LESSON.completion,
        PIXEL_LESSON_TEXT_LIMITS.completion,
        warnings,
      ),
    },
    warnings,
  };
}
