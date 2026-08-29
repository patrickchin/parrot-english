import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, it } from "node:test";
import * as schema from "../src/db/schema.ts";
import { readTestMigrations } from "./helpers/test-migrations.mjs";

function createMigratedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const migration of readTestMigrations()) database.exec(migration.sql);
  return database;
}

function insertAccount(database) {
  database
    .prepare(
      `INSERT INTO user (id, name, email, email_verified)
       VALUES ('user-a', 'Guardian', 'guardian@example.test', 1)`,
    )
    .run();
  database
    .prepare(
      `INSERT INTO session (id, expires_at, token, user_id)
       VALUES ('session-a', 2000000000000, 'token-a', 'user-a')`,
    )
    .run();
  database
    .prepare(
      `INSERT INTO learner_profile (id, auth_user_id, legacy_storage_owner)
       VALUES ('learner-a', 'user-a', 1)`,
    )
    .run();
}

describe("learner deletion persistence", () => {
  it("exports the durable learner deletion tables", () => {
    assert.ok(
      schema.learnerProfileDeletionTombstone,
      "Expected schema.learnerProfileDeletionTombstone",
    );
    assert.equal(
      getTableName(schema.learnerProfileDeletionTombstone),
      "learner_profile_deletion_tombstone",
    );
    assert.deepEqual(
      Object.keys(getTableColumns(schema.learnerProfileDeletionTombstone)),
      [
        "learnerProfileId",
        "userIdHash",
        "legacyStorageOwner",
        "generation",
        "requestedAt",
        "storageKeysJson",
      ],
    );
    assert.ok(
      schema.learnerSelectionRequired,
      "Expected schema.learnerSelectionRequired",
    );
    assert.equal(
      getTableName(schema.learnerSelectionRequired),
      "learner_selection_required",
    );
    assert.deepEqual(
      Object.keys(getTableColumns(schema.learnerSelectionRequired)),
      ["sessionId"],
    );
  });

  it("keeps a learner tombstone after its learner and account rows are deleted", () => {
    const database = createMigratedDatabase();
    try {
      insertAccount(database);
      database
        .prepare(
          `INSERT INTO learner_profile_deletion_tombstone
            (learner_profile_id, user_id_hash, legacy_storage_owner,
             generation, requested_at, storage_keys_json)
           VALUES ('learner-a', 'opaque-user-hash', 1, 3, 1700000000000,
                   '["learners/learner-a/"]')`,
        )
        .run();

      database.prepare("DELETE FROM learner_profile WHERE id = 'learner-a'").run();
      database.prepare("DELETE FROM user WHERE id = 'user-a'").run();

      assert.deepEqual(
        {
          ...database
            .prepare(
              `SELECT learner_profile_id, user_id_hash, legacy_storage_owner,
                      generation, requested_at, storage_keys_json
               FROM learner_profile_deletion_tombstone`,
            )
            .get(),
        },
        {
          learner_profile_id: "learner-a",
          user_id_hash: "opaque-user-hash",
          legacy_storage_owner: 1,
          generation: 3,
          requested_at: 1_700_000_000_000,
          storage_keys_json: '["learners/learner-a/"]',
        },
      );
      assert.deepEqual(
        database
          .prepare(
            "PRAGMA foreign_key_list('learner_profile_deletion_tombstone')",
          )
          .all(),
        [],
      );
    } finally {
      database.close();
    }
  });

  it("enforces one valid durable tombstone per learner", () => {
    const database = createMigratedDatabase();
    try {
      insertAccount(database);
      const insert = database.prepare(
        `INSERT INTO learner_profile_deletion_tombstone
          (learner_profile_id, user_id_hash, legacy_storage_owner,
           generation, requested_at, storage_keys_json)
         VALUES (?, 'opaque-user-hash', ?, 1, 1700000000000, ?)`,
      );
      insert.run("learner-a", 1, "[]");

      assert.throws(
        () => insert.run("learner-a", 1, "[]"),
        /unique|primary key/i,
      );
      assert.throws(
        () => insert.run("learner-b", 2, "[]"),
        /check constraint/i,
      );
      assert.throws(
        () => insert.run("learner-c", 0, "not-json"),
        /check constraint/i,
      );
      assert.ok(
        database
          .prepare(
            "PRAGMA index_list('learner_profile_deletion_tombstone')",
          )
          .all()
          .some(({ name }) =>
            name === "learner_profile_deletion_tombstone_user_hash_idx"
          ),
        "Expected account-hash lookup index",
      );
    } finally {
      database.close();
    }
  });

  it("cascades a selection-required marker with its auth session", () => {
    const database = createMigratedDatabase();
    try {
      insertAccount(database);
      database
        .prepare(
          `INSERT INTO learner_selection_required (session_id)
           VALUES ('session-a')`,
        )
        .run();

      database.prepare("DELETE FROM session WHERE id = 'session-a'").run();

      assert.equal(
        database
          .prepare(
            `SELECT count(*) AS count FROM learner_selection_required
             WHERE session_id = 'session-a'`,
          )
          .get().count,
        0,
      );
    } finally {
      database.close();
    }
  });
});
