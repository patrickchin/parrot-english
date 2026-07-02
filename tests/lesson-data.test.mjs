import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_LESSON_ID,
  LESSONS,
  LESSON_STEPS,
  getDefaultLesson,
  getLessonById,
  isLessonPlayable,
} from "../lib/lesson-data.js";

describe("lesson catalog data", () => {
  it("keeps lesson list metadata outside the UI", () => {
    assert.ok(LESSONS.length >= 1);

    for (const lesson of LESSONS) {
      assert.equal(typeof lesson.id, "string");
      assert.equal(typeof lesson.title, "string");
      assert.equal(typeof lesson.subtitle, "string");
      assert.equal(typeof lesson.description, "string");
      assert.match(lesson.status, /^(available|disabled)$/);
      assert.equal(typeof lesson.statusLabel, "string");
      assert.ok(Array.isArray(lesson.steps));
    }
  });

  it("uses one default playable lesson for the current script", () => {
    const defaultLesson = getDefaultLesson();

    assert.equal(defaultLesson.id, DEFAULT_LESSON_ID);
    assert.equal(defaultLesson.status, "available");
    assert.equal(isLessonPlayable(defaultLesson), true);
    assert.deepEqual(defaultLesson.steps, LESSON_STEPS);
    assert.ok(defaultLesson.steps.length > 0);
  });

  it("lets callers select a lesson by id without UI branches", () => {
    const currentLesson = getLessonById(DEFAULT_LESSON_ID);
    const futureLesson = getLessonById("garden-colors");

    assert.equal(currentLesson?.id, DEFAULT_LESSON_ID);
    assert.equal(futureLesson?.status, "disabled");
    assert.equal(isLessonPlayable(futureLesson), false);
    assert.equal(getLessonById("missing-lesson"), undefined);
  });

  it("keeps audio ids with each script step instead of deriving them in the UI", () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        assert.equal(typeof step.audio.example, "string", `${lesson.id}:${step.id}`);
        assert.equal(typeof step.audio.prompt, "string", `${lesson.id}:${step.id}`);
        assert.equal(typeof step.audio.model, "string", `${lesson.id}:${step.id}`);
      }
    }
  });
});
