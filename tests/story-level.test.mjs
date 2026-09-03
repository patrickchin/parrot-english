import assert from "node:assert/strict";
import { test } from "node:test";
import * as storyLevels from "../lib/story-level.ts";

test("keeps only the long-story shelf out of learner preferences", () => {
  assert.deepEqual(storyLevels.LEARNER_STORY_LEVEL_IDS, [
    "first-words",
    "repeating-patterns",
    "tiny-stories",
    "early-a1",
  ]);
  assert.deepEqual(storyLevels.STORY_LEVEL_IDS, [
    ...storyLevels.LEARNER_STORY_LEVEL_IDS,
    "long-stories",
  ]);
  assert.equal(storyLevels.isLearnerStoryLevelId("long-stories"), false);
  assert.equal(storyLevels.isStoryLevelId("long-stories"), true);
});
