import { LONG_STORIES } from "./long-stories.ts";
import { STORY_SCRIPT_CANDIDATES } from "./story-script-candidates.ts";
import type { Story, StoryLevel } from "./story-types.ts";

export {
  LEARNER_STORY_LEVEL_IDS,
  isLearnerStoryLevelId,
  isStoryLevelId,
  type StoryLevelId,
} from "../../lib/story-level.ts";

export type {
  Story,
  StoryLevel,
} from "./story-types.ts";

export const STORY_LEVELS: readonly StoryLevel[] = [
  {
    id: "first-words",
    label: "Level 1 · Words & pictures",
    cefrReference: "Entry Pre-A1",
    description: "A few familiar words on each page.",
  },
  {
    id: "repeating-patterns",
    label: "Level 2 · Repeating stories",
    cefrReference: "Supported Pre-A1",
    description: "Short sentences repeat so you can join in.",
  },
  {
    id: "tiny-stories",
    label: "Level 3 · Short stories",
    cefrReference: "Secure Pre-A1",
    description: "Short sentences tell a whole story.",
  },
  {
    id: "early-a1",
    label: "Level 4 · Longer stories",
    cefrReference: "Pre-A1 to A1 bridge",
    description: "More words and pages build a fuller story.",
  },
  {
    id: "long-stories",
    label: "Storytime · Listen to a full story",
    cefrReference: "Read aloud",
    description: "Long read-alouds to listen to together.",
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

export function resolveStory(storyId: string | undefined): Story | null {
  if (!storyId) return null;
  return STORIES.find((story) => story.id === storyId) ?? null;
}
