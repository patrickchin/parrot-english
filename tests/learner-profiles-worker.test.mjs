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

function insertSession(state, sessionId, userId = "user-a") {
  state.sqlite
    .prepare(
      `INSERT INTO session
        (id, expires_at, token, created_at, updated_at, user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sessionId,
      timestamp + 86_400_000,
      `token-${sessionId}`,
      timestamp,
      timestamp,
      userId,
    );
}

function insertOtherAccount(state) {
  state.sqlite
    .prepare(
      `INSERT INTO user
        (id, name, email, email_verified, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
    .run("user-b", "Other Guardian", "other@example.test", timestamp, timestamp);
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

function insertDeletionTombstone(state, learnerProfileId) {
  state.sqlite
    .prepare(
      `INSERT INTO learner_profile_deletion_tombstone
        (learner_profile_id, user_id_hash, legacy_storage_owner,
         generation, requested_at, storage_keys_json)
       VALUES (?, 'opaque-user-hash', 1, 1, ?, '[]')`,
    )
    .run(learnerProfileId, timestamp);
}

function requireLearnerSelection(state, sessionId = "session-a") {
  state.sqlite
    .prepare(
      `INSERT INTO learner_selection_required (session_id)
       VALUES (?)`,
    )
    .run(sessionId);
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

function rawRequest(method, path, body, headers = {}) {
  return new Request(`https://example.test${path}`, {
    method,
    headers,
    body,
  });
}

function learnerRows(state) {
  return state.sqlite
    .prepare(
      `SELECT id, auth_user_id, legacy_storage_owner, name, onboarding_status
       FROM learner_profile
       WHERE auth_user_id = 'user-a'
       ORDER BY created_at, id`,
    )
    .all()
    .map((row) => ({ ...row }));
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

    for (const flag of [undefined, "0", "true"]) {
      env.MULTI_LEARNER_PROFILES_ENABLED = flag;
      for (const [method, path, body] of [
        ["POST", "/api/learner-profiles", { name: "Mia" }],
        ["PUT", "/api/learner-profiles/learner-a/active"],
      ]) {
        const response = await worker.fetch(request(method, path, body), env);
        assert.equal(response.status, 404, `${flag ?? "absent"}: ${method} ${path}`);
        assert.equal(response.headers.get("Cache-Control"), "no-store");
        assert.deepEqual(await response.json(), { error: "not_found" });
      }
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
          deletionPending: false,
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
      deletionPending: false,
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

  it("keeps Guardian roster reads available for every release-flag state", async () => {
    insertLearner(state, "learner-a");
    await createGuardianAccessRepository(database).unlock("session-a");
    const worker = createWorker({ createAuth: () => authStub() });

    for (const flag of [undefined, "0", "1"]) {
      env.MULTI_LEARNER_PROFILES_ENABLED = flag;
      const response = await worker.fetch(
        request("GET", "/api/learner-profiles"),
        env,
      );
      assert.equal(response.status, 200, flag ?? "absent");
      assert.equal((await response.json()).activeProfileId, "learner-a");
    }
  });

  it("retains a tombstoned learner in the Guardian roster as deletion pending", async () => {
    insertLearner(state, "learner-a", { name: "Mary" });
    insertLearner(state, "learner-b", {
      legacyStorageOwner: false,
      name: "Sam",
    });
    insertDeletionTombstone(state, "learner-a");
    requireLearnerSelection(state);
    await createGuardianAccessRepository(database).unlock("session-a");

    const response = await createWorker({ createAuth: () => authStub() }).fetch(
      request("GET", "/api/learner-profiles"),
      env,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      activeProfileId: null,
      profiles: [
        {
          id: "learner-a",
          name: "Mary",
          age: 8,
          profileStatus: "completed",
          createdAt: "2026-08-26T08:00:00.000Z",
          deletionPending: true,
        },
        {
          id: "learner-b",
          name: "Sam",
          age: 8,
          profileStatus: "completed",
          createdAt: "2026-08-26T08:00:00.000Z",
          deletionPending: false,
        },
      ],
    });
  });

  it("requires authentication and a current Guardian unlock for enabled mutations", async () => {
    env.MULTI_LEARNER_PROFILES_ENABLED = "1";
    const anonymous = await createWorker({
      createAuth: () => authStub(null),
    }).fetch(request("POST", "/api/learner-profiles", { name: "Mia" }), env);
    assert.equal(anonymous.status, 401);
    assert.deepEqual(await anonymous.json(), { error: "unauthorized" });

    const locked = await createWorker({ createAuth: () => authStub() }).fetch(
      request("PUT", "/api/learner-profiles/learner-a/active"),
      env,
    );
    assert.equal(locked.status, 403);
    assert.deepEqual(await locked.json(), { error: "guardian_required" });
  });

  it("creates a managed learner without changing learner mode selection", async () => {
    insertLearner(state, "learner-mia", { name: "Mia" });
    await createGuardianAccessRepository(database).unlock("session-a");
    env.MULTI_LEARNER_PROFILES_ENABLED = "1";
    const worker = createWorker({ createAuth: () => authStub() });
    await worker.fetch(request("GET", "/api/learner-profiles"), env);

    const response = await worker.fetch(
      request("POST", "/api/learner-profiles", {
        name: "Noah",
        activate: false,
      }),
      env,
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.activeProfileId, "learner-mia");
    assert.deepEqual(
      payload.profiles.map(({ name }) => name),
      ["Mia", "Noah"],
    );
    assert.equal(
      state.sqlite
        .prepare(
          `SELECT learner_profile_id
           FROM session_learner_selection
           WHERE session_id = 'session-a'`,
        )
        .get().learner_profile_id,
      "learner-mia",
    );
  });

  it("persists additional learners in creation order when the database clock does not advance", async (t) => {
    state.sqlite.function(
      "unixepoch",
      { deterministic: true },
      (modifier) => {
        assert.equal(modifier, "subsecond");
        return timestamp / 1000;
      },
    );
    const ids = [
      "ffffffff-ffff-4fff-8fff-ffffffffffff",
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      "11111111-1111-4111-8111-111111111111",
    ];
    const randomUuidDescriptor = Object.getOwnPropertyDescriptor(
      globalThis.crypto,
      "randomUUID",
    );
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      configurable: true,
      value: () => ids.shift(),
    });
    t.after(() => {
      if (randomUuidDescriptor) {
        Object.defineProperty(
          globalThis.crypto,
          "randomUUID",
          randomUuidDescriptor,
        );
      } else {
        delete globalThis.crypto.randomUUID;
      }
    });
    insertOtherAccount(state);
    state.sqlite
      .prepare(
        `INSERT INTO learner_profile
          (id, auth_user_id, legacy_storage_owner, name, onboarding_status,
           created_at, updated_at)
         VALUES ('other-learner', 'user-b', 1, 'Noah', 'completed', ?, ?)`,
      )
      .run(timestamp + 10_000, timestamp + 10_000);
    insertSession(state, "session-b");
    await createGuardianAccessRepository(database).unlock("session-a");
    env.MULTI_LEARNER_PROFILES_ENABLED = "1";
    const worker = createWorker({ createAuth: () => authStub() });

    const response = await worker.fetch(
      request("POST", "/api/learner-profiles", { name: "  Ｍｉａ  " }),
      env,
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.match(payload.activeProfileId, /^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    assert.equal(payload.profiles.length, 2);
    assert.equal(payload.profiles.find(({ id }) => id === payload.activeProfileId).name, "Mia");
    assert.deepEqual(
      learnerRows(state).map(({ auth_user_id, legacy_storage_owner, name, onboarding_status }) => ({
        auth_user_id,
        legacy_storage_owner,
        name,
        onboarding_status,
      })),
      [
        {
          auth_user_id: "user-a",
          legacy_storage_owner: 1,
          name: null,
          onboarding_status: "not_started",
        },
        {
          auth_user_id: "user-a",
          legacy_storage_owner: 0,
          name: "Mia",
          onboarding_status: "not_started",
        },
      ],
    );
    assert.deepEqual(
      state.sqlite
        .prepare(
          `SELECT session_id, learner_profile_id
           FROM session_learner_selection
           ORDER BY session_id`,
        )
        .all()
        .map((row) => ({ ...row })),
      [{ session_id: "session-a", learner_profile_id: payload.activeProfileId }],
    );

    const appendedResponse = await worker.fetch(
      request("POST", "/api/learner-profiles", { name: "Leo" }),
      env,
    );
    const appendedPayload = await appendedResponse.json();
    assert.equal(appendedResponse.status, 200);
    assert.deepEqual(
      appendedPayload.profiles.map(({ id, name }) => ({ id, name })),
      [
        {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          name: "Learner",
        },
        {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          name: "Mia",
        },
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Leo",
        },
      ],
    );
    assert.equal(
      appendedPayload.profiles.find(({ id }) => id === appendedPayload.activeProfileId)
        .name,
      "Leo",
    );
    assert.deepEqual(
      state.sqlite
        .prepare(
          `SELECT id, created_at
           FROM learner_profile
           WHERE auth_user_id = 'user-a'
           ORDER BY created_at, id`,
        )
        .all()
        .map((row) => ({ ...row })),
      [
        {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          created_at: timestamp,
        },
        {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          created_at: timestamp + 1,
        },
        {
          id: "11111111-1111-4111-8111-111111111111",
          created_at: timestamp + 2,
        },
      ],
    );
    assert.equal(ids.length, 0);
  });

  it("rejects malformed, non-exact, unsafe, and overlong creation bodies with stable errors", async () => {
    await createGuardianAccessRepository(database).unlock("session-a");
    env.MULTI_LEARNER_PROFILES_ENABLED = "1";
    const worker = createWorker({ createAuth: () => authStub() });
    const cases = [
      [rawRequest("POST", "/api/learner-profiles", "{"), 400, {
        error: "invalid_json",
        message: "Please send valid JSON.",
      }],
      [request("POST", "/api/learner-profiles", []), 400, {
        error: "invalid_request",
        message: "Please send exactly one preferred name.",
      }],
      [request("POST", "/api/learner-profiles", { name: "Mia", age: 8 }), 400, {
        error: "invalid_request",
        message: "Please send exactly one preferred name.",
      }],
      [request("POST", "/api/learner-profiles", { name: "Mia", activate: "false" }), 400, {
        error: "invalid_request",
        message: "Please send exactly one preferred name.",
      }],
      [request("POST", "/api/learner-profiles", { name: 8 }), 400, {
        error: "invalid_request",
        message: "Please send exactly one preferred name.",
      }],
      [request("POST", "/api/learner-profiles", { name: "  " }), 400, {
        error: "invalid_name",
        message: "Please enter a preferred name.",
      }],
      [request("POST", "/api/learner-profiles", { name: "x".repeat(121) }), 400, {
        error: "invalid_name",
        message: "Please use 120 characters or fewer.",
      }],
      [request("POST", "/api/learner-profiles", { name: "Mia Smith" }), 400, {
        error: "preferred_name_required",
        message: "Please use only your first name or nickname.",
      }],
      [request("POST", "/api/learner-profiles", { name: "mia@example.test" }), 400, {
        error: "private_profile_details",
        message: "Do not share your school, home address, phone, email, or password.",
      }],
    ];

    for (const [input, status, payload] of cases) {
      const response = await worker.fetch(input, env);
      assert.equal(response.status, status);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.deepEqual(await response.json(), payload);
    }
    assert.equal(learnerRows(state).length, 0);
  });

  it("rejects a creation body above the existing bounded-body ceiling", async () => {
    await createGuardianAccessRepository(database).unlock("session-a");
    env.MULTI_LEARNER_PROFILES_ENABLED = "1";
    const response = await createWorker({ createAuth: () => authStub() }).fetch(
      rawRequest("POST", "/api/learner-profiles", "{}", {
        "Content-Length": String(8 * 1024 + 1),
      }),
      env,
    );

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      error: "payload_too_large",
      message: "The request body is too large.",
    });
  });

  it("rolls back the named profile when the atomic selection statement fails", async () => {
    await createGuardianAccessRepository(database).unlock("session-a");
    env.MULTI_LEARNER_PROFILES_ENABLED = "1";
    const realD1 = state.d1;
    const failingD1 = Object.create(realD1);
    failingD1.batch = async (statements) =>
      realD1.batch([
        statements[0],
        realD1
          .prepare(
            `INSERT INTO session_learner_selection
              (session_id, auth_user_id, learner_profile_id)
             VALUES ('missing-session', 'user-a', 'missing-profile')`,
          ),
      ]);
    env.DB = failingD1;

    await assert.rejects(
      createWorker({ createAuth: () => authStub() }).fetch(
        request("POST", "/api/learner-profiles", { name: "Mia" }),
        env,
      ),
      /foreign key/i,
    );

    const rows = learnerRows(state);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].legacy_storage_owner, 1);
    assert.equal(rows[0].name, null);
    assert.deepEqual(
      {
        ...state.sqlite
          .prepare(
            `SELECT auth_user_id, learner_profile_id
             FROM session_learner_selection
             WHERE session_id = 'session-a'`,
          )
          .get(),
      },
      { auth_user_id: "user-a", learner_profile_id: rows[0].id },
    );
  });

  it("selects different owned learners independently for two sessions and decodes the route ID", async () => {
    insertSession(state, "session-b");
    insertLearner(state, "learner/a");
    insertLearner(state, "learner-b", {
      legacyStorageOwner: false,
      name: "Leo",
    });
    await createGuardianAccessRepository(database).unlock("session-a");
    await createGuardianAccessRepository(database).unlock("session-b");
    env.MULTI_LEARNER_PROFILES_ENABLED = "1";

    const workerA = createWorker({ createAuth: () => authStub() });
    const first = await workerA.fetch(
      request("PUT", "/api/learner-profiles/learner%2Fa/active"),
      env,
    );
    const firstPayload = await first.json();
    assert.equal(first.status, 200);
    assert.equal(firstPayload.activeProfileId, "learner/a");

    const sessionB = {
      session: { id: "session-b" },
      user: session.user,
    };
    const second = await createWorker({
      createAuth: () => authStub(sessionB),
    }).fetch(request("PUT", "/api/learner-profiles/learner-b/active"), env);
    assert.equal(second.status, 200);
    assert.deepEqual(
      state.sqlite
        .prepare(
          `SELECT session_id, learner_profile_id
           FROM session_learner_selection
           ORDER BY session_id`,
        )
        .all()
        .map((row) => ({ ...row })),
      [
        {
          session_id: "session-a",
          learner_profile_id: "learner/a",
        },
        {
          session_id: "session-b",
          learner_profile_id: "learner-b",
        },
      ],
    );
  });

  it("persists selection timestamps while switching only the current session", async () => {
    insertSession(state, "session-b");
    insertLearner(state, "learner-a");
    await createGuardianAccessRepository(database).unlock("session-a");
    env.MULTI_LEARNER_PROFILES_ENABLED = "1";
    const worker = createWorker({ createAuth: () => authStub() });
    await worker.fetch(request("GET", "/api/learner-profiles"), env);
    const before = state.sqlite
      .prepare(
        `SELECT created_at, updated_at FROM session_learner_selection
         WHERE session_id = 'session-a'`,
      )
      .get();

    const response = await worker.fetch(
      request("PUT", "/api/learner-profiles/learner-a/active"),
      env,
    );
    const after = state.sqlite
      .prepare(
        `SELECT created_at, updated_at FROM session_learner_selection
         WHERE session_id = 'session-a'`,
      )
      .get();
    assert.equal(response.status, 200);
    assert.equal(after.created_at, before.created_at);
    assert.ok(after.updated_at >= before.updated_at);
    assert.equal(
      state.sqlite
        .prepare(
          `SELECT count(*) AS count FROM session_learner_selection
           WHERE session_id = 'session-b'`,
        )
        .get().count,
      0,
    );
  });

  it("returns generic 404 instead of selecting a tombstoned learner", async () => {
    insertLearner(state, "learner-a");
    insertDeletionTombstone(state, "learner-a");
    requireLearnerSelection(state);
    await createGuardianAccessRepository(database).unlock("session-a");
    env.MULTI_LEARNER_PROFILES_ENABLED = "1";

    const response = await createWorker({ createAuth: () => authStub() }).fetch(
      request("PUT", "/api/learner-profiles/learner-a/active"),
      env,
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
    assert.equal(
      state.sqlite
        .prepare(
          `SELECT count(*) AS count FROM session_learner_selection
           WHERE session_id = 'session-a'`,
        )
        .get().count,
      0,
    );
    assert.equal(
      state.sqlite
        .prepare(
          `SELECT count(*) AS count FROM learner_selection_required
           WHERE session_id = 'session-a'`,
        )
        .get().count,
      1,
    );
  });

  it("clears the selection-required marker atomically with explicit selection", async () => {
    insertLearner(state, "learner-a");
    requireLearnerSelection(state);
    await createGuardianAccessRepository(database).unlock("session-a");
    env.MULTI_LEARNER_PROFILES_ENABLED = "1";

    const response = await createWorker({ createAuth: () => authStub() }).fetch(
      request("PUT", "/api/learner-profiles/learner-a/active"),
      env,
    );

    assert.equal(response.status, 200);
    assert.equal((await response.json()).activeProfileId, "learner-a");
    assert.deepEqual(
      state.sqlite
        .prepare(
          `SELECT session_id, learner_profile_id
           FROM session_learner_selection
           WHERE session_id = 'session-a'`,
        )
        .all()
        .map((row) => ({ ...row })),
      [{ session_id: "session-a", learner_profile_id: "learner-a" }],
    );
    assert.equal(
      state.sqlite
        .prepare(
          `SELECT count(*) AS count FROM learner_selection_required
           WHERE session_id = 'session-a'`,
        )
        .get().count,
      0,
    );
  });

  it("rolls back explicit selection when clearing its marker fails", async () => {
    insertLearner(state, "learner-a");
    requireLearnerSelection(state);
    await createGuardianAccessRepository(database).unlock("session-a");
    env.MULTI_LEARNER_PROFILES_ENABLED = "1";
    const realD1 = state.d1;
    const failingD1 = Object.create(realD1);
    failingD1.batch = async (statements) =>
      realD1.batch([
        statements[0],
        realD1.prepare("DELETE FROM missing_learner_selection_required"),
      ]);
    env.DB = failingD1;

    await assert.rejects(
      createWorker({ createAuth: () => authStub() }).fetch(
        request("PUT", "/api/learner-profiles/learner-a/active"),
        env,
      ),
      /no such table/i,
    );

    assert.equal(
      state.sqlite
        .prepare(
          `SELECT count(*) AS count FROM session_learner_selection
           WHERE session_id = 'session-a'`,
        )
        .get().count,
      0,
    );
    assert.equal(
      state.sqlite
        .prepare(
          `SELECT count(*) AS count FROM learner_selection_required
           WHERE session_id = 'session-a'`,
        )
        .get().count,
      1,
    );
  });

  it("returns the same generic 404 for foreign, missing, malformed, and extra-segment profile IDs", async () => {
    insertOtherAccount(state);
    state.sqlite
      .prepare(
        `INSERT INTO learner_profile
          (id, auth_user_id, legacy_storage_owner, name, onboarding_status, created_at, updated_at)
         VALUES ('foreign-profile', 'user-b', 1, 'Noah', 'completed', ?, ?)`,
      )
      .run(timestamp, timestamp);
    await createGuardianAccessRepository(database).unlock("session-a");
    env.MULTI_LEARNER_PROFILES_ENABLED = "1";
    const worker = createWorker({ createAuth: () => authStub() });

    for (const path of [
      "/api/learner-profiles/foreign-profile/active",
      "/api/learner-profiles/missing-profile/active",
      "/api/learner-profiles/%E0%A4%A/active",
      "/api/learner-profiles/learner/extra/active",
    ]) {
      const response = await worker.fetch(request("PUT", path), env);
      assert.equal(response.status, 404, path);
      assert.deepEqual(await response.json(), { error: "not_found" });
    }
    assert.equal(
      state.sqlite
        .prepare("SELECT count(*) AS count FROM session_learner_selection")
        .get().count,
      0,
    );
  });
});
