import type { StoryLevelId } from "../../lib/story-level.ts";
import { LONG_STORIES } from "./long-stories.ts";
import { STORY_SCRIPT_CANDIDATES } from "./story-script-candidates.ts";
import type { Story, StoryLevel } from "./story-types.ts";

export {
  LEARNER_STORY_LEVEL_IDS,
  STORY_LEVEL_IDS,
  isLearnerStoryLevelId,
  isStoryLevelId,
  type LearnerStoryLevelId,
  type StoryLevelId,
} from "../../lib/story-level.ts";

export type {
  Story,
  StoryArtwork,
  StoryLevel,
  StoryPage,
} from "./story-types.ts";

export const STORY_LEVELS: readonly StoryLevel[] = [
  {
    id: "first-english-words",
    label: "First English words",
    cefrReference: "Before Pre-A1",
    description: "Look. Listen. Say it.",
  },
  {
    id: "first-words",
    label: "Start here",
    cefrReference: "Entry Pre-A1",
    description: "Very short. One idea on each page.",
  },
  {
    id: "repeating-patterns",
    label: "Say it again",
    cefrReference: "Supported Pre-A1",
    description: "The same words come back.",
  },
  {
    id: "tiny-stories",
    label: "Little stories",
    cefrReference: "Secure Pre-A1",
    description: "A little story with short lines.",
  },
  {
    id: "early-a1",
    label: "Big adventures",
    cefrReference: "Pre-A1 to A1 bridge",
    description: "A longer story with more words.",
  },
  {
    id: "long-stories",
    label: "Long stories",
    cefrReference: "Read aloud",
    description: "Longer stories with saved narration.",
  },
];

const STORY_LEVEL_ORDER = new Map(
  STORY_LEVELS.map(({ id }, index) => [id, index]),
);

export const STORIES: readonly Story[] = [
  ...STORY_SCRIPT_CANDIDATES,
  ...LONG_STORIES,
].sort(
  (firstStory, secondStory) =>
    (STORY_LEVEL_ORDER.get(firstStory.level) ?? 0) -
    (STORY_LEVEL_ORDER.get(secondStory.level) ?? 0),
);

export function getStoryLevel(levelId: StoryLevelId): StoryLevel {
  const level = STORY_LEVELS.find(({ id }) => id === levelId);
  if (!level) {
    throw new Error(`Unknown story level: ${levelId}`);
  }
  return level;
}

export function resolveStory(storyId: string | undefined): Story | null {
  if (!storyId) return null;
  return STORIES.find((story) => story.id === storyId) ?? null;
}
