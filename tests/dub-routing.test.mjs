import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDatabase } from "../worker/database.ts";
import { createGuardianAccessRepository } from "../worker/guardian-access.ts";
import { createWorker } from "../worker/index.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const DUB_PATH = "/api/dubs/five-little-ducks-v2";

function authStub(session, sessionCalls) {
  return {
    api: {
      async getSession() {
        sessionCalls.push(true);
        return session;
      },
    },
    async handler() {
      return new Response("auth");
    },
  };
}

function environment() {
  let assetCalls = 0;
  return {
    env: {
      ASSETS: {
        async fetch() {
          assetCalls += 1;
          return new Response("asset");
        },
      },
      DB: {},
      PERSONALIZED_STORY_ART_BUCKET: {
        async delete() {},
        async get() { return null; },
        async list() { return { objects: [], truncated: false }; },
        async put() {},
      },
    },
    getAssetCalls: () => assetCalls,
  };
}

function authenticatedEnvironment() {
  const state = createTestD1Database();
  const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
  state.sqlite.prepare(
    `INSERT INTO user
      (id, name, email, email_verified, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ).run("user-1", "Parent", "parent@example.test", timestamp, timestamp);
  state.sqlite.prepare(
    `INSERT INTO session
      (id, expires_at, token, created_at, updated_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    "session-1",
    timestamp + 86_400_000,
    "token-1",
    timestamp,
    timestamp,
    "user-1",
  );
  state.sqlite.prepare(
    `INSERT INTO learner_profile
      (id, auth_user_id, name, onboarding_status, created_at, updated_at)
     VALUES (?, ?, ?, 'not_started', ?, ?)`,
  ).run("learner-a", "user-1", "Mia", timestamp, timestamp);
  const result = environment();
  result.env.DB = state.d1;
  return { ...result, state };
}

function request(method, path, body) {
  const init = body === undefined ? { method } : { body, method };
  return new Request(`https://example.test${path}`, init);
}

describe("dub Worker routing", () => {
  it("guards only guardian dub mutations before the domain handler", async () => {
    const state = createTestD1Database();
    try {
      const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
      state.sqlite.prepare(
        `INSERT INTO user
          (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
      ).run("user-1", "Guardian", "guardian@example.test", timestamp, timestamp);
      state.sqlite.prepare(
        `INSERT INTO session
          (id, expires_at, token, created_at, updated_at, user_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        "session-1",
        timestamp + 86_400_000,
        "token-1",
        timestamp,
        timestamp,
        "user-1",
      );
      let handlerCalls = 0;
      const session = {
        session: { id: "session-1" },
        user: { id: "user-1", name: "Guardian" },
      };
      const worker = createWorker({
        createAuth: () => authStub(session, []),
        async handleDubRequest() {
          handlerCalls += 1;
          return Response.json({ routed: true });
        },
      });
      const { env } = environment();
      env.DB = state.d1;

      for (const [method, path] of [
        ["PUT", `${DUB_PATH}/consent`],
        ["DELETE", DUB_PATH],
      ]) {
        const response = await worker.fetch(request(method, path), env);
        assert.equal(response.status, 403, `${method} ${path}`);
        assert.deepEqual(await response.json(), { error: "guardian_required" });
      }
      assert.equal(handlerCalls, 0);

      for (const [method, path] of [
        ["PUT", "/api/dubs/five-little-ducks-v1/consent"],
        ["DELETE", "/api/dubs/five-little-ducks-v1"],
      ]) {
        const response = await worker.fetch(request(method, path), env);
        assert.equal(response.status, 200, `${method} ${path}`);
        assert.deepEqual(await response.json(), { routed: true });
      }
      assert.equal(handlerCalls, 2);

      for (const [method, path] of [
        ["GET", DUB_PATH],
        ["PUT", `${DUB_PATH}/lines/line-1`],
        ["GET", `${DUB_PATH}/lines/line-1/audio`],
      ]) {
        const response = await worker.fetch(request(method, path), env);
        assert.equal(response.status, 200, `${method} ${path}`);
        assert.deepEqual(await response.json(), { routed: true });
      }
      assert.equal(handlerCalls, 5);
    } finally {
      state.close();
    }
  });

  it("rejects encoded current-dub aliases before the handler while locked or unlocked", async () => {
    const state = createTestD1Database();
    try {
      const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
      state.sqlite.prepare(
        `INSERT INTO user
          (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
      ).run("user-1", "Guardian", "guardian@example.test", timestamp, timestamp);
      state.sqlite.prepare(
        `INSERT INTO session
          (id, expires_at, token, created_at, updated_at, user_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        "session-1",
        timestamp + 86_400_000,
        "token-1",
        timestamp,
        timestamp,
        "user-1",
      );
      let handlerCalls = 0;
      const worker = createWorker({
        createAuth: () => authStub({
          session: { id: "session-1" },
          user: { id: "user-1", name: "Guardian" },
        }, []),
        async handleDubRequest() {
          handlerCalls += 1;
          return new Response(null, { status: 204 });
        },
      });
      const { env } = environment();
      env.DB = state.d1;
      const aliases = [
        ["DELETE", "/api/dubs/%66ive-little-ducks-v2"],
        ["PUT", "/api/dubs/%66ive-little-ducks-v2/consent"],
        ["PUT", "/api/dubs/five-little-ducks-v2/%63onsent"],
      ];

      for (const mode of ["locked", "unlocked"]) {
        if (mode === "unlocked") {
          await createGuardianAccessRepository(createDatabase(state.d1)).unlock(
            "session-1",
          );
        }
        for (const [method, path] of aliases) {
          const response = await worker.fetch(request(method, path), env);
          assert.equal(response.status, 404, `${mode}: ${method} ${path}`);
          assert.equal(
            response.headers.get("Cache-Control"),
            "private, no-store",
          );
          assert.deepEqual(await response.json(), {
            error: "not_found",
            message: "not_found",
          });
        }
      }
      assert.equal(handlerCalls, 0);
    } finally {
      state.close();
    }
  });

  it("rejects anonymous dub status, upload, audio, delete, and mismatch routes", async () => {
    const sessionCalls = [];
    let handlerCalls = 0;
    const worker = createWorker({
      createAuth: () => authStub(null, sessionCalls),
      async handleDubRequest() {
        handlerCalls += 1;
        return Response.json({ ok: true });
      },
    });
    const { env, getAssetCalls } = environment();
    const routes = [
      ["GET", DUB_PATH],
      ["PUT", `${DUB_PATH}/lines/line-1`],
      ["GET", `${DUB_PATH}/lines/line-1/audio`],
      ["DELETE", DUB_PATH],
      ["POST", DUB_PATH],
      ["GET", `${DUB_PATH}/lines/line-1`],
      ["PUT", `${DUB_PATH}/lines/line-1/audio`],
      ["GET", "/api/dubs/not-the-ducks"],
    ];

    for (const [method, path] of routes) {
      const response = await worker.fetch(request(method, path), env);
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.equal(response.headers.get("Allow"), null, `${method} ${path}`);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.deepEqual(await response.json(), { error: "unauthorized" });
    }
    assert.equal(sessionCalls.length, routes.length);
    assert.equal(handlerCalls, 0);
    assert.equal(getAssetCalls(), 0);
  });

  it("passes only authenticated session identity, D1, env, and request to the dub handler", async () => {
    const sessionCalls = [];
    const calls = [];
    const session = {
      session: { id: "session-1" },
      user: { email: "parent@example.test", id: "user-1", name: " Parent " },
    };
    const { env, getAssetCalls, state } = authenticatedEnvironment();
    try {
      const worker = createWorker({
        createAuth: () => authStub(session, sessionCalls),
        async handleDubRequest(input) {
          calls.push(input);
          return Response.json({ routed: true });
        },
      });
      const dubRequest = request("GET", DUB_PATH);

      const response = await worker.fetch(dubRequest, env);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { routed: true });
      assert.equal(sessionCalls.length, 1);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].request, dubRequest);
      assert.equal(calls[0].env, env);
      assert.equal(calls[0].database.$client, env.DB);
      assert.deepEqual(calls[0].identity, {
        sessionId: "session-1",
        userId: "user-1",
        userName: "Parent",
        learnerProfileId: "learner-a",
        learnerName: "Mia",
        legacyStorageOwner: true,
      });
      assert.equal(getAssetCalls(), 0);
    } finally {
      state.close();
    }
  });

  it("passes the selected nonlegacy learner identity to the dub handler", async () => {
    const session = {
      session: { id: "session-1" },
      user: { id: "user-1", name: " Parent " },
    };
    const { env, state } = authenticatedEnvironment();
    try {
      state.sqlite.prepare(
        `INSERT INTO learner_profile
          (id, auth_user_id, name, onboarding_status, legacy_storage_owner)
         VALUES (?, ?, ?, 'not_started', 0)`,
      ).run("learner-b", "user-1", "Leo");
      state.sqlite.prepare(
        `INSERT INTO session_learner_selection
          (session_id, auth_user_id, learner_profile_id)
         VALUES (?, ?, ?)`,
      ).run("session-1", "user-1", "learner-b");
      let routedIdentity;
      const worker = createWorker({
        createAuth: () => authStub(session, []),
        async handleDubRequest(input) {
          routedIdentity = input.identity;
          return new Response(null, { status: 204 });
        },
      });

      const response = await worker.fetch(request("GET", DUB_PATH), env);

      assert.equal(response.status, 204);
      assert.deepEqual(routedIdentity, {
        learnerName: "Leo",
        learnerProfileId: "learner-b",
        legacyStorageOwner: false,
        sessionId: "session-1",
        userId: "user-1",
        userName: "Parent",
      });
    } finally {
      state.close();
    }
  });

  it("authenticates supported routes before returning method errors", async () => {
    const sessionCalls = [];
    const session = {
      session: { id: "session-1" },
      user: { id: "user-1", name: "Parent" },
    };
    const { env, getAssetCalls, state } = authenticatedEnvironment();
    try {
      const worker = createWorker({
        createAuth: () => authStub(session, sessionCalls),
      });
      const routes = [
        ["POST", DUB_PATH, "GET, DELETE"],
        ["GET", `${DUB_PATH}/lines/line-1`, "PUT"],
        ["PUT", `${DUB_PATH}/lines/line-1/audio`, "GET"],
      ];

      for (const [method, path, allow] of routes) {
        const response = await worker.fetch(request(method, path), env);
        assert.equal(response.status, 405, `${method} ${path}`);
        assert.equal(response.headers.get("Allow"), allow, `${method} ${path}`);
        assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      }
      assert.equal(sessionCalls.length, routes.length);
      assert.equal(getAssetCalls(), 0);
    } finally {
      state.close();
    }
  });

  it("does not claim lookalike non-dub paths", async () => {
    const sessionCalls = [];
    const worker = createWorker({
      createAuth: () => authStub(null, sessionCalls),
    });
    const { env, getAssetCalls } = environment();

    const response = await worker.fetch(request("GET", "/api/dubs-and-more"), env);

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "asset");
    assert.equal(sessionCalls.length, 0);
    assert.equal(getAssetCalls(), 1);
  });
});
