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

test("seeds one reusable shared guest identity without credentials", () => {
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
        `SELECT id, auth_user_id, legacy_storage_owner, name,
                onboarding_status, completed_at, answers_json
           FROM learner_profile WHERE id = ?`,
      )
      .get(SHARED_GUEST_LEARNER_ID);
    assert.equal(profile.auth_user_id, SHARED_GUEST_USER_ID);
    assert.equal(profile.legacy_storage_owner, 1);
    assert.equal(profile.name, SHARED_GUEST_LEARNER_NAME);
    assert.equal(profile.onboarding_status, "completed");
    assert.ok(profile.completed_at);
    assert.deepEqual(JSON.parse(profile.answers_json), {
      schemaVersion: 2,
      questionnaireVersion: 2,
      responses: {},
      legacyAnswers: null,
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

    const seed = migrations.find(
      ({ name }) => name === "0019_shared_guest_account.sql",
    );
    assert.ok(seed);
    database
      .prepare("UPDATE user SET name = 'Mary' WHERE id = ?")
      .run(SHARED_GUEST_USER_ID);
    database
      .prepare(
        `UPDATE learner_profile
            SET name = 'Rose', story_level = 'tiny-stories'
          WHERE id = ?`,
      )
      .run(SHARED_GUEST_LEARNER_ID);
    const beforeReplay = {
      profile: {
        ...database
          .prepare("SELECT * FROM learner_profile WHERE id = ?")
          .get(SHARED_GUEST_LEARNER_ID),
      },
      user: {
        ...database
          .prepare("SELECT * FROM user WHERE id = ?")
          .get(SHARED_GUEST_USER_ID),
      },
    };
    database.exec(seed.sql);
    const afterReplay = {
      profile: {
        ...database
          .prepare("SELECT * FROM learner_profile WHERE id = ?")
          .get(SHARED_GUEST_LEARNER_ID),
      },
      user: {
        ...database
          .prepare("SELECT * FROM user WHERE id = ?")
          .get(SHARED_GUEST_USER_ID),
      },
    };
    assert.equal(afterReplay.user.name, "Mary");
    assert.equal(afterReplay.profile.name, "Rose");
    assert.equal(afterReplay.profile.story_level, "tiny-stories");
    assert.deepEqual(afterReplay.user, beforeReplay.user);
    assert.deepEqual(afterReplay.profile, beforeReplay.profile);
  } finally {
    database.close();
  }
});
