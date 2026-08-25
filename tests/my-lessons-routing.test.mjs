import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDatabase } from "../worker/database.ts";
import { createGuardianAccessRepository } from "../worker/guardian-access.ts";
import { createWorker } from "../worker/index.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

function authStub(session) {
  return {
    api: { async getSession() { return session; } },
    async handler() { return new Response("auth"); },
  };
}

function environment() {
  return {
    ASSETS: { async fetch() { return new Response("asset"); } },
    DB: {},
  };
}

function authenticatedEnvironment() {
  const state = createTestD1Database();
  const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
  state.sqlite
    .prepare(
      "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
    )
    .run("user-1", "Parent", "parent@example.test", timestamp, timestamp);
  state.sqlite
    .prepare(
      "INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      "session-1",
      timestamp + 86_400_000,
      "token-1",
      timestamp,
      timestamp,
      "user-1",
    );
  state.sqlite
    .prepare(
      `INSERT INTO learner_profile
        (id, auth_user_id, name, onboarding_status, created_at, updated_at)
       VALUES (?, ?, ?, 'not_started', ?, ?)`,
    )
    .run("learner-a", "user-1", "Mia", timestamp, timestamp);
  return {
    state,
    env: { ...environment(), DB: state.d1 },
    database: createDatabase(state.d1),
  };
}

describe("My Lessons Worker routing", () => {
  it("rejects anonymous list, create, generation, and detail requests", async () => {
    let handlerCalls = 0;
    const worker = createWorker({
      createAuth: () => authStub(null),
      async handleMyLessonRequest() {
        handlerCalls += 1;
        return Response.json({ ok: true });
      },
    });

    for (const [method, path] of [
      ["GET", "/api/lessons/my"],
      ["POST", "/api/lessons/my"],
      ["POST", "/api/lessons/my/generate"],
      ["GET", "/api/lessons/my/lesson-1"],
    ]) {
      const response = await worker.fetch(
        new Request(`https://example.test${path}`, { method }),
        environment(),
      );
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.deepEqual(await response.json(), { error: "unauthorized" });
    }
    assert.equal(handlerCalls, 0);
  });

  it("passes authenticated identity and D1 to the My Lessons handler", async () => {
    const calls = [];
    const session = {
      session: { id: "session-1" },
      user: { id: "user-1", name: "Parent", email: "parent@example.test" },
    };
    const worker = createWorker({
      createAuth: () => authStub(session),
      async handleMyLessonRequest(input) {
        calls.push(input);
        return Response.json({ routed: true });
      },
    });
    const { state, env } = authenticatedEnvironment();
    try {
      const request = new Request("https://example.test/api/lessons/my");

      const response = await worker.fetch(request, env);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { routed: true });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].request, request);
      assert.equal(calls[0].database.$client, env.DB);
      assert.deepEqual(calls[0].identity, {
        sessionId: "session-1",
        userId: "user-1",
        userName: "Parent",
        learnerProfileId: "learner-a",
        learnerName: "Mia",
        legacyStorageOwner: true,
      });
    } finally {
      state.close();
    }
  });

  it("keeps same-account sibling lesson lists isolated through Worker routing", async () => {
    const { state, env } = authenticatedEnvironment();
    const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
    try {
      state.sqlite
        .prepare(
          `INSERT INTO session
            (id, expires_at, token, created_at, updated_at, user_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "session-2",
          timestamp + 86_400_000,
          "token-2",
          timestamp,
          timestamp,
          "user-1",
        );
      state.sqlite
        .prepare(
          `INSERT INTO learner_profile
            (id, auth_user_id, legacy_storage_owner, name, onboarding_status, created_at, updated_at)
           VALUES (?, ?, 0, ?, 'not_started', ?, ?)`,
        )
        .run("learner-b", "user-1", "Leo", timestamp, timestamp);
      const insertSelection = state.sqlite.prepare(
        `INSERT INTO session_learner_selection
          (session_id, auth_user_id, learner_profile_id, created_at, updated_at)
         VALUES (?, 'user-1', ?, ?, ?)`,
      );
      insertSelection.run("session-1", "learner-a", timestamp, timestamp);
      insertSelection.run("session-2", "learner-b", timestamp, timestamp);
      const insertLesson = state.sqlite.prepare(
        `INSERT INTO learner_lesson
          (id, auth_user_id, learner_profile_id, source, lesson_json, created_at, updated_at)
         VALUES (?, 'user-1', ?, 'uploaded', '{}', ?, ?)`,
      );
      insertLesson.run("lesson-a", "learner-a", timestamp, timestamp);
      insertLesson.run("lesson-b", "learner-b", timestamp, timestamp);

      const workerFor = (sessionId) =>
        createWorker({
          createAuth: () =>
            authStub({
              session: { id: sessionId },
              user: { id: "user-1", name: "Parent", email: "parent@example.test" },
            }),
        });

      const learnerA = await workerFor("session-1").fetch(
        new Request("https://example.test/api/lessons/my"),
        env,
      );
      const learnerB = await workerFor("session-2").fetch(
        new Request("https://example.test/api/lessons/my"),
        env,
      );

      assert.deepEqual(
        (await learnerA.json()).lessons.map(({ id }) => id),
        ["lesson-a"],
      );
      assert.deepEqual(
        (await learnerB.json()).lessons.map(({ id }) => id),
        ["lesson-b"],
      );
    } finally {
      state.close();
    }
  });

  it("rate limits generation before invoking its handler", async () => {
    let handlerCalls = 0;
    let limiterCalls = 0;
    const session = {
      session: { id: "session-1" },
      user: { id: "user-1", name: "Parent", email: "parent@example.test" },
    };
    const { state, env, database } = authenticatedEnvironment();
    try {
      const worker = createWorker({
        createAuth: () => authStub(session),
        async checkLessonGenerationRateLimit(_request, _env, userId) {
          limiterCalls += 1;
          assert.equal(userId, "user-1");
          return Response.json({ error: "rate_limited" }, { status: 429 });
        },
        async handleMyLessonRequest() {
          handlerCalls += 1;
          return Response.json({ ok: true });
        },
      });

      const locked = await worker.fetch(
        new Request("https://example.test/api/lessons/my/generate", {
          method: "POST",
        }),
        env,
      );
      assert.equal(locked.status, 403);
      assert.deepEqual(await locked.json(), { error: "guardian_required" });
      assert.equal(limiterCalls, 0);
      assert.equal(handlerCalls, 0);

      await createGuardianAccessRepository(database).unlock("session-1");
      const response = await worker.fetch(
        new Request("https://example.test/api/lessons/my/generate", {
          method: "POST",
        }),
        env,
      );

      assert.equal(response.status, 429);
      assert.equal(limiterCalls, 1);
      assert.equal(handlerCalls, 0);
    } finally {
      state.close();
    }
  });
});
