import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDatabase } from "../worker/database.ts";
import { handleMyLessonRequest } from "../worker/my-lessons.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";
import { createLessonScript } from "./fixtures/lesson-script.mjs";

function seedDatabase() {
  const state = createTestD1Database();
  const insertUser = state.sqlite.prepare(
    "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
  );
  insertUser.run("user-1", "Parent One", "one@example.test", 1_000, 1_000);
  insertUser.run("user-2", "Parent Two", "two@example.test", 1_000, 1_000);
  state.sqlite.exec("DROP INDEX learner_profile_auth_user_id_unique");
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

function call(state, path, method = "GET", body, options = {}) {
  const userId = options.userId ?? "user-1";
  return handleMyLessonRequest(
    {
      database: state.database,
      env: { DB: state.d1, GROQ_API_KEY: "test-key" },
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
      assert.equal((await owned.json()).lesson.lesson.childName, "Mia");

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

  it("does not update a null-profile compatibility lesson", async () => {
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
      const storedLesson = state.sqlite.prepare(
        "SELECT lesson_json, updated_at FROM learner_lesson WHERE id = ?",
      );
      const before = storedLesson.get("legacy-lesson");

      const response = await call(
        state,
        "/api/lessons/my/legacy-lesson",
        "PUT",
        { lesson: createLessonScript({ title: "Rewritten legacy lesson" }) },
      );

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "not_found" });
      assert.deepEqual(storedLesson.get("legacy-lesson"), before);
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

  it("does not update a lesson owned by a same-account sibling", async () => {
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
        {
          learnerProfileId: "learner-b",
          learnerName: "Leo",
          legacyStorageOwner: false,
        },
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
