import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createDatabase } from "../worker/database.ts";
import { createGuardianAccessRepository } from "../worker/guardian-access.ts";
import { createWorker } from "../worker/index.ts";
import { LEARNER_NAME_CONFLICT_MESSAGE } from "../worker/request-identity.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const timestamp = Date.parse("2026-08-26T08:00:00.000Z");
const session = {
  session: { id: "session-a" },
  user: { id: "user-a", name: "Guardian", email: "guardian@example.test" },
};

function insertAccount(state, userId = "user-a") {
  state.sqlite
    .prepare(
      `INSERT INTO user
        (id, name, email, email_verified, created_at, updated_at)
       VALUES (?, 'Guardian', ?, 1, ?, ?)`,
    )
    .run(userId, `${userId}@example.test`, timestamp, timestamp);
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

function insertLearner(
  state,
  id,
  {
    age = 8,
    createdAt = timestamp,
    name = "Mary",
    privateMediaName = name,
    userId = "user-a",
  } = {},
) {
  state.sqlite
    .prepare(
      `INSERT INTO learner_profile
        (id, auth_user_id, name, private_media_name, name_key, age,
         onboarding_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
    )
    .run(
      id,
      userId,
      name,
      privateMediaName,
      name.toLowerCase(),
      age,
      createdAt,
      createdAt,
    );
}

function selectLearner(
  state,
  learnerProfileId,
  sessionId = "session-a",
  userId = "user-a",
) {
  state.sqlite
    .prepare(
      `INSERT INTO session_learner_selection
        (session_id, auth_user_id, learner_profile_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(sessionId, userId, learnerProfileId, timestamp, timestamp);
}

function insertDeletionTombstone(
  state,
  learnerProfileId,
  { privateMediaName = "Learner", userIdHash = "opaque-user-hash" } = {},
) {
  state.sqlite
    .prepare(
      `INSERT INTO learner_profile_deletion_tombstone
        (learner_profile_id, user_id_hash, private_media_name, generation,
         requested_at, storage_keys_json)
       VALUES (?, ?, ?, 1, ?, '[]')`,
    )
    .run(learnerProfileId, userIdHash, privateMediaName, timestamp);
}

function authStub(value = session) {
  return {
    api: {
      async getSession() {
        return value;
      },
    },
    async handler() {
      return new Response("auth");
    },
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
      `SELECT id, auth_user_id, name, private_media_name, onboarding_status
       FROM learner_profile
       WHERE auth_user_id = 'user-a'
       ORDER BY created_at, id`,
    )
    .all()
    .map((row) => ({ ...row }));
}

describe("learner roster Worker", () => {
  let state;
  let database;
  let env;

  beforeEach(() => {
    state = createTestD1Database();
    insertAccount(state);
    insertSession(state, "session-a");
    database = createDatabase(state.d1);
    env = {
      ASSETS: {
        async fetch() {
          return new Response("asset");
        },
      },
      DB: state.d1,
    };
  });

  afterEach(() => state.close());

  it("returns an empty roster without creating or selecting a learner", async () => {
    const response = await createWorker({ createAuth: () => authStub() }).fetch(
      request("GET", "/api/learner-profiles"),
      env,
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), {
      activeProfileId: null,
      profiles: [],
    });
    assert.equal(learnerRows(state).length, 0);
  });

  it("does not implicitly select an existing learner while reading the roster", async () => {
    insertLearner(state, "learner-mary");

    const response = await createWorker({ createAuth: () => authStub() }).fetch(
      request("GET", "/api/learner-profiles"),
      env,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      activeProfileId: null,
      profiles: [
        {
          age: 8,
          createdAt: "2026-08-26T08:00:00.000Z",
          deletionPending: false,
          id: "learner-mary",
          name: "Mary",
          profileStatus: "completed",
        },
      ],
    });
    assert.equal(
      state.sqlite
        .prepare("SELECT count(*) AS count FROM session_learner_selection")
        .get().count,
      0,
    );
  });

  it("returns the explicit session selection and pending deletion state", async () => {
    insertLearner(state, "learner-mary", { name: "Mary" });
    insertLearner(state, "learner-sam", {
      createdAt: timestamp + 1,
      name: "Sam",
    });
    selectLearner(state, "learner-sam");
    insertDeletionTombstone(state, "learner-mary", {
      privateMediaName: "Mary",
    });

    const response = await createWorker({ createAuth: () => authStub() }).fetch(
      request("GET", "/api/learner-profiles"),
      env,
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.activeProfileId, "learner-sam");
    assert.deepEqual(
      payload.profiles.map(({ id, deletionPending }) => ({
        id,
        deletionPending,
      })),
      [
        { id: "learner-mary", deletionPending: true },
        { id: "learner-sam", deletionPending: false },
      ],
    );
  });

  it("requires authentication and Guardian access to create a learner", async () => {
    const anonymous = await createWorker({
      createAuth: () => authStub(null),
    }).fetch(request("POST", "/api/learner-profiles", { name: "Mary" }), env);
    assert.equal(anonymous.status, 401);
    assert.deepEqual(await anonymous.json(), { error: "unauthorized" });

    const locked = await createWorker({ createAuth: () => authStub() }).fetch(
      request("POST", "/api/learner-profiles", { name: "Mary" }),
      env,
    );
    assert.equal(locked.status, 403);
    assert.deepEqual(await locked.json(), { error: "guardian_required" });
  });

  it("creates a learner without changing the explicit session selection", async () => {
    insertLearner(state, "learner-mary");
    selectLearner(state, "learner-mary");
    await createGuardianAccessRepository(database).unlock("session-a");

    const response = await createWorker({ createAuth: () => authStub() }).fetch(
      request("POST", "/api/learner-profiles", { name: "Rose" }),
      env,
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.activeProfileId, "learner-mary");
    assert.equal(typeof payload.createdProfileId, "string");
    assert.deepEqual(
      payload.profiles.map(({ name }) => name),
      ["Mary", "Rose"],
    );
    assert.equal(
      state.sqlite
        .prepare(
          `SELECT learner_profile_id
           FROM session_learner_selection
           WHERE session_id = 'session-a'`,
        )
        .get().learner_profile_id,
      "learner-mary",
    );
  });

  it("rejects a duplicate normalized learner name", async () => {
    insertLearner(state, "learner-mary");
    await createGuardianAccessRepository(database).unlock("session-a");

    const response = await createWorker({ createAuth: () => authStub() }).fetch(
      request("POST", "/api/learner-profiles", { name: "  ＭＡＲＹ  " }),
      env,
    );

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: "learner_name_conflict",
      message: LEARNER_NAME_CONFLICT_MESSAGE,
    });
    assert.equal(learnerRows(state).length, 1);
  });

  it("reserves immutable media names from current and deleted learners", async () => {
    insertLearner(state, "learner-bob", {
      name: "Bob",
      privateMediaName: "Mary",
    });
    insertDeletionTombstone(state, "deleted-learner", {
      privateMediaName: "Mary (2)",
      userIdHash: createHash("sha256").update("user-a").digest("hex"),
    });
    await createGuardianAccessRepository(database).unlock("session-a");

    const response = await createWorker({ createAuth: () => authStub() }).fetch(
      request("POST", "/api/learner-profiles", { name: "Mary" }),
      env,
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(
      {
        ...state.sqlite
          .prepare(
            `SELECT name, private_media_name
             FROM learner_profile WHERE id = ?`,
          )
          .get(payload.createdProfileId),
      },
      { name: "Mary", private_media_name: "Mary (3)" },
    );
  });

  it("creates concurrent learners with distinct identities and no implicit selection", async () => {
    await createGuardianAccessRepository(database).unlock("session-a");
    const worker = createWorker({ createAuth: () => authStub() });

    const responses = await Promise.all(
      ["Bob", "Rose"].map((name) =>
        worker.fetch(
          request("POST", "/api/learner-profiles", { name }),
          env,
        ),
      ),
    );
    const payloads = await Promise.all(
      responses.map((response) => response.json()),
    );

    assert.deepEqual(
      responses.map(({ status }) => status),
      [200, 200],
    );
    assert.notEqual(payloads[0].createdProfileId, payloads[1].createdProfileId);
    assert.deepEqual(
      payloads.map(({ activeProfileId }) => activeProfileId),
      [null, null],
    );
    assert.deepEqual(
      learnerRows(state).map(({ name }) => name).sort(),
      ["Bob", "Rose"],
    );
  });

  it("accepts exactly the current learner creation shape", async () => {
    await createGuardianAccessRepository(database).unlock("session-a");
    const worker = createWorker({ createAuth: () => authStub() });
    const cases = [
      [rawRequest("POST", "/api/learner-profiles", "{"), 400, "invalid_json"],
      [request("POST", "/api/learner-profiles", []), 400, "invalid_request"],
      [
        request("POST", "/api/learner-profiles", {
          activate: false,
          name: "Mary",
        }),
        400,
        "invalid_request",
      ],
      [
        request("POST", "/api/learner-profiles", { age: 8, name: "Mary" }),
        400,
        "invalid_request",
      ],
      [request("POST", "/api/learner-profiles", { name: "  " }), 400, "invalid_name"],
      [
        request("POST", "/api/learner-profiles", { name: "x".repeat(121) }),
        400,
        "invalid_name",
      ],
      [
        request("POST", "/api/learner-profiles", { name: "Mary Smith" }),
        400,
        "preferred_name_required",
      ],
      [
        request("POST", "/api/learner-profiles", {
          name: "mary@example.test",
        }),
        400,
        "private_profile_details",
      ],
    ];

    for (const [input, status, error] of cases) {
      const response = await worker.fetch(input, env);
      assert.equal(response.status, status);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal((await response.json()).error, error);
    }
    assert.equal(learnerRows(state).length, 0);
  });

  it("rejects a creation body above the bounded-body ceiling", async () => {
    await createGuardianAccessRepository(database).unlock("session-a");
    const response = await createWorker({ createAuth: () => authStub() }).fetch(
      rawRequest("POST", "/api/learner-profiles", "{}", {
        "Content-Length": String(8 * 1024 + 1),
      }),
      env,
    );

    assert.equal(response.status, 413);
    assert.equal((await response.json()).error, "payload_too_large");
  });

  it("selects owned learners independently for two sessions", async () => {
    insertSession(state, "session-b");
    insertLearner(state, "learner-mary", { name: "Mary" });
    insertLearner(state, "learner-rose", {
      createdAt: timestamp + 1,
      name: "Rose",
    });
    const workerA = createWorker({ createAuth: () => authStub() });

    const first = await workerA.fetch(
      request("PUT", "/api/learner-profiles/learner-mary/active"),
      env,
    );
    const sessionB = { session: { id: "session-b" }, user: session.user };
    const second = await createWorker({
      createAuth: () => authStub(sessionB),
    }).fetch(
      request("PUT", "/api/learner-profiles/learner-rose/active"),
      env,
    );

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.deepEqual(
      state.sqlite
        .prepare(
          `SELECT session_id, learner_profile_id
           FROM session_learner_selection ORDER BY session_id`,
        )
        .all()
        .map((row) => ({ ...row })),
      [
        { session_id: "session-a", learner_profile_id: "learner-mary" },
        { session_id: "session-b", learner_profile_id: "learner-rose" },
      ],
    );
  });

  it("preserves selection creation time while switching the current session", async () => {
    insertLearner(state, "learner-mary");
    selectLearner(state, "learner-mary");
    const before = state.sqlite
      .prepare(
        `SELECT created_at, updated_at FROM session_learner_selection
         WHERE session_id = 'session-a'`,
      )
      .get();

    const response = await createWorker({ createAuth: () => authStub() }).fetch(
      request("PUT", "/api/learner-profiles/learner-mary/active"),
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
  });

  it("returns the same 404 for unavailable and malformed selection targets", async () => {
    insertAccount(state, "user-b");
    insertLearner(state, "foreign-learner", {
      name: "Jack",
      userId: "user-b",
    });
    insertLearner(state, "deleting-learner", { name: "Ben" });
    insertDeletionTombstone(state, "deleting-learner", {
      privateMediaName: "Ben",
    });
    const worker = createWorker({ createAuth: () => authStub() });

    for (const path of [
      "/api/learner-profiles/foreign-learner/active",
      "/api/learner-profiles/deleting-learner/active",
      "/api/learner-profiles/missing-learner/active",
      "/api/learner-profiles/%E0%A4%A/active",
      "/api/learner-profiles/learner%2Fextra/active",
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
