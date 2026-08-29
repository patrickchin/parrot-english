import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { createDatabase } from "../worker/database.ts";
import { handleMyLessonRequest } from "../worker/my-lessons.ts";
import { createMyLessonRepository } from "../worker/my-lessons-repository.ts";
import { resolveLessonRecordingTarget } from "../worker/lesson-recording-catalog.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";
import { createLessonScript } from "./fixtures/lesson-script.mjs";

function seedDatabase() {
  const state = createTestD1Database();
  const insertUser = state.sqlite.prepare(
    "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
  );
  insertUser.run("user-1", "Parent One", "one@example.test", 1_000, 1_000);
  insertUser.run("user-2", "Parent Two", "two@example.test", 1_000, 1_000);
  const insertProfile = state.sqlite.prepare(
    "INSERT INTO learner_profile (id, auth_user_id, legacy_storage_owner, name, onboarding_status, created_at, updated_at) VALUES (?, ?, ?, ?, 'completed', ?, ?)",
  );
  insertProfile.run("learner-a", "user-1", 1, "Mia", 1_000, 1_000);
  insertProfile.run("learner-b", "user-1", 0, "Leo", 1_000, 1_000);
  insertProfile.run("learner-c", "user-2", 1, "Noah", 1_000, 1_000);
  return { ...state, database: createDatabase(state.d1) };
}

function request(path, method = "GET", body) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function emptyRecordingBucket() {
  return {
    async delete() {},
    async list() {
      return { objects: [], truncated: false };
    },
  };
}

function call(state, path, method = "GET", body, options = {}) {
  const userId = options.userId ?? "user-1";
  return handleMyLessonRequest(
    {
      database: state.database,
      env: {
        DB: state.d1,
        GROQ_API_KEY: "test-key",
        PERSONALIZED_STORY_ART_BUCKET:
          options.bucket ?? emptyRecordingBucket(),
      },
      identity: {
        sessionId: "session-1",
        userId,
        userName: "Parent",
        learnerProfileId:
          options.learnerProfileId ??
          (userId === "user-1" ? "learner-a" : "learner-c"),
        learnerName:
          "learnerName" in options
            ? options.learnerName
            : userId === "user-1"
              ? "Mia"
              : "Noah",
        legacyStorageOwner: options.legacyStorageOwner ?? true,
      },
      request: request(path, method, body),
    },
    {
      createId: options.createId ?? (() => "lesson-1"),
      generateLesson: options.generateLesson,
      now: () => new Date("2026-07-14T08:00:00.000Z"),
      wait: options.wait,
    },
  );
}

describe("My Lessons persistence and API", () => {
  it("saves a validated uploaded lesson and returns a playable descriptor", async () => {
    const state = seedDatabase();
    try {
      const response = await call(state, "/api/lessons/my", "POST", {
        source: "uploaded",
        lesson: createLessonScript(),
      });

      assert.equal(response.status, 201);
      const payload = await response.json();
      assert.equal(payload.lesson.id, "lesson-1");
      assert.equal(payload.lesson.source, "uploaded");
      assert.equal(payload.lesson.lesson.title, "Garden Help");
      const stored = state.sqlite
        .prepare("SELECT * FROM learner_lesson WHERE id = ?")
        .get("lesson-1");
      assert.equal(stored.auth_user_id, "user-1");
      assert.equal(stored.learner_profile_id, "learner-a");
      assert.equal(JSON.parse(stored.lesson_json).title, "Garden Help");
      assert.equal(
        payload.lesson.revision,
        createHash("sha256").update(stored.lesson_json).digest("hex"),
      );
    } finally {
      state.close();
    }
  });

  it("normalizes recoverable uploaded script problems and returns warnings", async () => {
    const state = seedDatabase();
    try {
      const response = await call(state, "/api/lessons/my", "POST", {
        source: "uploaded",
        lesson: {
          scenes: [
            {
              background: "unknown-background",
              steps: [{ speaker: "mystery", dialogue: "Hello!" }],
            },
          ],
        },
      });

      assert.equal(response.status, 201);
      const payload = await response.json();
      assert.equal(payload.lesson.lesson.title, "Untitled lesson");
      assert.equal(payload.lesson.lesson.scenes[0].background, "episode-garden");
      assert.equal(payload.lesson.lesson.scenes[0].steps[0].speaker, "narrator");
      assert.ok(payload.warnings.some((warning) => /background/i.test(warning)));
      assert.ok(payload.warnings.some((warning) => /speaker/i.test(warning)));
    } finally {
      state.close();
    }
  });

  it("rejects uploaded scripts with no playable dialogue", async () => {
    const state = seedDatabase();
    try {
      const response = await call(state, "/api/lessons/my", "POST", {
        source: "uploaded",
        lesson: { scenes: [{ steps: [] }] },
      });

      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, "invalid_lesson");
    } finally {
      state.close();
    }
  });

  it("lists and loads only lessons owned by the authenticated user", async () => {
    const state = seedDatabase();
    try {
      await call(state, "/api/lessons/my", "POST", {
        source: "uploaded",
        lesson: createLessonScript(),
      });
      await call(
        state,
        "/api/lessons/my",
        "POST",
        { source: "generated", lesson: createLessonScript({ childName: "Noah" }) },
        { userId: "user-2", createId: () => "lesson-2" },
      );

      const listResponse = await call(state, "/api/lessons/my");
      const listPayload = await listResponse.json();
      assert.deepEqual(listPayload.lessons.map(({ id }) => id), ["lesson-1"]);

      const owned = await call(state, "/api/lessons/my/lesson-1");
      assert.equal(owned.status, 200);
      const ownedLesson = (await owned.json()).lesson;
      assert.equal(ownedLesson.lesson.childName, "Mia");
      const storedJson = state.sqlite
        .prepare("SELECT lesson_json FROM learner_lesson WHERE id = ?")
        .get("lesson-1").lesson_json;
      assert.equal(
        ownedLesson.revision,
        createHash("sha256").update(storedJson).digest("hex"),
      );

      const otherOwner = await call(state, "/api/lessons/my/lesson-2");
      assert.equal(otherOwner.status, 404);
      assert.deepEqual(await otherOwner.json(), { error: "not_found" });
    } finally {
      state.close();
    }
  });

  it("lists and loads only lessons owned by the selected same-account sibling", async () => {
    const state = seedDatabase();
    try {
      await call(
        state,
        "/api/lessons/my",
        "POST",
        { source: "uploaded", lesson: createLessonScript() },
        { createId: () => "lesson-a" },
      );
      await call(
        state,
        "/api/lessons/my",
        "POST",
        { source: "uploaded", lesson: createLessonScript({ childName: "Leo" }) },
        {
          createId: () => "lesson-b",
          learnerProfileId: "learner-b",
          learnerName: "Leo",
          legacyStorageOwner: false,
        },
      );

      const listResponse = await call(state, "/api/lessons/my");
      assert.deepEqual(
        (await listResponse.json()).lessons.map(({ id }) => id),
        ["lesson-a"],
      );

      const siblingLesson = await call(state, "/api/lessons/my/lesson-b");
      assert.equal(siblingLesson.status, 404);
    } finally {
      state.close();
    }
  });

  it("rejects malformed or unsafe detail IDs without mutating lessons or recordings", async () => {
    const state = seedDatabase();
    const lists = [];
    try {
      await call(state, "/api/lessons/my", "POST", {
        source: "uploaded",
        lesson: createLessonScript(),
      });

      for (const [method, path] of [
        ["GET", "/api/lessons/my/%E0%A4%A"],
        ["DELETE", "/api/lessons/my/%E0%A4%A"],
        ["GET", "/api/lessons/my/%20"],
        ["DELETE", "/api/lessons/my/%20"],
      ]) {
        const response = await call(state, path, method, undefined, {
          bucket: {
            async list(options) {
              lists.push(options);
              return { objects: [], truncated: false };
            },
          },
        });
        assert.equal(response.status, 404, `${method} ${path}`);
        assert.deepEqual(
          await response.json(),
          { error: "not_found" },
          `${method} ${path}`,
        );
      }

      assert.deepEqual(lists, []);
      assert.equal(
        state.sqlite
          .prepare("SELECT COUNT(*) AS count FROM learner_lesson WHERE id = ?")
          .get("lesson-1").count,
        1,
      );
    } finally {
      state.close();
    }
  });

  it("shows null-profile legacy lessons only to the marked legacy learner", async () => {
    const state = seedDatabase();
    try {
      state.sqlite
        .prepare(
          `INSERT INTO learner_lesson
            (id, auth_user_id, learner_profile_id, source, lesson_json, created_at, updated_at)
           VALUES (?, ?, NULL, 'uploaded', ?, ?, ?)`,
        )
        .run(
          "legacy-lesson",
          "user-1",
          JSON.stringify(createLessonScript()),
          1_000,
          1_000,
        );

      const legacyList = await call(state, "/api/lessons/my");
      assert.deepEqual(
        (await legacyList.json()).lessons.map(({ id }) => id),
        ["legacy-lesson"],
      );

      const siblingOptions = {
        learnerProfileId: "learner-b",
        learnerName: "Leo",
        legacyStorageOwner: false,
      };
      const siblingList = await call(
        state,
        "/api/lessons/my",
        "GET",
        undefined,
        siblingOptions,
      );
      assert.deepEqual((await siblingList.json()).lessons, []);
      const siblingDetail = await call(
        state,
        "/api/lessons/my/legacy-lesson",
        "GET",
        undefined,
        siblingOptions,
      );
      assert.equal(siblingDetail.status, 404);
    } finally {
      state.close();
    }
  });

  it("does not delete a null-profile compatibility lesson", async () => {
    const state = seedDatabase();
    try {
      state.sqlite
        .prepare(
          `INSERT INTO learner_lesson
            (id, auth_user_id, learner_profile_id, source, lesson_json, created_at, updated_at)
           VALUES (?, ?, NULL, 'uploaded', ?, ?, ?)`,
        )
        .run(
          "legacy-lesson",
          "user-1",
          JSON.stringify(createLessonScript()),
          1_000,
          1_000,
        );
      const response = await call(
        state,
        "/api/lessons/my/legacy-lesson",
        "DELETE",
      );

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "not_found" });
      assert.equal(
        state.sqlite
          .prepare("SELECT COUNT(*) AS count FROM learner_lesson WHERE id = ?")
          .get("legacy-lesson").count,
        1,
      );
    } finally {
      state.close();
    }
  });

  it("deletes an owned lesson and returns no content", async () => {
    const state = seedDatabase();
    try {
      await call(state, "/api/lessons/my", "POST", {
        source: "uploaded",
        lesson: createLessonScript(),
      });

      const response = await call(state, "/api/lessons/my/lesson-1", "DELETE");

      assert.equal(
        response.status,
        204,
      );
      assert.equal(
        state.sqlite
          .prepare("SELECT COUNT(*) AS count FROM learner_lesson WHERE id = ?")
          .get("lesson-1").count,
        0,
      );
    } finally {
      state.close();
    }
  });

  it("does not delete a lesson owned by a same-account sibling", async () => {
    const state = seedDatabase();
    try {
      await call(state, "/api/lessons/my", "POST", {
        source: "uploaded",
        lesson: createLessonScript(),
      });

      const response = await call(
        state,
        "/api/lessons/my/lesson-1",
        "DELETE",
        undefined,
        {
          learnerProfileId: "learner-b",
          learnerName: "Leo",
          legacyStorageOwner: false,
        },
      );

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "not_found" });
      assert.equal(
        state.sqlite
          .prepare("SELECT COUNT(*) AS count FROM learner_lesson WHERE id = ?")
          .get("lesson-1").count,
        1,
      );
    } finally {
      state.close();
    }
  });

  it("purges every page below the exact deleted My Lesson recording prefix", async () => {
    const state = seedDatabase();
    try {
      await call(
        state,
        "/api/lessons/my",
        "POST",
        { source: "uploaded", lesson: createLessonScript() },
        { createId: () => "lesson/one" },
      );
      const prefix =
        "personalized-story-art/user-1/lesson-recordings/my/lesson%2Fone/";
      const lists = [];
      const writes = [];
      const pages = new Map([
        [
          "",
          {
            cursor: "page-2",
            objects: [{
              etag: "etag-1",
              key: `${prefix}scene-0/step-1.audio`,
              version: "version-1",
            }],
            truncated: true,
          },
        ],
        [
          "page-2",
          {
            objects: [{
              customMetadata: { lessonGeneration: String(Number.MAX_SAFE_INTEGER) },
              etag: "etag-2",
              key: `${prefix}scene-4/step-1.audio`,
              version: "version-2",
            }],
            truncated: false,
          },
        ],
      ]);
      const bucket = {
        async list(options) {
          lists.push(options);
          return pages.get(options.cursor ?? "");
        },
        async put(key, _value, options) {
          writes.push({ key, options });
          return { etag: `fence-${writes.length}`, key };
        },
      };

      const response = await call(
        state,
        "/api/lessons/my/lesson%2Fone",
        "DELETE",
        undefined,
        { bucket },
      );

      assert.equal(response.status, 204);
      assert.deepEqual(lists, [
        { include: ["customMetadata"], prefix },
        { cursor: "page-2", include: ["customMetadata"], prefix },
      ]);
      assert.deepEqual(writes.map(({ key, options }) => ({
        key,
        onlyIf: options.onlyIf,
      })), [
        {
          key: `${prefix}scene-0/step-1.audio`,
          onlyIf: { etagMatches: "etag-1" },
        },
        {
          key: `${prefix}scene-4/step-1.audio`,
          onlyIf: { etagMatches: "etag-2" },
        },
      ]);
      assert.equal(
        state.sqlite
          .prepare("SELECT COUNT(*) AS count FROM learner_lesson WHERE id = ?")
          .get("lesson/one").count,
        0,
      );
    } finally {
      state.close();
    }
  });

  it("retains the lesson when recording cleanup fails", async () => {
    const state = seedDatabase();
    try {
      await call(state, "/api/lessons/my", "POST", {
        source: "uploaded",
        lesson: createLessonScript(),
      });

      const response = await call(
        state,
        "/api/lessons/my/lesson-1",
        "DELETE",
        undefined,
        {
          bucket: {
            async list() { throw new Error("R2 purge failed"); },
          },
        },
      );

      assert.equal(response.status, 500);
      assert.equal((await response.json()).error, "internal_error");
      assert.equal(
        state.sqlite
          .prepare(
            "SELECT recording_generation AS generation FROM learner_lesson WHERE id = ?",
          )
          .get("lesson-1").generation,
        -1,
      );
      assert.equal(
        await resolveLessonRecordingTarget(
          state.database,
          {
            sessionId: "session-1",
            userId: "user-1",
            userName: "Parent",
            learnerProfileId: "learner-a",
            learnerName: "Mia",
            legacyStorageOwner: true,
          },
          {
            source: "my",
            lessonId: "lesson-1",
            sceneIndex: 0,
            stepIndex: 1,
          },
        ),
        null,
      );
      assert.equal(
        state.sqlite
          .prepare("SELECT COUNT(*) AS count FROM learner_lesson WHERE id = ?")
          .get("lesson-1").count,
        1,
      );

      const retried = await call(
        state,
        "/api/lessons/my/lesson-1",
        "DELETE",
        undefined,
        { bucket: emptyRecordingBucket() },
      );
      assert.equal(retried.status, 204);
    } finally {
      state.close();
    }
  });

  it("purges a deleted sibling lesson only below that learner's recording subtree", async () => {
    const state = seedDatabase();
    const sibling = {
      learnerProfileId: "learner-b",
      learnerName: "Leo",
      legacyStorageOwner: false,
    };
    try {
      await call(
        state,
        "/api/lessons/my",
        "POST",
        { source: "uploaded", lesson: createLessonScript({ childName: "Leo" }) },
        { ...sibling, createId: () => "sibling/lesson" },
      );
      const prefix =
        "personalized-story-art/user-1/learners/learner-b/lesson-recordings/my/sibling%2Flesson/";
      const lists = [];
      const response = await call(
        state,
        "/api/lessons/my/sibling%2Flesson",
        "DELETE",
        undefined,
        {
          ...sibling,
          bucket: {
            async list(options) {
              lists.push(options);
              return {
                objects: [{
                  etag: "sibling-etag",
                  key: `${prefix}scene-0/step-1.audio`,
                  version: "sibling-version",
                }],
                truncated: false,
              };
            },
            async put(key) { return { etag: "fence", key }; },
          },
          wait: async () => {},
        },
      );

      assert.equal(response.status, 204);
      assert.deepEqual(lists, [{ include: ["customMetadata"], prefix }]);
    } finally {
      state.close();
    }
  });

  it("reconciles a seeded pending recording cleanup on a later detail load", async () => {
    const state = seedDatabase();
    try {
      await call(state, "/api/lessons/my", "POST", {
        source: "uploaded",
        lesson: createLessonScript(),
      });
      state.sqlite
        .prepare(
          `UPDATE learner_lesson
           SET recording_generation = 1,
               recording_cleanup_before_generation = 1,
               lesson_json = ?
           WHERE id = ?`,
        )
        .run(
          JSON.stringify(createLessonScript({ title: "Edited before purge" })),
          "lesson-1",
        );
      assert.deepEqual(
        { ...state.sqlite
          .prepare(
            `SELECT recording_generation AS generation,
                    recording_cleanup_before_generation AS pending
             FROM learner_lesson WHERE id = ?`,
          )
          .get("lesson-1") },
        { generation: 1, pending: 1 },
      );

      const writes = [];
      const loaded = await call(
        state,
        "/api/lessons/my/lesson-1",
        "GET",
        undefined,
        {
          bucket: {
            async list() {
              return {
                objects: [{
                  etag: "old-etag",
                  key: "personalized-story-art/user-1/lesson-recordings/my/lesson-1/old.audio",
                  version: "old-version",
                }],
                truncated: false,
              };
            },
            async put(key, _value, options) {
              writes.push({ key, options });
              return { etag: "fence", key };
            },
          },
          wait: async () => {},
        },
      );

      assert.equal(loaded.status, 200);
      assert.equal((await loaded.json()).lesson.lesson.title, "Edited before purge");
      assert.equal(writes.length, 1);
      assert.equal(
        state.sqlite
          .prepare(
            `SELECT recording_cleanup_before_generation AS pending
             FROM learner_lesson WHERE id = ?`,
          )
          .get("lesson-1").pending,
        null,
      );
    } finally {
      state.close();
    }
  });

  it("never clears a later lesson cleanup boundary with an older reconciliation", async () => {
    const state = seedDatabase();
    try {
      await call(state, "/api/lessons/my", "POST", {
        source: "uploaded",
        lesson: createLessonScript(),
      });
      const repository = createMyLessonRepository(state.database);
      const identity = {
        sessionId: "session-1",
        userId: "user-1",
        userName: "Parent",
        learnerProfileId: "learner-a",
        learnerName: "Mia",
        legacyStorageOwner: true,
      };
      state.sqlite
        .prepare(
          `UPDATE learner_lesson
           SET recording_generation = 2,
               recording_cleanup_before_generation = 2
           WHERE id = ?`,
        )
        .run("lesson-1");

      assert.equal(
        await repository.clearRecordingCleanup("lesson-1", identity, 1),
        false,
      );
      const retained = await repository.findOwned("lesson-1", identity);
      assert.equal(retained.recordingGeneration, 2);
      assert.equal(retained.recordingCleanupBeforeGeneration, 2);
    } finally {
      state.close();
    }
  });

  it("generates a validated preview with the canonical learner name without saving", async () => {
    const state = seedDatabase();
    const calls = [];
    try {
      const response = await call(
        state,
        "/api/lessons/my/generate",
        "POST",
        { topic: "buying a train ticket" },
        {
          learnerProfileId: "learner-b",
          learnerName: "Leo",
          legacyStorageOwner: false,
          generateLesson(input) {
            calls.push(input);
            return Promise.resolve({
              lesson: createLessonScript({ childName: input.childName }),
              warnings: ["Generated warning"],
            });
          },
        },
      );

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.lesson.childName, "Leo");
      assert.deepEqual(payload.warnings, ["Generated warning"]);
      assert.equal(calls[0].topic, "buying a train ticket");
      assert.equal(calls[0].childName, "Leo");
      assert.equal(
        state.sqlite.prepare("SELECT count(*) AS count FROM learner_lesson").get().count,
        0,
      );
    } finally {
      state.close();
    }
  });

  it("does not fall back to the Guardian account name for lesson generation", async () => {
    const state = seedDatabase();
    let generationCalls = 0;
    try {
      const response = await call(
        state,
        "/api/lessons/my/generate",
        "POST",
        { topic: "buying a train ticket" },
        {
          learnerName: null,
          generateLesson() {
            generationCalls += 1;
            return Promise.resolve({ lesson: createLessonScript(), warnings: [] });
          },
        },
      );

      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, "learner_name_required");
      assert.equal(generationCalls, 0);
    } finally {
      state.close();
    }
  });
});
