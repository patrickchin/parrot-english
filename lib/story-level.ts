export const STORY_LEVEL_IDS = [
  "first-words",
  "repeating-patterns",
  "tiny-stories",
  "early-a1",
] as const;

export type StoryLevelId = (typeof STORY_LEVEL_IDS)[number];

export function isStoryLevelId(value: unknown): value is StoryLevelId {
  return (
    typeof value === "string" &&
    STORY_LEVEL_IDS.includes(value as StoryLevelId)
  );
}
