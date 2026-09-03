import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  SHARED_GUEST_EMAIL,
  SHARED_GUEST_LEARNER_ID,
  SHARED_GUEST_LEARNER_NAME,
  SHARED_GUEST_USER_ID,
} from "../lib/shared-guest.ts";
import { readTestMigrations } from "./helpers/test-migrations.mjs";

test("migrations leave one current shared guest identity without credentials", () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  try {
    const migrations = readTestMigrations();
    for (const migration of migrations) database.exec(migration.sql);

    const user = {
      ...database
        .prepare(
          `SELECT id, name, email, email_verified, is_anonymous
             FROM user WHERE id = ?`,
        )
        .get(SHARED_GUEST_USER_ID),
    };
    assert.deepEqual(user, {
      email: SHARED_GUEST_EMAIL,
      email_verified: 0,
      id: SHARED_GUEST_USER_ID,
      is_anonymous: 0,
      name: "Guest",
    });

    const profile = database
      .prepare(
        `SELECT id, auth_user_id, name, onboarding_status, completed_at,
                answers_json
           FROM learner_profile WHERE id = ?`,
      )
      .get(SHARED_GUEST_LEARNER_ID);
    assert.equal(profile.auth_user_id, SHARED_GUEST_USER_ID);
    assert.equal(profile.name, SHARED_GUEST_LEARNER_NAME);
    assert.equal(profile.onboarding_status, "completed");
    assert.ok(profile.completed_at);
    assert.deepEqual(JSON.parse(profile.answers_json), {
      schemaVersion: 2,
      questionnaireVersion: 2,
      responses: {},
      description: null,
    });
    assert.equal(
      database
        .prepare("SELECT count(*) AS count FROM account WHERE user_id = ?")
        .get(SHARED_GUEST_USER_ID).count,
      0,
    );
    assert.equal(
      database
        .prepare("SELECT count(*) AS count FROM session WHERE user_id = ?")
        .get(SHARED_GUEST_USER_ID).count,
      0,
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);

  } finally {
    database.close();
  }
});
