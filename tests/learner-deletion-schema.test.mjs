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
      `INSERT INTO learner_profile
        (id, auth_user_id, name, private_media_name, name_key)
       VALUES ('learner-a', 'user-a', 'Mary', 'Mary', 'mary')`,
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
        "privateMediaName",
        "generation",
        "requestedAt",
        "storageKeysJson",
      ],
    );
    assert.equal(schema.learnerSelectionRequired, undefined);
  });

  it("keeps a learner tombstone after its learner and account rows are deleted", () => {
    const database = createMigratedDatabase();
    try {
      insertAccount(database);
      database
        .prepare(
          `INSERT INTO learner_profile_deletion_tombstone
            (learner_profile_id, user_id_hash, private_media_name,
             generation, requested_at, storage_keys_json)
           VALUES ('learner-a', 'opaque-user-hash', 'Mary', 3,
                   1700000000000,
                   '["accounts/guardian@example.test/learners/Mary/recordings/"]')`,
        )
        .run();

      database.prepare("DELETE FROM learner_profile WHERE id = 'learner-a'").run();
      database.prepare("DELETE FROM user WHERE id = 'user-a'").run();

      assert.deepEqual(
        {
          ...database
            .prepare(
              `SELECT learner_profile_id, user_id_hash, private_media_name,
                      generation, requested_at, storage_keys_json
               FROM learner_profile_deletion_tombstone`,
            )
            .get(),
        },
        {
          learner_profile_id: "learner-a",
          user_id_hash: "opaque-user-hash",
          private_media_name: "Mary",
          generation: 3,
          requested_at: 1_700_000_000_000,
          storage_keys_json:
            '["accounts/guardian@example.test/learners/Mary/recordings/"]',
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
          (learner_profile_id, user_id_hash, generation, requested_at,
           storage_keys_json)
         VALUES (?, 'opaque-user-hash', 1, 1700000000000, ?)`,
      );
      insert.run("learner-a", "[]");

      assert.throws(
        () => insert.run("learner-a", "[]"),
        /unique|primary key/i,
      );
      assert.throws(
        () => insert.run("learner-c", "not-json"),
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

  it("does not create the removed selection-required marker table", () => {
    const database = createMigratedDatabase();
    try {
      assert.equal(
        database
          .prepare(
            `SELECT count(*) AS count
             FROM sqlite_master
             WHERE type = 'table' AND name = 'learner_selection_required'`,
          )
          .get().count,
        0,
      );
    } finally {
      database.close();
    }
  });
});
