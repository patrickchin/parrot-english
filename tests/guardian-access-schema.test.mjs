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
  it("persists constrained dubbing consent and cascades it with the account", () => {
    assert.equal(getTableName(schema.guardianDubConsent), "guardian_dub_consent");
    assert.deepEqual(Object.keys(getTableColumns(schema.guardianDubConsent)), [
      "authUserId",
      "consentVersion",
      "grantGeneration",
      "state",
      "grantedAt",
      "updatedAt",
    ]);

    const database = createMigratedDatabase();
    const sql = tableSql(database, "guardian_dub_consent");
    assert.match(sql, /state[^,]*NOT NULL/i);
    assert.match(sql, /state[^\n]*granted[^\n]*revoking/i);
    database
      .prepare(
        `INSERT INTO user (id, name, email, email_verified)
         VALUES (?, ?, ?, ?)`,
      )
      .run("user-1", "Guardian", "guardian@example.test", 1);
    database
      .prepare(
        `INSERT INTO guardian_dub_consent
          (auth_user_id, consent_version, grant_generation, state, granted_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "user-1",
        "guardian-voice-r2-v2",
        "grant-1",
        "granted",
        1_700_000_000_000,
        1_700_000_000_000,
      );

    database.prepare("DELETE FROM user WHERE id = ?").run("user-1");

    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM guardian_dub_consent WHERE auth_user_id = ?",
        )
        .get("user-1").count,
      0,
    );
  });

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

  it("stores recording consent generation and its durable cleanup boundary", () => {
    const columns = getTableColumns(schema.learnerProfile);
    assert.equal(columns.lessonRecordingConsentVersion.name, "lesson_recording_consent_version");
    assert.equal(columns.lessonRecordingConsentAt.name, "lesson_recording_consent_at");
    assert.equal(columns.lessonRecordingGeneration.name, "lesson_recording_generation");
    assert.equal(
      columns.lessonRecordingCleanupBeforeGeneration.name,
      "lesson_recording_cleanup_before_generation",
    );

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
        `SELECT lesson_recording_consent_version, lesson_recording_consent_at,
                lesson_recording_generation,
                lesson_recording_cleanup_before_generation
         FROM learner_profile WHERE auth_user_id = ?`,
      )
      .get("user-1");
    assert.equal(row.lesson_recording_consent_version, null);
    assert.equal(row.lesson_recording_consent_at, null);
    assert.equal(row.lesson_recording_generation, 0);
    assert.equal(row.lesson_recording_cleanup_before_generation, null);
  });

  it("stores a recording generation and durable cleanup boundary per My Lesson", () => {
    const columns = getTableColumns(schema.learnerLesson);
    assert.equal(columns.recordingGeneration.name, "recording_generation");
    assert.equal(
      columns.recordingCleanupBeforeGeneration.name,
      "recording_cleanup_before_generation",
    );

    const database = createMigratedDatabase();
    database
      .prepare(
        `INSERT INTO user (id, name, email, email_verified)
         VALUES (?, ?, ?, ?)`,
      )
      .run("user-1", "Guardian", "guardian@example.test", 1);
    database
      .prepare(
        `INSERT INTO learner_lesson (id, auth_user_id, source, lesson_json)
         VALUES (?, ?, ?, ?)`,
      )
      .run("lesson-1", "user-1", "uploaded", '{"scenes":[]}');

    const row = database
      .prepare(
        `SELECT recording_generation, recording_cleanup_before_generation
         FROM learner_lesson WHERE id = ?`,
      )
      .get("lesson-1");
    assert.equal(row.recording_generation, 0);
    assert.equal(row.recording_cleanup_before_generation, null);
  });
});
