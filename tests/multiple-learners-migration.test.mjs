import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { it } from "node:test";

const LEGACY_ART_KEY = "users/guardian-1/stories/story-1.webp";
const LEGACY_CANDIDATE_KEY = "users/guardian-1/stories/story-1-candidate.webp";
const LEGACY_PREVIOUS_KEY = "users/guardian-1/stories/story-1-previous.webp";
const GAP_SKIPPED_AT = 301;
const GAP_CONSENT_UPDATED_AT = 311;
const GAP_LEASE_UPDATED_AT = 321;

function readMigrations() {
  return readdirSync(new URL("../migrations/", import.meta.url))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"),
    }));
}

function seedLegacyAccount(database, { userId, profileId }) {
  database.exec(`
    INSERT INTO user (id, name, email, created_at, updated_at)
    VALUES ('${userId}', 'Guardian One', 'guardian-1@example.test', 100, 101);
    INSERT INTO learner_profile (
      id, auth_user_id, name, onboarding_status, created_at, updated_at
    ) VALUES ('${profileId}', '${userId}', 'Mia', 'completed', 110, 111);
    INSERT INTO session (id, expires_at, token, user_id, created_at, updated_at)
    VALUES ('session-1', 9999999999999, 'token-1', '${userId}', 120, 121);
    INSERT INTO onboarding_session_bypass (session_id, auth_user_id, skipped_at)
    VALUES ('session-1', '${userId}', 130);
    INSERT INTO learner_lesson (
      id, auth_user_id, source, lesson_json, created_at, updated_at
    ) VALUES ('lesson-1', '${userId}', 'generated', '{"title":"Legacy lesson"}', 140, 141);
    INSERT INTO conversation_session (
      id, auth_user_id, scenario_key, scenario_version, prompt_style, room_name,
      status, controller_state, started_at, created_at, updated_at
    ) VALUES (
      'conversation-1', '${userId}', 'ice-cream-shop', 1, 'guided', 'room-1',
      'completed', '{"turn":1}', 150, 151, 152
    );
    INSERT INTO personalized_story_art (
      id, auth_user_id, story_id, status, r2_object_key, content_type,
      guardian_consent_version, guardian_consent_at, provider, prompt_version,
      created_at, updated_at
    ) VALUES (
      'art-1', '${userId}', 'story-1', 'ready', '${LEGACY_ART_KEY}', 'image/webp',
      'consent-v1', 160, 'openai', 'prompt-v1', 161, 162
    );
    INSERT INTO personalized_story_art_generation_lease (
      auth_user_id, story_id, generation_token, candidate_r2_object_key,
      previous_r2_object_key, lease_expires_at, created_at, updated_at
    ) VALUES (
      '${userId}', 'story-1', 'lease-1', '${LEGACY_CANDIDATE_KEY}',
      '${LEGACY_PREVIOUS_KEY}', 170, 171, 172
    );
    INSERT INTO guardian_dub_consent (
      auth_user_id, consent_version, grant_generation, state, granted_at, updated_at
    ) VALUES ('${userId}', 'consent-v1', 'grant-1', 'granted', 180, 181);
  `);
}

function seedProfilelessAccount(database, { userId, sessionId }) {
  database.exec(`
    INSERT INTO user (id, name, email, created_at, updated_at)
    VALUES ('${userId}', 'Guardian Two', 'guardian-2@example.test', 200, 201);
    INSERT INTO session (id, expires_at, token, user_id, created_at, updated_at)
    VALUES ('${sessionId}', 9999999999999, 'token-2', '${userId}', 210, 211);
  `);
}

function row(database, table, id) {
  return database.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}

function indexNames(database, table) {
  return database
    .prepare(`PRAGMA index_list(${JSON.stringify(table)})`)
    .all()
    .map(({ name }) => name);
}

function unmappedCount(database, table) {
  return database
    .prepare(
      `SELECT count(*) AS count FROM ${table} WHERE learner_profile_id IS NULL`,
    )
    .get().count;
}

it("adds a durable personalized-art candidate closure without rewriting the staged learner migrations", () => {
  const migrations = readMigrations();
  const closure = migrations.find(
    ({ name }) =>
      name === "0014_personalized_art_deletion_closure.sql",
  );
  assert.ok(closure, "Expected the post-enable candidate-closure migration");
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");

  try {
    for (const migration of migrations.filter(
      ({ name }) =>
        name < closure.name && name !== "0013_multi_learner_enable.sql",
    )) {
      database.exec(migration.sql);
    }
    database.exec(`
      INSERT INTO account_deletion_tombstone (user_id_hash, r2_prefix, requested_at)
      VALUES ('deletion-hash-1', 'personalized-story-art/guardian-deleted/', 220);
    `);

    database.exec(closure.sql);

    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT user_id_hash, personalized_art_candidate_keys_json
             FROM account_deletion_tombstone`,
          )
          .get(),
      },
      {
        personalized_art_candidate_keys_json: "[]",
        user_id_hash: "deletion-hash-1",
      },
    );
    assert.throws(
      () =>
        database
          .prepare(
            `UPDATE account_deletion_tombstone
             SET personalized_art_candidate_keys_json = 'not-json'
             WHERE user_id_hash = 'deletion-hash-1'`,
          )
          .run(),
      /constraint/i,
    );
  } finally {
    database.close();
  }
});

it("expands legacy data into learner ownership without breaking singleton storage", () => {
  const migrations = readMigrations();
  const before = migrations.filter(({ name }) => name < "0012_");
  const expansion = migrations.find(({ name }) => name === "0012_multi_learner_expand.sql");
  assert.ok(expansion, "Expected the 0012 multi-learner expansion migration");

  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");

  try {
    for (const migration of before) database.exec(migration.sql);
    seedLegacyAccount(database, { userId: "guardian-1", profileId: "learner-1" });
    seedProfilelessAccount(database, { userId: "guardian-2", sessionId: "session-2" });
    database.exec(`
      INSERT INTO account_deletion_tombstone (user_id_hash, r2_prefix, requested_at)
      VALUES ('deletion-hash-1', 'personalized-story-art/guardian-deleted/', 220);
    `);

    database.exec(expansion.sql);

    assert.deepEqual(
      { ...database.prepare(
        `SELECT user_id_hash, learner_storage_identities_json
           FROM account_deletion_tombstone`,
      ).get() },
      {
        learner_storage_identities_json: "[]",
        user_id_hash: "deletion-hash-1",
      },
      "Existing deletion tombstones gain an empty durable learner closure",
    );
    assert.throws(
      () => database.prepare(
        `UPDATE account_deletion_tombstone
            SET learner_storage_identities_json = 'not-json'
          WHERE user_id_hash = 'deletion-hash-1'`,
      ).run(),
      /constraint/i,
    );

    assert.deepEqual(
      { ...database.prepare(
        "SELECT id, auth_user_id, legacy_storage_owner FROM learner_profile ORDER BY auth_user_id",
      ).all()[0] },
      { id: "learner-1", auth_user_id: "guardian-1", legacy_storage_owner: 1 },
    );
    const generatedLegacy = database
      .prepare(
        "SELECT id, auth_user_id, name, legacy_storage_owner FROM learner_profile WHERE auth_user_id = ?",
      )
      .get("guardian-2");
    assert.match(generatedLegacy.id, /^legacy-[0-9a-f]{32}$/);
    assert.equal(generatedLegacy.name, null);
    assert.equal(generatedLegacy.legacy_storage_owner, 1);

    assert.deepEqual(
      {
        ...database.prepare(
          "SELECT learner_profile_id, lesson_json, created_at, updated_at FROM learner_lesson WHERE id = 'lesson-1'",
        ).get(),
      },
      {
        learner_profile_id: "learner-1",
        lesson_json: '{"title":"Legacy lesson"}',
        created_at: 140,
        updated_at: 141,
      },
    );
    assert.deepEqual(
      {
        ...database.prepare(
          `SELECT learner_profile_id, prompt_style, controller_state,
                  started_at, created_at, updated_at
             FROM conversation_session WHERE id = 'conversation-1'`,
        ).get(),
      },
      {
        learner_profile_id: "learner-1",
        prompt_style: "guided",
        controller_state: '{"turn":1}',
        started_at: 150,
        created_at: 151,
        updated_at: 152,
      },
    );
    assert.deepEqual(
      {
        ...database.prepare(
          `SELECT learner_profile_id, r2_object_key, guardian_consent_version,
                  guardian_consent_at, prompt_version, created_at, updated_at
             FROM personalized_story_art WHERE id = 'art-1'`,
        ).get(),
      },
      {
        learner_profile_id: "learner-1",
        r2_object_key: LEGACY_ART_KEY,
        guardian_consent_version: "consent-v1",
        guardian_consent_at: 160,
        prompt_version: "prompt-v1",
        created_at: 161,
        updated_at: 162,
      },
    );

    assert.deepEqual(
      database
        .prepare(
          `SELECT session_id, auth_user_id, learner_profile_id, created_at, updated_at
             FROM session_learner_selection ORDER BY session_id`,
        )
        .all()
        .map((entry) => ({ ...entry })),
      [
        {
          session_id: "session-1",
          auth_user_id: "guardian-1",
          learner_profile_id: "learner-1",
          created_at: 120,
          updated_at: 121,
        },
        {
          session_id: "session-2",
          auth_user_id: "guardian-2",
          learner_profile_id: generatedLegacy.id,
          created_at: 210,
          updated_at: 211,
        },
      ],
    );
    assert.deepEqual(
      { ...database.prepare(
        "SELECT session_id, learner_profile_id, skipped_at FROM onboarding_learner_session_bypass",
      ).get() },
      { session_id: "session-1", learner_profile_id: "learner-1", skipped_at: 130 },
    );
    assert.deepEqual(
      { ...database.prepare(
        "SELECT learner_profile_id, auth_user_id, consent_version, grant_generation, state, granted_at, updated_at FROM learner_dub_consent",
      ).get() },
      {
        learner_profile_id: "learner-1",
        auth_user_id: "guardian-1",
        consent_version: "consent-v1",
        grant_generation: "grant-1",
        state: "granted",
        granted_at: 180,
        updated_at: 181,
      },
    );
    assert.deepEqual(
      { ...database.prepare(
        `SELECT learner_profile_id, auth_user_id, story_id, generation_token,
                candidate_r2_object_key, previous_r2_object_key, lease_expires_at,
                created_at, updated_at
           FROM learner_story_art_generation_lease`,
      ).get() },
      {
        learner_profile_id: "learner-1",
        auth_user_id: "guardian-1",
        story_id: "story-1",
        generation_token: "lease-1",
        candidate_r2_object_key: LEGACY_CANDIDATE_KEY,
        previous_r2_object_key: LEGACY_PREVIOUS_KEY,
        lease_expires_at: 170,
        created_at: 171,
        updated_at: 172,
      },
    );

    assert.ok(indexNames(database, "learner_profile").includes("learner_profile_auth_user_id_unique"));
    assert.ok(
      indexNames(database, "personalized_story_art").includes(
        "personalized_story_art_user_story_unique",
      ),
    );
    assert.ok(
      indexNames(database, "personalized_story_art").includes(
        "personalized_story_art_profile_story_unique",
      ),
    );
    assert.ok(
      indexNames(database, "learner_lesson").includes(
        "learner_lesson_profile_updated_idx",
      ),
    );
    assert.ok(
      indexNames(database, "conversation_session").includes(
        "conversation_session_profile_status_idx",
      ),
    );
    for (const legacyTable of [
      "onboarding_session_bypass",
      "guardian_dub_consent",
      "personalized_story_art_generation_lease",
    ]) {
      assert.ok(
        database
          .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
          .get(legacyTable),
      );
    }

    database.exec(`
      INSERT INTO learner_lesson (id, auth_user_id, source, lesson_json)
      VALUES ('lesson-gap', 'guardian-1', 'uploaded', '{}');
      INSERT INTO conversation_session (
        id, auth_user_id, scenario_key, scenario_version, room_name, status
      ) VALUES ('conversation-gap', 'guardian-1', 'shop', 1, 'room-gap', 'starting');
      INSERT INTO personalized_story_art (
        id, auth_user_id, story_id, status, r2_object_key, content_type,
        guardian_consent_version, guardian_consent_at, provider, prompt_version
      ) VALUES (
        'art-gap', 'guardian-1', 'story-gap', 'ready', 'legacy-gap.webp',
        'image/webp', 'consent-v1', 190, 'openai', 'prompt-v1'
      );
    `);
    assert.equal(row(database, "learner_lesson", "lesson-gap").learner_profile_id, null);
    assert.equal(row(database, "conversation_session", "conversation-gap").learner_profile_id, null);
    assert.equal(row(database, "personalized_story_art", "art-gap").learner_profile_id, null);
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    database.close();
  }
});

it("catches every expansion gap write before enabling multiple learners", () => {
  const migrations = readMigrations();
  const before = migrations.filter(({ name }) => name < "0012_");
  const expansion = migrations.find(({ name }) => name === "0012_multi_learner_expand.sql");
  const enable = migrations.find(({ name }) => name === "0013_multi_learner_enable.sql");
  assert.ok(expansion, "Expected the 0012 multi-learner expansion migration");
  assert.ok(enable, "Expected the 0013 multi-learner enable migration");

  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  try {
    for (const migration of before) database.exec(migration.sql);
    seedLegacyAccount(database, { userId: "guardian-1", profileId: "learner-1" });
    database.exec(`
      INSERT INTO user (id, name, email, created_at, updated_at)
      VALUES ('guardian-deleted', 'Deleted Guardian', 'deleted@example.test', 230, 231);
      INSERT INTO learner_profile (
        id, auth_user_id, name, onboarding_status, created_at, updated_at
      ) VALUES (
        'learner-deleted', 'guardian-deleted', 'Old Learner', 'completed', 232, 233
      );
      INSERT INTO guardian_dub_consent (
        auth_user_id, consent_version, grant_generation, state, granted_at, updated_at
      ) VALUES (
        'guardian-deleted', 'deleted-consent', 'deleted-grant', 'granted', 234, 235
      );
      INSERT INTO personalized_story_art_generation_lease (
        auth_user_id, story_id, generation_token, lease_expires_at, created_at, updated_at
      ) VALUES (
        'guardian-deleted', 'deleted-story', 'deleted-lease', 236, 237, 238
      );
    `);
    database.exec(expansion.sql);

    database.exec(`
      INSERT INTO session (id, expires_at, token, user_id, created_at, updated_at)
      VALUES ('gap-session', 9999999999999, 'gap-token', 'guardian-1', 290, 291);
      INSERT INTO onboarding_session_bypass (session_id, auth_user_id, skipped_at)
      VALUES ('gap-session', 'guardian-1', ${GAP_SKIPPED_AT});
      INSERT INTO learner_lesson (
        id, auth_user_id, source, lesson_json, created_at, updated_at
      ) VALUES ('lesson-gap', 'guardian-1', 'uploaded', '{}', 292, 293);
      INSERT INTO conversation_session (
        id, auth_user_id, scenario_key, scenario_version, room_name, status,
        created_at, updated_at
      ) VALUES (
        'conversation-gap', 'guardian-1', 'shop', 1, 'room-gap', 'starting',
        294, 295
      );
      INSERT INTO personalized_story_art (
        id, auth_user_id, story_id, status, r2_object_key, content_type,
        guardian_consent_version, guardian_consent_at, provider, prompt_version,
        created_at, updated_at
      ) VALUES (
        'art-gap', 'guardian-1', 'story-gap', 'ready', 'legacy-gap.webp',
        'image/webp', 'consent-gap', 296, 'openai', 'prompt-gap', 297, 298
      );
      UPDATE guardian_dub_consent
      SET consent_version = 'consent-gap', grant_generation = 'gap-grant',
          state = 'revoking', granted_at = 309, updated_at = ${GAP_CONSENT_UPDATED_AT}
      WHERE auth_user_id = 'guardian-1';
      UPDATE personalized_story_art_generation_lease
      SET generation_token = 'gap-lease',
          candidate_r2_object_key = 'gap-candidate.webp',
          previous_r2_object_key = 'gap-previous.webp',
          lease_expires_at = 319, updated_at = ${GAP_LEASE_UPDATED_AT}
      WHERE auth_user_id = 'guardian-1' AND story_id = 'story-1';
      DELETE FROM guardian_dub_consent WHERE auth_user_id = 'guardian-deleted';
      DELETE FROM personalized_story_art_generation_lease
      WHERE auth_user_id = 'guardian-deleted' AND story_id = 'deleted-story';

      INSERT INTO user (id, name, email, created_at, updated_at)
      VALUES ('guardian-gap', 'Never Copy This Guardian Name', 'gap@example.test', 330, 331);
      INSERT INTO session (id, expires_at, token, user_id, created_at, updated_at)
      VALUES ('profileless-session', 9999999999999, 'profileless-token', 'guardian-gap', 332, 333);
      INSERT INTO learner_lesson (
        id, auth_user_id, source, lesson_json, created_at, updated_at
      ) VALUES ('profileless-lesson', 'guardian-gap', 'uploaded', '{}', 334, 335);
      INSERT INTO conversation_session (
        id, auth_user_id, scenario_key, scenario_version, room_name, status,
        created_at, updated_at
      ) VALUES (
        'profileless-conversation', 'guardian-gap', 'shop', 1,
        'profileless-room', 'starting', 336, 337
      );
      INSERT INTO personalized_story_art (
        id, auth_user_id, story_id, status, r2_object_key, content_type,
        guardian_consent_version, guardian_consent_at, provider, prompt_version,
        created_at, updated_at
      ) VALUES (
        'profileless-art', 'guardian-gap', 'story-gap', 'ready',
        'profileless-gap.webp', 'image/webp', 'consent-gap', 338,
        'openai', 'prompt-gap', 339, 340
      );
    `);

    database.exec(enable.sql);

    const generatedLegacy = database
      .prepare(
        `SELECT id, name, legacy_storage_owner
         FROM learner_profile WHERE auth_user_id = 'guardian-gap'`,
      )
      .get();
    assert.match(generatedLegacy.id, /^legacy-[0-9a-f]{32}$/);
    assert.equal(generatedLegacy.name, null);
    assert.equal(generatedLegacy.legacy_storage_owner, 1);

    for (const table of [
      "learner_lesson",
      "conversation_session",
      "personalized_story_art",
    ]) {
      assert.equal(unmappedCount(database, table), 0, table);
    }
    assert.equal(
      row(database, "learner_lesson", "lesson-gap").learner_profile_id,
      "learner-1",
    );
    assert.equal(
      row(database, "conversation_session", "conversation-gap").learner_profile_id,
      "learner-1",
    );
    assert.equal(
      row(database, "personalized_story_art", "art-gap").learner_profile_id,
      "learner-1",
    );
    assert.equal(
      row(database, "learner_lesson", "profileless-lesson").learner_profile_id,
      generatedLegacy.id,
    );
    assert.equal(
      row(database, "conversation_session", "profileless-conversation").learner_profile_id,
      generatedLegacy.id,
    );
    assert.equal(
      row(database, "personalized_story_art", "profileless-art").learner_profile_id,
      generatedLegacy.id,
    );

    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT learner_profile_id, created_at, updated_at
             FROM session_learner_selection WHERE session_id = 'gap-session'`,
          )
          .get(),
      },
      { learner_profile_id: "learner-1", created_at: 290, updated_at: 291 },
    );
    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT learner_profile_id, created_at, updated_at
             FROM session_learner_selection WHERE session_id = 'profileless-session'`,
          )
          .get(),
      },
      { learner_profile_id: generatedLegacy.id, created_at: 332, updated_at: 333 },
    );
    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT learner_profile_id, skipped_at
             FROM onboarding_learner_session_bypass
             WHERE session_id = 'gap-session'`,
          )
          .get(),
      },
      { learner_profile_id: "learner-1", skipped_at: GAP_SKIPPED_AT },
    );
    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT consent_version, grant_generation, state, granted_at, updated_at
             FROM learner_dub_consent
             WHERE learner_profile_id = 'learner-1'`,
          )
          .get(),
      },
      {
        consent_version: "consent-gap",
        grant_generation: "gap-grant",
        state: "revoking",
        granted_at: 309,
        updated_at: GAP_CONSENT_UPDATED_AT,
      },
    );
    assert.equal(
      database
        .prepare(
          `SELECT count(*) AS count FROM learner_dub_consent
           WHERE learner_profile_id = 'learner-deleted'`,
        )
        .get().count,
      0,
      "A deleted legacy consent source must remove its stale learner mirror",
    );
    assert.equal(
      database
        .prepare(
          `SELECT count(*) AS count FROM learner_story_art_generation_lease
           WHERE learner_profile_id = 'learner-deleted'`,
        )
        .get().count,
      0,
      "A deleted legacy lease source must remove its stale learner mirror",
    );
    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT generation_token, candidate_r2_object_key,
                    previous_r2_object_key, lease_expires_at, created_at, updated_at
             FROM learner_story_art_generation_lease
             WHERE learner_profile_id = 'learner-1' AND story_id = 'story-1'`,
          )
          .get(),
      },
      {
        generation_token: "gap-lease",
        candidate_r2_object_key: "gap-candidate.webp",
        previous_r2_object_key: "gap-previous.webp",
        lease_expires_at: 319,
        created_at: 171,
        updated_at: GAP_LEASE_UPDATED_AT,
      },
    );

    const learnerIndexes = indexNames(database, "learner_profile");
    assert.ok(!learnerIndexes.includes("learner_profile_auth_user_id_unique"));
    assert.ok(learnerIndexes.includes("learner_profile_auth_user_id_idx"));
    assert.ok(learnerIndexes.includes("learner_profile_id_user_unique"));
    assert.ok(learnerIndexes.includes("learner_profile_legacy_storage_owner_unique"));
    const artIndexes = indexNames(database, "personalized_story_art");
    assert.ok(!artIndexes.includes("personalized_story_art_user_story_unique"));
    assert.ok(artIndexes.includes("personalized_story_art_user_story_idx"));
    assert.ok(artIndexes.includes("personalized_story_art_profile_story_unique"));
    assert.ok(
      indexNames(database, "session_learner_selection").includes(
        "session_learner_selection_auth_profile_idx",
      ),
    );

    database.exec(`
      INSERT INTO learner_profile (
        id, auth_user_id, legacy_storage_owner, name, onboarding_status,
        created_at, updated_at
      ) VALUES (
        'learner-2', 'guardian-1', 0, 'Leo', 'not_started', 350, 351
      );
      INSERT INTO personalized_story_art (
        id, auth_user_id, learner_profile_id, story_id, status, r2_object_key,
        content_type, guardian_consent_version, guardian_consent_at, provider,
        prompt_version, created_at, updated_at
      ) VALUES (
        'art-sibling', 'guardian-1', 'learner-2', 'story-1', 'ready',
        'sibling.webp', 'image/webp', 'consent-sibling', 352, 'openai',
        'prompt-sibling', 353, 354
      );
      INSERT INTO learner_dub_consent (
        learner_profile_id, auth_user_id, consent_version, grant_generation,
        state, granted_at, updated_at
      ) VALUES (
        'learner-2', 'guardian-1', 'sibling-consent', 'sibling-grant',
        'granted', 355, 356
      );
      INSERT INTO learner_story_art_generation_lease (
        learner_profile_id, auth_user_id, story_id, generation_token,
        lease_expires_at, created_at, updated_at
      ) VALUES (
        'learner-2', 'guardian-1', 'story-1', 'sibling-lease', 357, 358, 359
      );
      INSERT INTO session (id, expires_at, token, user_id, created_at, updated_at)
      VALUES ('multi-session', 9999999999999, 'multi-token', 'guardian-1', 360, 361);
    `);
    assert.equal(
      database
        .prepare("SELECT count(*) AS count FROM learner_profile WHERE auth_user_id = 'guardian-1'")
        .get().count,
      2,
    );
    assert.equal(
      database
        .prepare("SELECT count(*) AS count FROM personalized_story_art WHERE auth_user_id = 'guardian-1' AND story_id = 'story-1'")
        .get().count,
      2,
    );
    assert.equal(
      database
        .prepare("SELECT count(*) AS count FROM session_learner_selection WHERE session_id = 'multi-session'")
        .get().count,
      0,
      "A session created for a multi-learner account must remain unselected",
    );
    assert.equal(
      database
        .prepare("SELECT grant_generation FROM learner_dub_consent WHERE learner_profile_id = 'learner-2'")
        .get().grant_generation,
      "sibling-grant",
    );
    assert.equal(
      database
        .prepare("SELECT generation_token FROM learner_story_art_generation_lease WHERE learner_profile_id = 'learner-2'")
        .get().generation_token,
      "sibling-lease",
    );
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(
      database
        .prepare(
          `SELECT count(*) AS count FROM sqlite_master
           WHERE type = 'table' AND name = 'multi_learner_backfill_assertion'`,
        )
        .get().count,
      0,
    );
  } finally {
    database.close();
  }
});

it("fails the enable migration when a compatibility child cannot be mapped", () => {
  const migrations = readMigrations();
  const expansion = migrations.find(({ name }) => name === "0012_multi_learner_expand.sql");
  const enable = migrations.find(({ name }) => name === "0013_multi_learner_enable.sql");
  assert.ok(expansion);
  assert.ok(enable, "Expected the 0013 multi-learner enable migration");
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  try {
    for (const migration of migrations.filter(({ name }) => name < "0012_")) {
      database.exec(migration.sql);
    }
    seedLegacyAccount(database, { userId: "guardian-1", profileId: "learner-1" });
    database.exec(expansion.sql);
    database.exec(`
      UPDATE learner_profile SET legacy_storage_owner = 0 WHERE id = 'learner-1';
      INSERT INTO learner_lesson (id, auth_user_id, source, lesson_json)
      VALUES ('unmappable-lesson', 'guardian-1', 'uploaded', '{}');
    `);

    assert.throws(() => database.exec(enable.sql), /constraint/i);
    assert.equal(
      row(database, "learner_lesson", "unmappable-lesson").learner_profile_id,
      null,
    );
    assert.ok(
      indexNames(database, "learner_profile").includes(
        "learner_profile_auth_user_id_unique",
      ),
      "The singleton index must not drop after the assertion fails",
    );
    assert.ok(
      database
        .prepare(
          `SELECT 1 FROM sqlite_master
           WHERE type = 'table' AND name = 'multi_learner_backfill_assertion'`,
        )
        .get(),
      "The assertion must use a regular table rather than TEMP state",
    );
  } finally {
    database.close();
  }
});
