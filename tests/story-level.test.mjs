import assert from "node:assert/strict";
import { test } from "node:test";
import * as storyLevels from "../lib/story-level.ts";

// Production break caught: a shelf-only section is missing from story routing or
// is accidentally persisted as a learner preference.
test("keeps both shelf-only levels out of learner preferences", () => {
  assert.deepEqual(storyLevels.LEARNER_STORY_LEVEL_IDS, [
    "first-words",
    "repeating-patterns",
    "tiny-stories",
    "early-a1",
  ]);
  assert.deepEqual(storyLevels.STORY_LEVEL_IDS, [
    "first-english-words",
    ...storyLevels.LEARNER_STORY_LEVEL_IDS,
    "long-stories",
  ]);
  assert.equal(
    storyLevels.isLearnerStoryLevelId("first-english-words"),
    false,
  );
  assert.equal(storyLevels.isStoryLevelId("first-english-words"), true);
  assert.equal(storyLevels.isLearnerStoryLevelId("long-stories"), false);
  assert.equal(storyLevels.isStoryLevelId("long-stories"), true);
});
