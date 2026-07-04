import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_LESSON_ID, LESSONS } from "../lib/lesson-data.js";
import {
  getDefaultLessonNumber,
  getLessonPagePath,
  resolveLessonNumber,
  resolveLessonPageRoute,
} from "../lib/lesson-routes.js";

describe("numbered lesson routes", () => {
  it("builds canonical lesson page paths", () => {
    assert.equal(getLessonPagePath(1, 1), "/lessons/1/pages/1");
    assert.equal(getLessonPagePath(3, 4), "/lessons/3/pages/4");
  });

  it("resolves the default lesson by its catalog number", () => {
    const result = resolveLessonNumber("1");

    assert.equal(result?.lesson.id, DEFAULT_LESSON_ID);
    assert.equal(result?.lessonNumber, 1);
    assert.equal(getDefaultLessonNumber(), 1);
  });

  it("resolves a numbered lesson page to its step", () => {
    assert.deepEqual(resolveLessonPageRoute("1", "2"), {
      lesson: LESSONS[0],
      lessonNumber: 1,
      pageIndex: 1,
      pageNumber: 2,
      step: LESSONS[0].steps[1],
    });
    assert.equal(LESSONS[0].steps[1].id, "cant-reach");
  });

  it("rejects non-canonical lesson and page numbers", () => {
    const invalidValues = [
      undefined,
      "",
      "0",
      "-1",
      "01",
      "1.5",
      "1x",
      "9007199254740992",
    ];

    for (const value of invalidValues) {
      assert.equal(resolveLessonNumber(value), undefined, `lesson ${value}`);
      assert.equal(resolveLessonPageRoute(value, "1"), undefined, `lesson ${value}`);
      assert.equal(resolveLessonPageRoute("1", value), undefined, `page ${value}`);
    }
  });

  it("rejects disabled and out-of-range catalog positions", () => {
    assert.equal(resolveLessonNumber("2"), undefined);
    assert.equal(resolveLessonNumber("99"), undefined);
    assert.equal(resolveLessonPageRoute("2", "1"), undefined);
    assert.equal(resolveLessonPageRoute("99", "1"), undefined);
    assert.equal(resolveLessonPageRoute("1", "99"), undefined);
  });
});
