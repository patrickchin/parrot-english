import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createDatabase } from "../worker/database.ts";
import {
  resolveLearnerIdentity,
  resolveOwnedLearnerIdentity,
} from "../worker/request-identity.ts";
import * as requestIdentity from "../worker/request-identity.ts";
import { SHARED_GUEST_USER_ID } from "../lib/shared-guest.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const timestamp = Date.parse("2026-08-26T08:00:00.000Z");

function account(sessionId, userId = "user-a") {
  return {
    sessionId,
    userEmail: `${userId}@example.test`,
    userId,
  };
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
  { name = "Mia" } = {},
) {
  state.sqlite
    .prepare(
      `INSERT INTO learner_profile
        (id, auth_user_id, name, private_media_name,
         name_key, onboarding_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'not_started', ?, ?)`,
    )
    .run(
      learnerProfileId,
      userId,
      name,
      name?.normalize("NFKC").trim() || "Learner",
      name?.normalize("NFKC").trim().toLowerCase() || null,
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

function insertDeletionTombstone(state, learnerProfileId) {
  state.sqlite
    .prepare(
      `INSERT INTO learner_profile_deletion_tombstone
        (learner_profile_id, user_id_hash, generation, requested_at,
         storage_keys_json)
       VALUES (?, 'opaque-user-hash', 1, ?, '[]')`,
    )
    .run(learnerProfileId, timestamp);
}

function expectedLearner(
  sessionId,
  learnerProfileId = "learner-a",
  learnerName = "Mia",
) {
  return {
    sessionId,
    userEmail: "user-a@example.test",
    userId: "user-a",
    learnerProfileId,
    learnerName,
    privateMediaName: learnerName ?? "Learner",
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

  it("requires explicit selection for a new shared guest session", async () => {
    insertSession(state, "shared-guest-session", SHARED_GUEST_USER_ID);

    assert.deepEqual(
      await resolveLearnerIdentity(
        database,
        account("shared-guest-session", SHARED_GUEST_USER_ID),
      ),
      { status: "selection_required" },
    );
  });

  it("resolves an owned target without changing the session learner selection", async () => {
    insertLearner(state, "learner-a", "user-a");
    insertLearner(state, "learner-b", "user-a", {
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
        userEmail: "user-a@example.test",
        userId: "user-a",
        learnerProfileId: "learner-b",
        learnerName: "Leo",
        privateMediaName: "Leo",
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

  it("does not resolve an owned learner while its deletion is pending", async () => {
    insertLearner(state, "learner-a", "user-a");
    insertDeletionTombstone(state, "learner-a");

    assert.equal(
      await resolveOwnedLearnerIdentity(
        database,
        account("session-a"),
        "learner-a",
      ),
      null,
    );
    assert.equal(
      await requestIdentity.isLearnerDeletionPending(database, "learner-a"),
      true,
    );
    assert.equal(
      await requestIdentity.isLearnerDeletionPending(database, "missing"),
      false,
    );
  });

  it("does not resolve a selected learner while its deletion is pending", async () => {
    insertLearner(state, "learner-a", "user-a");
    insertSelection(state, "session-a", "user-a", "learner-a");
    insertDeletionTombstone(state, "learner-a");

    assert.deepEqual(await resolveLearnerIdentity(database, account("session-a")), {
      status: "selection_required",
    });
  });

  it("does not create or select a learner during identity resolution", async () => {
    const [first, second] = await Promise.all([
      resolveLearnerIdentity(database, account("session-a")),
      resolveLearnerIdentity(database, account("session-a")),
    ]);

    assert.deepEqual(first, { status: "selection_required" });
    assert.deepEqual(second, { status: "selection_required" });
    assert.equal(
      state.sqlite
        .prepare(
          "SELECT count(*) AS count FROM learner_profile WHERE auth_user_id = ?",
        )
        .get("user-a").count,
      0,
    );
    assert.equal(
      state.sqlite
        .prepare("SELECT count(*) AS count FROM session_learner_selection")
        .get().count,
      0,
    );
  });

  it("does not implicitly select the account's only learner", async () => {
    insertLearner(state, "learner-a", "user-a");

    assert.deepEqual(await resolveLearnerIdentity(database, account("session-a")), {
      status: "selection_required",
    });
    assert.equal(
      state.sqlite
        .prepare(
          "SELECT count(*) AS count FROM session_learner_selection WHERE session_id = ?",
        )
        .get("session-a").count,
      0,
    );
  });

  it("requires Guardian selection when an account owns two learners", async () => {
    insertLearner(state, "learner-a", "user-a");
    insertLearner(state, "learner-b", "user-a", {
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

  it("requires each session to select the only learner explicitly", async () => {
    insertSession(state, "session-b", "user-a");
    insertLearner(state, "learner-a", "user-a");

    assert.deepEqual(await resolveLearnerIdentity(database, account("session-a")), {
      status: "selection_required",
    });
    assert.deepEqual(await resolveLearnerIdentity(database, account("session-b")), {
      status: "selection_required",
    });
    assert.equal(
      state.sqlite
        .prepare("SELECT count(*) AS count FROM session_learner_selection")
        .get().count,
      0,
    );
  });

  it("resolves session A's selected sibling while session B still requires selection", async () => {
    insertSession(state, "session-b", "user-a");
    insertLearner(state, "learner-a", "user-a");
    insertLearner(state, "learner-b", "user-a", {
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
