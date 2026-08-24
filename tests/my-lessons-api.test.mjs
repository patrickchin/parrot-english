import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MyLessonsApiError,
  generateMyLesson,
  loadMyLesson,
  loadMyLessons,
  saveMyLesson,
  updateMyLesson,
} from "../src/lessons/my-lessons-api.ts";
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
    const generation = jsonFetch({ lesson, warnings: ["Draft warning"] });
    const draft = await generateMyLesson("ordering ice cream", {
      fetch: generation.fetch,
    });
    assert.equal(draft.lesson.title, "Garden Help");
    assert.deepEqual(draft.warnings, ["Draft warning"]);
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

  it("rejects a malformed successful lesson detail response", async () => {
    const detail = jsonFetch({
      lesson: {
        id: "lesson-1",
        lesson: {},
        source: "generated",
      },
    });

    await assert.rejects(
      loadMyLesson("lesson-1", { fetch: detail.fetch }),
      (error) => {
        assert.ok(error instanceof MyLessonsApiError);
        assert.equal(error.status, 200);
        assert.equal(error.code, "invalid_response");
        assert.equal(error.message, "The My Lessons response was invalid.");
        assert.ok(error.cause instanceof Error);
        return true;
      },
    );
  });

  it("rejects malformed successful list responses with typed diagnostics", async () => {
    const lesson = createLessonScript();
    const descriptor = {
      id: "lesson-1",
      lesson,
      source: "generated",
    };
    const cases = [
      ["null payload", null],
      ["missing lessons", {}],
      ["non-array lessons", { lessons: {} }],
      ["null descriptor", { lessons: [null] }],
      ["blank ID", { lessons: [{ ...descriptor, id: " " }] }],
      ["dot ID", { lessons: [{ ...descriptor, id: "." }] }],
      ["parent-dot ID", { lessons: [{ ...descriptor, id: ".." }] }],
      ["unencodable ID", { lessons: [{ ...descriptor, id: "\ud800" }] }],
      ["unknown source", { lessons: [{ ...descriptor, source: "legacy" }] }],
      ["invalid timestamp", { lessons: [{ ...descriptor, updatedAt: 7 }] }],
      ["invalid lesson", { lessons: [{ ...descriptor, lesson: {} }] }],
      ["duplicate IDs", { lessons: [descriptor, descriptor] }],
    ];

    for (const [name, payload] of cases) {
      const request = jsonFetch(payload);
      await assert.rejects(
        loadMyLessons({ fetch: request.fetch }),
        (error) => {
          assert.ok(error instanceof MyLessonsApiError, name);
          assert.equal(error.status, 200, name);
          assert.equal(error.code, "invalid_response", name);
          assert.equal(error.message, "The My Lessons response was invalid.", name);
          assert.ok(error.cause instanceof Error, name);
          return true;
        },
      );
    }
  });

  it("retains the JSON parser failure without exposing response content", async () => {
    const fetch = async () =>
      new Response("<html>SECRET_LESSON_DATA</html>", {
        headers: { "Content-Type": "text/html" },
        status: 200,
      });

    await assert.rejects(loadMyLessons({ fetch }), (error) => {
      assert.ok(error instanceof MyLessonsApiError);
      assert.equal(error.code, "invalid_response");
      assert.ok(error.cause instanceof SyntaxError);
      assert.equal(
        error.cause.message,
        "The My Lessons response was not valid JSON.",
      );
      assert.doesNotMatch(
        `${error.message} ${error.cause.message}`,
        /html|SECRET_LESSON_DATA/i,
      );
      return true;
    });
  });

  it("accepts optional timestamps and ignores unknown descriptor metadata", async () => {
    const lesson = createLessonScript();
    const request = jsonFetch({
      lessons: [
        {
          createdAt: "2026-08-21T00:00:00.000Z",
          futureMetadata: { keptByServer: true },
          id: "lesson-1",
          lesson,
          source: "uploaded",
          updatedAt: "2026-08-21T01:00:00.000Z",
        },
      ],
    });

    assert.deepEqual(await loadMyLessons({ fetch: request.fetch }), [
      {
        createdAt: "2026-08-21T00:00:00.000Z",
        id: "lesson-1",
        lesson,
        source: "uploaded",
        updatedAt: "2026-08-21T01:00:00.000Z",
      },
    ]);
  });

  it("updates an encoded learner lesson ID with a same-origin PUT request", async () => {
    const lesson = createLessonScript({ title: "Edited Garden Help" });
    const descriptor = { id: "lesson/id", lesson, source: "uploaded" };
    const update = jsonFetch({ lesson: descriptor, warnings: ["Draft warning"] });

    assert.deepEqual(
      await updateMyLesson("lesson/id", lesson, { fetch: update.fetch }),
      { lesson: descriptor, warnings: ["Draft warning"] },
    );
    assert.equal(update.calls[0][0], "/api/lessons/my/lesson%2Fid");
    assert.deepEqual(update.calls[0][1], {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson }),
      signal: undefined,
    });
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

    const listFailure = jsonFetch(
      {
        error: "database_unavailable",
        message: "D1 binding LESSON_DB is missing.",
      },
      500,
    );
    await assert.rejects(
      loadMyLessons({ fetch: listFailure.fetch }),
      (error) => {
        assert.ok(error instanceof MyLessonsApiError);
        assert.equal(error.status, 500);
        assert.equal(error.code, "database_unavailable");
        assert.equal(error.message, "D1 binding LESSON_DB is missing.");
        return true;
      },
    );

    const malformedFailure = async () =>
      new Response("<html>SECRET_SERVER_DETAIL</html>", {
        headers: { "Content-Type": "text/html" },
        status: 500,
      });
    await assert.rejects(loadMyLessons({ fetch: malformedFailure }), (error) => {
      assert.ok(error instanceof MyLessonsApiError);
      assert.equal(error.status, 500);
      assert.equal(error.code, "request_failed");
      assert.ok(error.cause instanceof SyntaxError);
      assert.equal(
        error.cause.message,
        "The My Lessons response was not valid JSON.",
      );
      assert.doesNotMatch(
        `${error.message} ${error.cause.message}`,
        /html|SECRET_SERVER_DETAIL/i,
      );
      return true;
    });
  });
});
