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
    .map((name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
}

function createMigratedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const migration of readMigrations()) database.exec(migration);
  return database;
}

function tableSql(database, table) {
  return database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table)?.sql;
}

describe("guardian access persistence", () => {
  it("stores one expiring guardian unlock per auth session", () => {
    assert.equal(getTableName(schema.guardianSessionUnlock), "guardian_session_unlock");
    assert.deepEqual(Object.keys(getTableColumns(schema.guardianSessionUnlock)), [
      "sessionId", "unlockedAt", "expiresAt",
    ]);
    const database = createMigratedDatabase();
    const sql = tableSql(database, "guardian_session_unlock");
    assert.match(sql, /session_id[^,]*PRIMARY KEY/i);
    assert.match(sql, /REFERENCES [`"]?session[`"]?\s*\([`"]?id[`"]?\).*ON DELETE cascade/i);
    assert.match(sql, /expires_at[^,]*NOT NULL/i);
  });

  it("cascades a real migrated guardian unlock when its auth session is deleted", () => {
    const database = createMigratedDatabase();
    database
      .prepare(
        `INSERT INTO user (id, name, email, email_verified)
         VALUES (?, ?, ?, ?)`,
      )
      .run("user-1", "Guardian", "guardian@example.test", 1);
    database
      .prepare(
        `INSERT INTO session (id, expires_at, token, user_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run("session-1", 2_000_000_000_000, "session-token-1", "user-1");
    database
      .prepare(
        `INSERT INTO guardian_session_unlock (session_id, unlocked_at, expires_at)
         VALUES (?, ?, ?)`,
      )
      .run("session-1", 1_700_000_000_000, 1_700_000_900_000);

    database.prepare("DELETE FROM session WHERE id = ?").run("session-1");

    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM guardian_session_unlock WHERE session_id = ?",
        )
        .get("session-1").count,
      0,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM user WHERE id = ?").get(
        "user-1",
      ).count,
      1,
    );
  });

  it("adds a constrained default story level to learner profiles", () => {
    const database = createMigratedDatabase();
    const sql = tableSql(database, "learner_profile");
    assert.match(sql, /story_level[^,]*DEFAULT ['"]first-words['"][^,]*NOT NULL/i);
    assert.match(sql, /story_level[^\n]*first-words[^\n]*early-a1/i);
  });

  it("stores nullable recording consent on the one learner profile per auth user", () => {
    const columns = getTableColumns(schema.learnerProfile);
    assert.equal(columns.lessonRecordingConsentVersion.name, "lesson_recording_consent_version");
    assert.equal(columns.lessonRecordingConsentAt.name, "lesson_recording_consent_at");

    const database = createMigratedDatabase();
    database
      .prepare(
        `INSERT INTO user (id, name, email, email_verified)
         VALUES (?, ?, ?, ?)`,
      )
      .run("user-1", "Guardian", "guardian@example.test", 1);
    database
      .prepare(
        `INSERT INTO learner_profile (id, auth_user_id)
         VALUES (?, ?)`,
      )
      .run("profile-1", "user-1");

    const row = database
      .prepare(
        `SELECT lesson_recording_consent_version, lesson_recording_consent_at
         FROM learner_profile WHERE auth_user_id = ?`,
      )
      .get("user-1");
    assert.equal(row.lesson_recording_consent_version, null);
    assert.equal(row.lesson_recording_consent_at, null);
  });
});
