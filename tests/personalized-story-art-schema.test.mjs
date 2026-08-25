import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, it } from "node:test";
import * as schema from "../src/db/schema.ts";

function readMigrations() {
  return readdirSync(new URL("../migrations/", import.meta.url))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"),
    }));
}

function createMigratedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const migration of readMigrations()) database.exec(migration.sql);
  return database;
}

function tableSql(database, table) {
  return database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table)?.sql;
}

describe("personalized story art persistence contract", () => {
  it("exports a dedicated personalized_story_art Drizzle model", () => {
    assert.ok(schema.personalizedStoryArt, "Expected schema.personalizedStoryArt");
    assert.equal(getTableName(schema.personalizedStoryArt), "personalized_story_art");
    assert.deepEqual(Object.keys(getTableColumns(schema.personalizedStoryArt)), [
      "id",
      "authUserId",
      "learnerProfileId",
      "storyId",
      "status",
      "r2ObjectKey",
      "contentType",
      "guardianConsentVersion",
      "guardianConsentAt",
      "provider",
      "promptVersion",
      "createdAt",
      "updatedAt",
    ]);
    assert.ok(schema.personalizedStoryArtRelations);
  });

  it("adds a migration for owner-scoped private generated-image rows", () => {
    const migrations = readMigrations();
    const artMigration = migrations.find(({ sql }) =>
      /CREATE TABLE [`"]?personalized_story_art[`"]?/i.test(sql),
    );
    assert.ok(artMigration, "Expected a personalized story art migration");

    const database = createMigratedDatabase();
    try {
      const sql = tableSql(database, "personalized_story_art");
      assert.match(
        sql,
        /REFERENCES [`"]?user[`"]?\s*\([`"]?id[`"]?\).*ON DELETE cascade/i,
      );
      assert.match(sql, /[`"]?story_id[`"]?\s+text\s+NOT NULL/i);
      assert.match(sql, /[`"]?r2_object_key[`"]?\s+text\s+NOT NULL/i);
      assert.match(sql, /[`"]?content_type[`"]?\s+text\s+NOT NULL/i);
      assert.match(sql, /[`"]?guardian_consent_version[`"]?\s+text\s+NOT NULL/i);
      assert.match(sql, /[`"]?guardian_consent_at[`"]?\s+integer\s+NOT NULL/i);
      assert.match(sql, /[`"]?status[`"]?\s+text\s+NOT NULL/i);
      assert.match(
        sql,
        /CHECK\s*\([^\n]*status[^\n]*ready[^\n]*deleting[^\n]*\)/i,
      );
      assert.match(
        sql,
        /CHECK\s*\([^\n]*content_type[^\n]*image\/jpeg[^\n]*image\/png[^\n]*image\/webp[^\n]*\)/i,
      );

      const indexes = database
        .prepare("PRAGMA index_list('personalized_story_art')")
        .all();
      assert.ok(
        indexes.some(({ name, unique }) =>
          unique === 1 && /user.*story|story.*user/i.test(name),
        ),
        "Expected one unique row per user and story",
      );
    } finally {
      database.close();
    }
  });

  it("adds an owner-and-story generation lease with tracked recovery keys", () => {
    assert.ok(
      schema.personalizedStoryArtGenerationLease,
      "Expected schema.personalizedStoryArtGenerationLease",
    );
    assert.equal(
      getTableName(schema.personalizedStoryArtGenerationLease),
      "personalized_story_art_generation_lease",
    );
    assert.deepEqual(
      Object.keys(getTableColumns(schema.personalizedStoryArtGenerationLease)),
      [
        "authUserId",
        "storyId",
        "generationToken",
        "candidateR2ObjectKey",
        "previousR2ObjectKey",
        "leaseExpiresAt",
        "createdAt",
        "updatedAt",
      ],
    );

    const database = createMigratedDatabase();
    try {
      const sql = tableSql(
        database,
        "personalized_story_art_generation_lease",
      );
      assert.match(
        sql ?? "",
        /PRIMARY KEY\s*\(\s*[`"]?auth_user_id[`"]?\s*,\s*[`"]?story_id[`"]?\s*\)/i,
      );
      assert.match(
        sql ?? "",
        /REFERENCES [`"]?user[`"]?\s*\([`"]?id[`"]?\).*ON DELETE cascade/i,
      );
      assert.match(sql ?? "", /[`"]?generation_token[`"]?\s+text\s+NOT NULL/i);
      assert.match(sql ?? "", /[`"]?candidate_r2_object_key[`"]?\s+text/i);
      assert.match(sql ?? "", /[`"]?previous_r2_object_key[`"]?\s+text/i);
      assert.match(sql ?? "", /[`"]?lease_expires_at[`"]?\s+integer\s+NOT NULL/i);
    } finally {
      database.close();
    }
  });

  it("persists an opaque account-deletion tombstone outside the user cascade", () => {
    assert.ok(
      schema.accountDeletionTombstone,
      "Expected schema.accountDeletionTombstone",
    );
    assert.equal(
      getTableName(schema.accountDeletionTombstone),
      "account_deletion_tombstone",
    );
    assert.deepEqual(
      Object.keys(getTableColumns(schema.accountDeletionTombstone)),
      ["userIdHash", "r2Prefix", "requestedAt"],
    );

    const database = createMigratedDatabase();
    try {
      const sql = tableSql(database, "account_deletion_tombstone");
      assert.match(sql ?? "", /[`"]?user_id_hash[`"]?\s+text\s+PRIMARY KEY/i);
      assert.match(sql ?? "", /[`"]?r2_prefix[`"]?\s+text\s+NOT NULL/i);
      assert.doesNotMatch(
        sql ?? "",
        /REFERENCES [`"]?user[`"]?/i,
        "The tombstone must survive the user-row cascade long enough to fence in-flight uploads",
      );
    } finally {
      database.close();
    }
  });
});
