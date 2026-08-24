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
    assert.match(sql, /REFERENCES [`\"]?session[`\"]?\s*\([`\"]?id[`\"]?\).*ON DELETE cascade/i);
    assert.match(sql, /expires_at[^,]*NOT NULL/i);
  });

  it("adds a constrained default story level to learner profiles", () => {
    const database = createMigratedDatabase();
    const sql = tableSql(database, "learner_profile");
    assert.match(sql, /story_level[^,]*DEFAULT ['\"]first-words['\"][^,]*NOT NULL/i);
    assert.match(sql, /story_level[^\n]*first-words[^\n]*early-a1/i);
  });
});
