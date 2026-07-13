import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MyLessonsApiError,
  generateMyLesson,
  loadMyLesson,
  loadMyLessons,
  saveMyLesson,
} from "../src/my-lessons-api.ts";
import { createLessonScript } from "./fixtures/lesson-script.mjs";

function jsonFetch(payload, status = 200) {
  const calls = [];
  return {
    calls,
    async fetch(...args) {
      calls.push(args);
      return Response.json(payload, { status });
    },
  };
}

describe("My Lessons browser API", () => {
  it("generates a preview and saves it through same-origin JSON requests", async () => {
    const lesson = createLessonScript();
    const generation = jsonFetch({ lesson });
    assert.equal(
      (await generateMyLesson("ordering ice cream", { fetch: generation.fetch })).title,
      "Garden Help",
    );
    assert.equal(generation.calls[0][0], "/api/lessons/my/generate");
    assert.deepEqual(generation.calls[0][1], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"topic":"ordering ice cream"}',
      signal: undefined,
    });

    const descriptor = { id: "lesson-1", lesson, source: "generated" };
    const save = jsonFetch({ lesson: descriptor }, 201);
    assert.deepEqual(
      await saveMyLesson(lesson, "generated", { fetch: save.fetch }),
      descriptor,
    );
    assert.equal(save.calls[0][0], "/api/lessons/my");
    assert.deepEqual(JSON.parse(save.calls[0][1].body), {
      lesson,
      source: "generated",
    });
  });

  it("lists and loads an encoded learner lesson ID", async () => {
    const descriptor = {
      id: "lesson/id",
      lesson: createLessonScript(),
      source: "uploaded",
    };
    const list = jsonFetch({ lessons: [descriptor] });
    assert.deepEqual(await loadMyLessons({ fetch: list.fetch }), [descriptor]);
    assert.equal(list.calls[0][0], "/api/lessons/my");

    const detail = jsonFetch({ lesson: descriptor });
    assert.deepEqual(
      await loadMyLesson("lesson/id", { fetch: detail.fetch }),
      descriptor,
    );
    assert.equal(detail.calls[0][0], "/api/lessons/my/lesson%2Fid");
  });

  it("exposes safe server errors to the creator", async () => {
    const failed = jsonFetch(
      { error: "invalid_topic", message: "Please describe a topic." },
      400,
    );
    await assert.rejects(
      generateMyLesson("", { fetch: failed.fetch }),
      (error) => {
        assert.ok(error instanceof MyLessonsApiError);
        assert.equal(error.status, 400);
        assert.equal(error.code, "invalid_topic");
        assert.equal(error.message, "Please describe a topic.");
        return true;
      },
    );
  });
});
