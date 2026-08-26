import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createDatabase } from "../worker/database.ts";
import { createLearnerProfileRepository } from "../worker/learner-profile-repository.ts";
import {
  resolveLearnerIdentity,
  resolveOwnedLearnerIdentity,
} from "../worker/request-identity.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const timestamp = Date.parse("2026-08-26T08:00:00.000Z");

function account(sessionId, userId = "user-a", userName = "Guardian") {
  return { sessionId, userId, userName };
}

function insertUser(state, userId, name = "Guardian") {
  state.sqlite
    .prepare(
      `INSERT INTO user
        (id, name, email, email_verified, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
    .run(userId, name, `${userId}@example.test`, timestamp, timestamp);
}

function insertSession(state, sessionId, userId) {
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
  learnerProfileId,
  userId,
  { legacyStorageOwner = true, name = "Mia" } = {},
) {
  state.sqlite
    .prepare(
      `INSERT INTO learner_profile
        (id, auth_user_id, legacy_storage_owner, name, onboarding_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'not_started', ?, ?)`,
    )
    .run(
      learnerProfileId,
      userId,
      legacyStorageOwner ? 1 : 0,
      name,
      timestamp,
      timestamp,
    );
}

function insertSelection(
  state,
  sessionId,
  userId,
  learnerProfileId,
) {
  state.sqlite
    .prepare(
      `INSERT INTO session_learner_selection
        (session_id, auth_user_id, learner_profile_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(sessionId, userId, learnerProfileId, timestamp, timestamp);
}

function expectedLearner(
  sessionId,
  learnerProfileId = "learner-a",
  learnerName = "Mia",
) {
  return {
    sessionId,
    userId: "user-a",
    userName: "Guardian",
    learnerProfileId,
    learnerName,
    legacyStorageOwner: true,
  };
}

describe("request learner identity", () => {
  let state;
  let database;

  beforeEach(() => {
    state = createTestD1Database();
    insertUser(state, "user-a");
    insertSession(state, "session-a", "user-a");
    database = createDatabase(state.d1);
  });

  afterEach(() => state.close());

  it("returns the owned learner selected by the authenticated session", async () => {
    insertLearner(state, "learner-a", "user-a");
    insertSelection(state, "session-a", "user-a", "learner-a");

    assert.deepEqual(await resolveLearnerIdentity(database, account("session-a")), {
      status: "selected",
      identity: expectedLearner("session-a"),
    });
  });

  it("resolves an owned target without changing the session learner selection", async () => {
    insertLearner(state, "learner-a", "user-a");
    insertLearner(state, "learner-b", "user-a", {
      legacyStorageOwner: false,
      name: " Leo ",
    });
    insertSelection(state, "session-a", "user-a", "learner-a");

    assert.deepEqual(
      await resolveOwnedLearnerIdentity(
        database,
        account("session-a"),
        "learner-b",
      ),
      {
        sessionId: "session-a",
        userId: "user-a",
        userName: "Guardian",
        learnerProfileId: "learner-b",
        learnerName: "Leo",
        legacyStorageOwner: false,
      },
    );
    assert.deepEqual(
      state.sqlite
        .prepare(
          `SELECT session_id, auth_user_id, learner_profile_id
           FROM session_learner_selection`,
        )
        .all()
        .map((row) => ({ ...row })),
      [
        {
          session_id: "session-a",
          auth_user_id: "user-a",
          learner_profile_id: "learner-a",
        },
      ],
    );
  });

  it("does not resolve unknown or foreign learner targets", async () => {
    insertUser(state, "user-b", "Other Guardian");
    insertLearner(state, "learner-b", "user-b", { name: "Noah" });

    assert.equal(
      await resolveOwnedLearnerIdentity(
        database,
        account("session-a"),
        "learner-b",
      ),
      null,
    );
    assert.equal(
      await resolveOwnedLearnerIdentity(
        database,
        account("session-a"),
        "missing",
      ),
      null,
    );
    assert.equal(
      state.sqlite
        .prepare("SELECT count(*) AS count FROM session_learner_selection")
        .get().count,
      0,
    );
  });

  it("creates and selects one unnamed legacy learner for a zero-profile account", async () => {
    const resolution = await resolveLearnerIdentity(
      database,
      account("session-a"),
    );

    assert.equal(resolution.status, "selected");
    assert.deepEqual(resolution.identity, {
      ...expectedLearner("session-a", resolution.identity.learnerProfileId, null),
    });
    assert.deepEqual(
      state.sqlite
        .prepare(
          `SELECT auth_user_id, legacy_storage_owner, name, onboarding_status
           FROM learner_profile`,
        )
        .all()
        .map((row) => ({ ...row })),
      [
        {
          auth_user_id: "user-a",
          legacy_storage_owner: 1,
          name: null,
          onboarding_status: "not_started",
        },
      ],
    );
    assert.deepEqual(
      state.sqlite
        .prepare(
          `SELECT session_id, auth_user_id, learner_profile_id
           FROM session_learner_selection`,
        )
        .all()
        .map((row) => ({ ...row })),
      [
        {
          session_id: "session-a",
          auth_user_id: "user-a",
          learner_profile_id: resolution.identity.learnerProfileId,
        },
      ],
    );
  });

  it("converges concurrent zero-profile resolutions on one learner and selection", async () => {
    const [first, second] = await Promise.all([
      resolveLearnerIdentity(database, account("session-a")),
      resolveLearnerIdentity(database, account("session-a")),
    ]);

    assert.equal(first.status, "selected");
    assert.equal(second.status, "selected");
    assert.equal(
      first.identity.learnerProfileId,
      second.identity.learnerProfileId,
    );
    assert.equal(
      state.sqlite.prepare("SELECT count(*) AS count FROM learner_profile").get()
        .count,
      1,
    );
    assert.equal(
      state.sqlite
        .prepare("SELECT count(*) AS count FROM session_learner_selection")
        .get().count,
      1,
    );
  });

  it("keeps the legacy repository fallback valid after singleton uniqueness is removed", async () => {
    let nextId = 0;
    const repository = createLearnerProfileRepository(database, {
      createId: () => `legacy-repository-${nextId++}`,
      now: () => new Date(timestamp),
    });

    const [first, second] = await Promise.all([
      repository.ensureProfile(account("session-a")),
      repository.ensureProfile(account("session-a")),
    ]);

    assert.equal(first.id, second.id);
    assert.equal(first.legacyStorageOwner, true);
    assert.equal(
      state.sqlite.prepare("SELECT count(*) AS count FROM learner_profile").get()
        .count,
      1,
    );
  });

  it("auto-selects the account's only learner", async () => {
    insertLearner(state, "learner-a", "user-a");

    assert.deepEqual(await resolveLearnerIdentity(database, account("session-a")), {
      status: "selected",
      identity: expectedLearner("session-a"),
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

  it("requires Guardian selection when an account owns two learners", async () => {
    insertLearner(state, "learner-a", "user-a");
    insertLearner(state, "learner-b", "user-a", {
      legacyStorageOwner: false,
      name: "Leo",
    });

    assert.deepEqual(await resolveLearnerIdentity(database, account("session-a")), {
      status: "selection_required",
    });
    assert.equal(
      state.sqlite
        .prepare("SELECT count(*) AS count FROM session_learner_selection")
        .get().count,
      0,
    );
  });

  it("selects the only learner independently for two sessions", async () => {
    insertSession(state, "session-b", "user-a");
    insertLearner(state, "learner-a", "user-a");

    assert.deepEqual(await resolveLearnerIdentity(database, account("session-a")), {
      status: "selected",
      identity: expectedLearner("session-a"),
    });
    assert.deepEqual(await resolveLearnerIdentity(database, account("session-b")), {
      status: "selected",
      identity: expectedLearner("session-b"),
    });
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
        { session_id: "session-a", learner_profile_id: "learner-a" },
        { session_id: "session-b", learner_profile_id: "learner-a" },
      ],
    );
  });

  it("resolves session A's selected sibling while session B still requires selection", async () => {
    insertSession(state, "session-b", "user-a");
    insertLearner(state, "learner-a", "user-a");
    insertLearner(state, "learner-b", "user-a", {
      legacyStorageOwner: false,
      name: "Leo",
    });
    insertSelection(state, "session-a", "user-a", "learner-a");

    assert.deepEqual(await resolveLearnerIdentity(database, account("session-a")), {
      status: "selected",
      identity: expectedLearner("session-a"),
    });
    assert.deepEqual(await resolveLearnerIdentity(database, account("session-b")), {
      status: "selection_required",
    });
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

  it("fails closed without repairing stale or foreign selections", async () => {
    insertUser(state, "user-b", "Other Guardian");
    insertSession(state, "session-b", "user-a");
    insertLearner(state, "learner-b", "user-b", { name: "Noah" });
    insertSelection(state, "session-a", "user-b", "learner-b");
    insertSelection(state, "session-b", "user-a", "learner-b");

    assert.deepEqual(await resolveLearnerIdentity(database, account("session-a")), {
      status: "selection_required",
    });
    assert.deepEqual(await resolveLearnerIdentity(database, account("session-b")), {
      status: "selection_required",
    });
    assert.deepEqual(
      state.sqlite
        .prepare(
          `SELECT session_id, auth_user_id, learner_profile_id
           FROM session_learner_selection
           ORDER BY session_id`,
        )
        .all()
        .map((row) => ({ ...row })),
      [
        {
          session_id: "session-a",
          auth_user_id: "user-b",
          learner_profile_id: "learner-b",
        },
        {
          session_id: "session-b",
          auth_user_id: "user-a",
          learner_profile_id: "learner-b",
        },
      ],
    );
    assert.equal(
      state.sqlite
        .prepare(
          "SELECT count(*) AS count FROM learner_profile WHERE auth_user_id = ?",
        )
        .get("user-a").count,
      0,
    );
  });
});
