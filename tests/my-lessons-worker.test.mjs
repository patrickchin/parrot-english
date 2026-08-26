import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { createDatabase } from "../worker/database.ts";
import { handleMyLessonRequest } from "../worker/my-lessons.ts";
import { createMyLessonRepository } from "../worker/my-lessons-repository.ts";
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
    "INSERT INTO learner_profile (id, auth_user_id, name, onboarding_status, created_at, updated_at) VALUES (?, ?, ?, 'completed', ?, ?)",
  );
  insertProfile.run("profile-1", "user-1", "Mia", 1_000, 1_000);
  insertProfile.run("profile-2", "user-2", "Noah", 1_000, 1_000);
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
        userId: options.userId ?? "user-1",
        userName: "Parent",
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

  it("updates an owned lesson with lenient repairs while preserving its source", async () => {
    const state = seedDatabase();
    try {
      await call(state, "/api/lessons/my", "POST", {
        source: "uploaded",
        lesson: createLessonScript(),
      });

      const response = await call(state, "/api/lessons/my/lesson-1", "PUT", {
        lesson: {
          title: "Edited Garden Help",
          scenes: [
            {
              background: "unknown-background",
              steps: [{ speaker: "mystery", dialogue: "Edited dialogue" }],
            },
          ],
        },
      });

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.lesson.id, "lesson-1");
      assert.equal(payload.lesson.source, "uploaded");
      assert.equal(payload.lesson.lesson.title, "Edited Garden Help");
      assert.equal(payload.lesson.lesson.scenes[0].background, "episode-garden");
      assert.equal(payload.lesson.lesson.scenes[0].steps[0].speaker, "narrator");
      const storedJson = state.sqlite
        .prepare("SELECT lesson_json FROM learner_lesson WHERE id = ?")
        .get("lesson-1").lesson_json;
      assert.equal(
        payload.lesson.revision,
        createHash("sha256").update(storedJson).digest("hex"),
      );
      const generations = state.sqlite
        .prepare(
          `SELECT recording_generation AS generation,
                  recording_cleanup_before_generation AS pending
           FROM learner_lesson WHERE id = ?`,
        )
        .get("lesson-1");
      assert.equal(generations.generation, 1);
      assert.equal(generations.pending, null);
      assert.ok(payload.warnings.some((warning) => /background/i.test(warning)));
      assert.equal(
        JSON.parse(
          state.sqlite
            .prepare("SELECT lesson_json FROM learner_lesson WHERE id = ?")
            .get("lesson-1").lesson_json,
        ).title,
        "Edited Garden Help",
      );
    } finally {
      state.close();
    }
  });

  it("does not update a lesson owned by another user", async () => {
    const state = seedDatabase();
    try {
      await call(state, "/api/lessons/my", "POST", {
        source: "uploaded",
        lesson: createLessonScript(),
      });

      const response = await call(
        state,
        "/api/lessons/my/lesson-1",
        "PUT",
        { lesson: createLessonScript({ title: "Stolen edit" }) },
        { userId: "user-2" },
      );

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "not_found" });
      assert.equal(
        JSON.parse(
          state.sqlite
            .prepare("SELECT lesson_json FROM learner_lesson WHERE id = ?")
            .get("lesson-1").lesson_json,
        ).title,
        "Garden Help",
      );
    } finally {
      state.close();
    }
  });

  it("purges every page below the exact edited My Lesson recording prefix", async () => {
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
      const deletions = [];
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
              etag: "etag-2",
              key: `${prefix}scene-4/step-1.audio`,
              version: "version-2",
            }],
            truncated: false,
          },
        ],
      ]);
      const bucket = {
        async delete(keys) { deletions.push(keys); },
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
        "PUT",
        { lesson: createLessonScript({ title: "Edited lesson" }) },
        { bucket },
      );

      assert.equal(response.status, 200);
      assert.deepEqual(lists, [
        { include: ["customMetadata"], prefix },
        { cursor: "page-2", include: ["customMetadata"], prefix },
      ]);
      assert.deepEqual(deletions, []);
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
    } finally {
      state.close();
    }
  });

  it("keeps failed edit cleanup durable and reconciles it on a later detail load", async () => {
    const state = seedDatabase();
    try {
      await call(state, "/api/lessons/my", "POST", {
        source: "uploaded",
        lesson: createLessonScript(),
      });
      const response = await call(
        state,
        "/api/lessons/my/lesson-1",
        "PUT",
        { lesson: createLessonScript({ title: "Edited before purge" }) },
        {
          bucket: {
            async delete() {},
            async list() { throw new Error("R2 purge failed"); },
          },
        },
      );

      assert.equal(response.status, 200);
      assert.equal(
        JSON.parse(
          state.sqlite
            .prepare("SELECT lesson_json FROM learner_lesson WHERE id = ?")
            .get("lesson-1").lesson_json,
        ).title,
        "Edited before purge",
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
      const first = await repository.updateOwned(
        "lesson-1",
        "user-1",
        createLessonScript({ title: "First edit" }),
      );
      assert.equal(first.recordingGeneration, 1);
      assert.equal(first.recordingCleanupBeforeGeneration, 1);
      const later = await repository.updateOwned(
        "lesson-1",
        "user-1",
        createLessonScript({ title: "Later edit" }),
      );
      assert.equal(later.recordingGeneration, 2);
      assert.equal(later.recordingCleanupBeforeGeneration, 2);

      assert.equal(
        await repository.clearRecordingCleanup("lesson-1", "user-1", 1),
        false,
      );
      const retained = await repository.findOwned("lesson-1", "user-1");
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
      assert.equal(payload.lesson.childName, "Mia");
      assert.deepEqual(payload.warnings, ["Generated warning"]);
      assert.equal(calls[0].topic, "buying a train ticket");
      assert.equal(calls[0].childName, "Mia");
      assert.equal(
        state.sqlite.prepare("SELECT count(*) AS count FROM learner_lesson").get().count,
        0,
      );
    } finally {
      state.close();
    }
  });
});
