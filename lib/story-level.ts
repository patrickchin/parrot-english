export const LEARNER_STORY_LEVEL_IDS = [
  "first-words",
  "repeating-patterns",
  "tiny-stories",
  "early-a1",
] as const;

export type LearnerStoryLevelId = (typeof LEARNER_STORY_LEVEL_IDS)[number];

export function isLearnerStoryLevelId(
  value: unknown,
): value is LearnerStoryLevelId {
  return (
    typeof value === "string" &&
    LEARNER_STORY_LEVEL_IDS.some((levelId) => levelId === value)
  );
}

export const STORY_LEVEL_IDS = [
  ...LEARNER_STORY_LEVEL_IDS,
  "long-stories",
] as const;

export type StoryLevelId = (typeof STORY_LEVEL_IDS)[number];

export function isStoryLevelId(value: unknown): value is StoryLevelId {
  return (
    typeof value === "string" &&
    STORY_LEVEL_IDS.some((levelId) => levelId === value)
  );
}
