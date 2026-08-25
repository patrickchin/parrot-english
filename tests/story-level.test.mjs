import assert from "node:assert/strict";
import { test } from "node:test";
import * as storyLevels from "../lib/story-level.ts";

test("separates learner preferences from every routable story level", () => {
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

  assert.equal(storyLevels.isLearnerStoryLevelId("early-a1"), true);
  assert.equal(storyLevels.isLearnerStoryLevelId("long-stories"), false);
  assert.equal(storyLevels.isStoryLevelId("long-stories"), true);
  assert.equal(storyLevels.isStoryLevelId("expert"), false);
});
