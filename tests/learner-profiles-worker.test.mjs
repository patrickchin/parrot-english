import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createDatabase } from "../worker/database.ts";
import { createGuardianAccessRepository } from "../worker/guardian-access.ts";
import { createWorker } from "../worker/index.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const timestamp = Date.parse("2026-08-26T08:00:00.000Z");
const session = {
  session: { id: "session-a" },
  user: { id: "user-a", name: " Guardian ", email: "guardian@example.test" },
};

function insertAccount(state) {
  state.sqlite
    .prepare(
      `INSERT INTO user
        (id, name, email, email_verified, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
    .run("user-a", "Guardian", "guardian@example.test", timestamp, timestamp);
  state.sqlite
    .prepare(
      `INSERT INTO session
        (id, expires_at, token, created_at, updated_at, user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "session-a",
      timestamp + 86_400_000,
      "token-session-a",
      timestamp,
      timestamp,
      "user-a",
    );
}

function insertLearner(
  state,
  id,
  { age = 8, legacyStorageOwner = true, name = " Mia " } = {},
) {
  state.sqlite
    .prepare(
      `INSERT INTO learner_profile
        (id, auth_user_id, legacy_storage_owner, name, age, onboarding_status, created_at, updated_at)
       VALUES (?, 'user-a', ?, ?, ?, 'completed', ?, ?)`,
    )
    .run(id, legacyStorageOwner ? 1 : 0, name, age, timestamp, timestamp);
}

function authStub(value = session) {
  return {
    api: { async getSession() { return value; } },
    async handler() { return new Response("auth"); },
  };
}

function request(method, path, body) {
  return new Request(`https://example.test${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

describe("learner roster Worker routing", () => {
  let state;
  let database;
  let env;

  beforeEach(() => {
    state = createTestD1Database();
    insertAccount(state);
    database = createDatabase(state.d1);
    env = {
      ASSETS: { async fetch() { return new Response("asset"); } },
      DB: state.d1,
      MULTI_LEARNER_PROFILES_ENABLED: "0",
    };
  });

  afterEach(() => state.close());

  it("rejects a locked roster read before initializing a learner", async () => {
    const response = await createWorker({ createAuth: () => authStub() }).fetch(
      request("GET", "/api/learner-profiles"),
      env,
    );

    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { error: "guardian_required" });
    assert.equal(
      state.sqlite.prepare("SELECT count(*) AS count FROM learner_profile").get()
        .count,
      0,
    );
  });

  it("hides roster mutations during the compatibility release", async () => {
    await createGuardianAccessRepository(database).unlock("session-a");
    const worker = createWorker({ createAuth: () => authStub() });

    for (const [method, path, body] of [
      ["POST", "/api/learner-profiles", { name: "Mia" }],
      ["PUT", "/api/learner-profiles/learner-a/active"],
    ]) {
      const response = await worker.fetch(request(method, path, body), env);
      assert.equal(response.status, 404, `${method} ${path}`);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.deepEqual(await response.json(), { error: "not_found" });
    }
    assert.equal(
      state.sqlite.prepare("SELECT count(*) AS count FROM learner_profile").get()
        .count,
      0,
    );
  });

  it("auto-selects an existing sole learner before returning the roster", async () => {
    insertLearner(state, "learner-a");
    await createGuardianAccessRepository(database).unlock("session-a");

    const response = await createWorker({ createAuth: () => authStub() }).fetch(
      request("GET", "/api/learner-profiles"),
      env,
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), {
      activeProfileId: "learner-a",
      profiles: [
        {
          id: "learner-a",
          name: "Mia",
          age: 8,
          profileStatus: "completed",
          createdAt: "2026-08-26T08:00:00.000Z",
        },
      ],
    });
    assert.equal(
      state.sqlite
        .prepare(
          "SELECT learner_profile_id FROM session_learner_selection WHERE session_id = ?",
        )
        .get("session-a").learner_profile_id,
      "learner-a",
    );
  });

  it("creates and selects the one unnamed legacy learner before returning a fresh roster", async () => {
    await createGuardianAccessRepository(database).unlock("session-a");

    const response = await createWorker({ createAuth: () => authStub() }).fetch(
      request("GET", "/api/learner-profiles"),
      env,
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.profiles.length, 1);
    assert.equal(payload.activeProfileId, payload.profiles[0].id);
    assert.deepEqual(payload.profiles[0], {
      id: payload.activeProfileId,
      name: "Learner",
      age: null,
      profileStatus: "not_started",
      createdAt: payload.profiles[0].createdAt,
    });
    assert.match(payload.profiles[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(
      {
        ...state.sqlite
          .prepare(
            `SELECT legacy_storage_owner, name
             FROM learner_profile
             WHERE id = ?`,
          )
          .get(payload.activeProfileId),
      },
      { legacy_storage_owner: 1, name: null },
    );
  });
});
