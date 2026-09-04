import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, it } from "node:test";
import questionnaireV2 from "../content/learner-profile/questionnaire-v2.json" with { type: "json" };
import { validateLearnerProfileQuestionnaire } from "../lib/learner-profile-questionnaire.js";
import { readV2Answers } from "../lib/learner-profile-responses.js";
import * as schema from "../src/db/schema.ts";

const EXPECTED_MODELS = {
  learnerProfile: {
    table: "learner_profile",
    properties: [
      "id",
      "authUserId",
      "name",
      "privateMediaName",
      "nameKey",
      "age",
      "storyLevel",
      "answersJson",
      "skippedQuestionKeysJson",
      "currentQuestionKey",
      "profileStatus",
      "completedAt",
      "lessonRecordingConsentVersion",
      "lessonRecordingConsentAt",
      "lessonRecordingGeneration",
      "lessonRecordingCleanupBeforeGeneration",
      "createdAt",
      "updatedAt",
    ],
  },
  sessionLearnerSelection: {
    table: "session_learner_selection",
    properties: [
      "sessionId",
      "authUserId",
      "learnerProfileId",
      "createdAt",
      "updatedAt",
    ],
  },
  learnerSessionBypass: {
    table: "onboarding_learner_session_bypass",
    properties: ["sessionId", "learnerProfileId", "skippedAt"],
  },
  learnerDubConsent: {
    table: "learner_dub_consent",
    properties: [
      "learnerProfileId",
      "authUserId",
      "consentVersion",
      "grantGeneration",
      "state",
      "grantedAt",
      "updatedAt",
    ],
  },
};

const REMOVED_TABLES = [
  "guardian_dub_consent",
  "learner_selection_required",
  "learner_story_art_generation_lease",
  "personalized_story_art",
  "personalized_story_art_generation_lease",
  "onboarding_session_bypass",
  "questionnaire",
  "questionnaire_question",
];

function readMigrations() {
  return readdirSync(new URL("../migrations/", import.meta.url))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(
        new URL(`../migrations/${name}`, import.meta.url),
        "utf8",
      ),
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

function indexDetails(database, table) {
  return database
    .prepare(`PRAGMA index_list(${JSON.stringify(table)})`)
    .all()
    .map((index) => ({
      name: index.name,
      unique: index.unique,
      columns: database
        .prepare(`PRAGMA index_info(${JSON.stringify(index.name)})`)
        .all()
        .map((column) => column.name),
    }));
}

describe("learner-profile infrastructure", () => {
  it("configures independent platform rate limits for protected endpoints", () => {
    const config = JSON.parse(
      readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    );

    assert.deepEqual(config.ratelimits, [
      {
        name: "LEARNER_PROFILE_TRANSCRIPTION_RATE_LIMITER",
        namespace_id: "104202",
        simple: { limit: 6, period: 60 },
      },
      {
        name: "LEARNER_PROFILE_ENRICHMENT_RATE_LIMITER",
        namespace_id: "104203",
        simple: { limit: 12, period: 60 },
      },
    ]);
  });

  it("keeps deployed v2 profile persistence independent of questionnaire tables", () => {
    const repository = readFileSync(
      new URL("../worker/learner-profile-repository.ts", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(repository, /\bquestionnaireQuestion\b/);
    assert.doesNotMatch(repository, /\bquestionnaire\b/);
    assert.doesNotMatch(repository, /\bassignQuestionnaireVersion\b/);
    assert.doesNotMatch(repository, /\basc\b/);
  });

  it("validates the six simple v2 prose questions", () => {
    const definition = validateLearnerProfileQuestionnaire(questionnaireV2);

    assert.deepEqual(
      definition.questions.map(({ promptEn }) => promptEn),
      [
        "Hi! I'm Peppa. What's your name?",
        "How old are you?",
        "What cartoons do you like?",
        "What animals do you like?",
        "What do you like doing for fun?",
        "What kind of stories do you like?",
      ],
    );
    assert.deepEqual(
      definition.questions.map(({ canonicalField }) => canonicalField),
      ["name", "age", null, null, null, null],
    );
    assert.deepEqual(
      definition.questions.map(
        ({ fallbackAcknowledgment }) => fallbackAcknowledgment,
      ),
      Array(6).fill("Thank you!"),
    );
    assert.ok(Object.isFrozen(definition));
    assert.ok(Object.isFrozen(definition.questions));
    assert.ok(definition.questions.every(Object.isFrozen));
  });

  it("rejects duplicate positions, unknown fields, and public-copy drift", () => {
    assert.throws(
      () =>
        validateLearnerProfileQuestionnaire({
          ...questionnaireV2,
          questions: questionnaireV2.questions.map((entry, index) =>
            index === 1 ? { ...entry, position: 1, mystery: true } : entry,
          ),
        }),
      /Invalid learner-profile questionnaire/,
    );

    assert.throws(
      () =>
        validateLearnerProfileQuestionnaire({
          ...questionnaireV2,
          questions: questionnaireV2.questions.map((entry, index) =>
            index === 0
              ? { ...entry, fallbackAcknowledgment: "Great job!" }
              : entry,
          ),
        }),
      /Invalid learner-profile questionnaire/,
    );

    assert.throws(() => {
      const question = { ...questionnaireV2.questions[2] };
      delete question.canonicalField;
      validateLearnerProfileQuestionnaire({
        ...questionnaireV2,
        questions: questionnaireV2.questions.map((entry, index) =>
          index === 2 ? question : entry,
        ),
      });
    }, /Invalid learner-profile questionnaire/);
  });

  it("exports only the current learner-profile Drizzle models", () => {
    for (const [exportName, expected] of Object.entries(EXPECTED_MODELS)) {
      const table = schema[exportName];
      assert.ok(table, `Expected schema.${exportName}`);
      assert.equal(getTableName(table), expected.table);
      assert.deepEqual(
        Object.keys(getTableColumns(table)),
        expected.properties,
      );
    }

    for (const exportName of [
      "guardianDubConsent",
      "learnerSelectionRequired",
      "learnerStoryArtGenerationLease",
      "personalizedStoryArt",
      "personalizedStoryArtGenerationLease",
      "profileSessionBypass",
      "questionnaire",
      "questionnaireQuestion",
    ]) {
      assert.equal(schema[exportName], undefined);
    }
  });

  it("generates the current D1 tables with foreign keys, checks, and lookup indexes", () => {
    const migrations = readMigrations();
    assert.ok(
      migrations.length >= 5 &&
        migrations.some(({ name }) => /^0004_/.test(name)),
      "Expected the conversation persistence migration",
    );

    const database = createMigratedDatabase();
    try {
      const profileSql = tableSql(database, "learner_profile");
      const selectionSql = tableSql(database, "session_learner_selection");
      const learnerBypassSql = tableSql(
        database,
        "onboarding_learner_session_bypass",
      );
      const learnerConsentSql = tableSql(database, "learner_dub_consent");

      assert.match(
        profileSql,
        /REFERENCES [`"]?user[`"]?\s*\([`"]?id[`"]?\).*ON DELETE cascade/i,
      );
      assert.match(
        profileSql,
        /CHECK\s*\(json_valid\([^)]*answers_json[^)]*\)\)/i,
      );
      assert.match(
        profileSql,
        /CHECK\s*\(json_valid\([^)]*skipped_question_keys_json[^)]*\)\)/i,
      );
      assert.match(
        profileSql,
        /CHECK\s*\([^\n]*onboarding_status[^\n]* in \('not_started', 'in_progress', 'completed'\)\)/i,
      );
      assert.match(
        profileSql,
        /answers_json[^,]*DEFAULT ['"]\{"schemaVersion":2,"questionnaireVersion":2,"responses":\{\},"description":null\}['"]/i,
      );
      for (const sql of [selectionSql, learnerBypassSql, learnerConsentSql]) {
        assert.match(
          sql,
          /REFERENCES [`"]?learner_profile[`"]?\s*\([`"]?id[`"]?\).*ON DELETE cascade/i,
        );
      }
      for (const table of REMOVED_TABLES) {
        assert.equal(tableSql(database, table), undefined);
      }

      const profileIndexes = indexDetails(database, "learner_profile");
      assert.ok(
        profileIndexes.some(
          (index) =>
            index.unique === 0 && index.columns.join() === "auth_user_id",
        ),
      );
      assert.ok(
        indexDetails(database, "account_deletion_tombstone").some(
          (index) => index.unique === 1 && index.columns.join() === "r2_prefix",
        ),
        "Expected deleted account media roots to remain reserved",
      );
      assert.ok(
        profileIndexes.some(
          (index) =>
            index.unique === 1 &&
            index.columns.join() === "auth_user_id,name_key",
        ),
      );
      assert.ok(
        profileIndexes.some(
          (index) =>
            index.unique === 1 &&
            index.columns.join() === "auth_user_id,private_media_name",
        ),
      );
    } finally {
      database.close();
    }
  });

  it("removes obsolete storage while preserving canonical v2 response envelopes", () => {
    const migrations = readMigrations();
    const migrationIndex = migrations.findIndex(
      ({ name }) => name === "0021_remove_legacy_compatibility.sql",
    );
    assert.ok(migrationIndex > 0);

    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON");
    try {
      for (const migration of migrations.slice(0, migrationIndex)) {
        database.exec(migration.sql);
      }
      for (const table of REMOVED_TABLES) {
        assert.ok(
          tableSql(database, table),
          `Expected pre-0021 table ${table}`,
        );
      }

      database.exec(`
        INSERT INTO user (id, name, email)
        VALUES ('user-current', 'Guardian', 'guardian-current@example.test');
        INSERT INTO session (id, expires_at, token, user_id)
        VALUES ('session-current', 9999999999999, 'token-current', 'user-current');
        INSERT INTO learner_profile
          (id, auth_user_id, legacy_storage_owner, name, private_media_name,
           name_key, answers_json, skipped_question_keys_json,
           questionnaire_version, current_question_key, onboarding_status)
        VALUES
          ('learner-current', 'user-current', 1, 'Mary', 'Mary', 'mary',
           '{"schemaVersion":2,"questionnaireVersion":1,"responses":{"name":{"question":"What is your name?","rawAnswer":"Mary","summary":"Mary","acknowledgment":"Thank you!","enrichmentStatus":"fallback","answeredAt":"2026-09-03T00:00:00.000Z"}},"legacyAnswers":{"name":"Mary"},"description":"Likes stories."}',
           '["age"]', NULL, 'cartoons', 'in_progress'),
          ('learner-obsolete', 'user-current', 0, 'Bob', 'Bob', 'bob',
           '{"name":"Bob"}', '["animals"]', NULL, 'animals', 'in_progress');
        INSERT INTO conversation_session
          (id, auth_user_id, learner_profile_id, scenario_key, scenario_version,
           prompt_style, room_name, status, controller_state, started_at)
        VALUES
          ('conversation-onboarding', 'user-current', 'learner-current',
           'onboarding', 1, NULL, 'room-onboarding', 'completed', '{}', 1),
          ('conversation-small-chat', 'user-current', 'learner-current',
           'small-chat', 2, 'tiny-turns', 'room-small-chat', 'completed', '{}', 1),
          ('conversation-profile-edit', 'user-current', 'learner-current',
           'profile-edit', 1, NULL, 'room-profile-edit', 'completed', '{}', 1),
          ('conversation-unknown', 'user-current', 'learner-current',
           'retired-purpose', 1, NULL, 'room-unknown', 'completed', '{}', 1),
          ('conversation-null-profile', 'user-current', NULL,
           'onboarding', 1, NULL, 'room-null-profile', 'completed', '{}', 1),
          ('conversation-invalid-style', 'user-current', 'learner-current',
           'small-chat', 2, NULL, 'room-invalid-style', 'completed', '{}', 1);
        INSERT INTO conversation_turn
          (id, conversation_id, provider_item_id, sequence, role, text, input_mode)
        VALUES
          ('turn-onboarding', 'conversation-onboarding', 'provider-onboarding', 0,
           'user', 'Hello', 'voice'),
          ('turn-small-chat', 'conversation-small-chat', 'provider-small-chat', 0,
           'user', 'Hello', 'voice'),
          ('turn-profile-edit', 'conversation-profile-edit', 'provider-profile-edit', 0,
           'user', 'Hello', 'voice'),
          ('turn-unknown', 'conversation-unknown', 'provider-unknown', 0,
           'user', 'Hello', 'voice'),
          ('turn-null-profile', 'conversation-null-profile', 'provider-null-profile', 0,
           'user', 'Hello', 'voice'),
          ('turn-invalid-style', 'conversation-invalid-style', 'provider-invalid-style', 0,
           'user', 'Hello', 'voice');
        INSERT INTO session_learner_selection
          (session_id, auth_user_id, learner_profile_id)
        VALUES ('session-current', 'user-current', 'learner-current');
        INSERT INTO onboarding_learner_session_bypass
          (session_id, learner_profile_id, skipped_at)
        VALUES ('session-current', 'learner-current', 1);
        INSERT INTO learner_dub_consent
          (learner_profile_id, auth_user_id, consent_version, grant_generation,
           state, granted_at, updated_at)
        VALUES ('learner-current', 'user-current', 'v1', 'generation-1',
          'granted', 1, 1);
      `);

      database.exec("BEGIN");
      try {
        database.exec(migrations[migrationIndex].sql);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }

      for (const table of REMOVED_TABLES) {
        assert.equal(tableSql(database, table), undefined);
      }
      const columns = database
        .prepare("PRAGMA table_info('learner_profile')")
        .all()
        .map(({ name }) => name);
      assert.ok(!columns.includes("legacy_storage_owner"));
      assert.ok(!columns.includes("questionnaire_version"));
      assert.ok(
        !database
          .prepare("PRAGMA table_info('account_deletion_tombstone')")
          .all()
          .some(({ name }) => name === "personalized_art_candidate_keys_json"),
      );
      assert.ok(
        !database
          .prepare("PRAGMA table_info('learner_profile_deletion_tombstone')")
          .all()
          .some(({ name }) => name === "legacy_storage_owner"),
      );

      const rows = database
        .prepare(
          `SELECT id, answers_json, skipped_question_keys_json,
                  current_question_key
           FROM learner_profile
           WHERE auth_user_id = 'user-current'
           ORDER BY id`,
        )
        .all();
      assert.deepEqual(readV2Answers({ answersJson: rows[0].answers_json }), {
        schemaVersion: 2,
        questionnaireVersion: 2,
        responses: {
          name: {
            question: "What is your name?",
            rawAnswer: "Mary",
            summary: "Mary",
            acknowledgment: "Thank you!",
            enrichmentStatus: "fallback",
            answeredAt: "2026-09-03T00:00:00.000Z",
          },
        },
        description: "Likes stories.",
      });
      assert.equal(rows[0].skipped_question_keys_json, '["age"]');
      assert.equal(rows[0].current_question_key, "cartoons");
      assert.deepEqual(JSON.parse(rows[1].answers_json), {
        schemaVersion: 2,
        questionnaireVersion: 2,
        responses: {},
        description: null,
      });
      assert.equal(rows[1].skipped_question_keys_json, "[]");
      assert.equal(rows[1].current_question_key, "name");
      assert.deepEqual(
        database
          .prepare("SELECT id FROM conversation_session ORDER BY id")
          .all()
          .map(({ id }) => id),
        ["conversation-onboarding", "conversation-small-chat"],
      );
      assert.deepEqual(
        database
          .prepare("SELECT id FROM conversation_turn ORDER BY id")
          .all()
          .map(({ id }) => id),
        ["turn-onboarding", "turn-small-chat"],
      );
      assert.equal(
        database
          .prepare("SELECT learner_profile_id FROM session_learner_selection")
          .get().learner_profile_id,
        "learner-current",
      );
      assert.equal(
        database
          .prepare("SELECT learner_profile_id FROM onboarding_learner_session_bypass")
          .get().learner_profile_id,
        "learner-current",
      );
      assert.equal(
        database
          .prepare("SELECT learner_profile_id FROM learner_dub_consent")
          .get().learner_profile_id,
        "learner-current",
      );
      assert.deepEqual(
        database
          .prepare("SELECT name FROM sqlite_master WHERE name LIKE '__backup_%'")
          .all(),
        [],
      );
      assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      database.close();
    }
  });

  it("backfills stable readable learner media names before enforcing uniqueness", () => {
    const migrations = readMigrations();
    const migrationIndex = migrations.findIndex(
      ({ name }) => name === "0020_human-readable-private-media.sql",
    );
    assert.ok(migrationIndex > 0);
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON");

    try {
      for (const migration of migrations.slice(0, migrationIndex)) {
        database.exec(migration.sql);
      }
      database.exec(`
        INSERT INTO user (id, name, email)
        VALUES ('user-a', 'Guardian', 'guardian@example.test');
        INSERT INTO learner_profile
          (id, auth_user_id, legacy_storage_owner, name, created_at, updated_at)
        VALUES
          ('learner-a', 'user-a', 1, NULL, 100, 100),
          ('learner-b', 'user-a', 0, 'Learner', 200, 200),
          ('learner-c', 'user-a', 0, NULL, 300, 300),
          ('learner-d', 'user-a', 0, ' Mary ', 400, 400);
        INSERT INTO learner_profile_deletion_tombstone
          (learner_profile_id, user_id_hash, legacy_storage_owner,
           generation, requested_at)
        VALUES
          ('learner-c', 'hash-c', 0, 1, 500),
          ('missing-learner', 'hash-missing', 0, 1, 500);
        INSERT INTO guardian_dub_consent
          (auth_user_id, consent_version, grant_generation, state,
           granted_at, updated_at)
        VALUES ('user-a', 'current-consent', 'current-generation', 'granted',
          600, 601);
        INSERT INTO learner_dub_consent
          (learner_profile_id, auth_user_id, consent_version, grant_generation,
           state, granted_at, updated_at)
        VALUES ('learner-a', 'user-a', 'stale-consent', 'stale-generation',
          'granted', 1, 1);
      `);

      database.exec(migrations[migrationIndex].sql);

      assert.deepEqual(
        database
          .prepare(
            `SELECT id, private_media_name, name_key
             FROM learner_profile
             WHERE auth_user_id = 'user-a'
             ORDER BY created_at, id`,
          )
          .all()
          .map((row) => ({ ...row })),
        [
          { id: "learner-a", private_media_name: "Learner", name_key: null },
          {
            id: "learner-b",
            private_media_name: "Learner (2)",
            name_key: "learner",
          },
          {
            id: "learner-c",
            private_media_name: "Learner (3)",
            name_key: null,
          },
          { id: "learner-d", private_media_name: "Mary", name_key: "mary" },
        ],
      );
      assert.deepEqual(
        database
          .prepare(
            `SELECT learner_profile_id, private_media_name
             FROM learner_profile_deletion_tombstone
             ORDER BY learner_profile_id`,
          )
          .all()
          .map((row) => ({ ...row })),
        [
          {
            learner_profile_id: "learner-c",
            private_media_name: "Learner (3)",
          },
          {
            learner_profile_id: "missing-learner",
            private_media_name: "Learner",
          },
        ],
      );
      assert.deepEqual(
        {
          ...database
            .prepare(
              `SELECT consent_version, grant_generation, granted_at, updated_at
               FROM learner_dub_consent
               WHERE learner_profile_id = 'learner-a'`,
            )
            .get(),
        },
        {
          consent_version: "current-consent",
          grant_generation: "current-generation",
          granted_at: 600,
          updated_at: 601,
        },
      );
      assert.throws(
        () =>
          database.exec(`
            INSERT INTO learner_profile
              (id, auth_user_id, legacy_storage_owner, name,
               private_media_name, name_key)
            VALUES ('learner-e', 'user-a', 0, 'MARY', 'Mary (2)', 'mary');
          `),
        /UNIQUE constraint failed: learner_profile\.auth_user_id, learner_profile\.name_key/,
      );
    } finally {
      database.close();
    }
  });

  it("prunes stale bypasses and cascades live bypasses with their session", () => {
    const migrations = readMigrations();
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON");

    try {
      for (const migration of migrations.slice(0, 3)) {
        database.exec(migration.sql);
      }
      database.exec(`
        INSERT INTO user (id, name, email) VALUES ('user-1', 'Mia', 'mia@example.test');
        INSERT INTO session (id, expires_at, token, user_id)
          VALUES ('session-live', 9999999999999, 'token-live', 'user-1');
        INSERT INTO onboarding_session_bypass (session_id, auth_user_id, skipped_at)
          VALUES
            ('session-live', 'user-1', 1),
            ('session-stale', 'user-1', 2);
      `);

      database.exec(migrations[3].sql);

      assert.deepEqual(
        database
          .prepare(
            "SELECT session_id FROM onboarding_session_bypass ORDER BY session_id",
          )
          .all()
          .map((row) => ({ ...row })),
        [{ session_id: "session-live" }],
      );

      database.exec("DELETE FROM session WHERE id = 'session-live'");
      assert.equal(
        database
          .prepare("SELECT count(*) AS count FROM onboarding_session_bypass")
          .get().count,
        0,
      );
      assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      database.close();
    }
  });
});

describe("checked-in questionnaire deployment", () => {
  it("serializes deploys without canceling a migration in progress", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/deploy-production.yml", import.meta.url),
      "utf8",
    );

    assert.match(workflow, /concurrency:[\s\S]*cancel-in-progress: false/);
  });

  it("ships v2 with code and removes the obsolete publisher", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    assert.equal(packageJson.scripts["questionnaire:publish"], undefined);
    assert.equal(
      existsSync(
        new URL("../scripts/publish-questionnaire.mjs", import.meta.url),
      ),
      false,
    );
    assert.equal(
      existsSync(
        new URL(
          "../content/learner-profile/questionnaire-v2.json",
          import.meta.url,
        ),
      ),
      true,
    );
  });

  it("uses saved acknowledgment audio without a runtime TTS boundary", () => {
    const questionnaireSource = readFileSync(
      new URL("../lib/learner-profile-questionnaire.js", import.meta.url),
      "utf8",
    );
    const workerSource = [
      readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8"),
      readFileSync(
        new URL("../worker/learner-profile.ts", import.meta.url),
        "utf8",
      ),
    ].join("\n");

    assert.equal(
      existsSync(
        new URL(
          "../worker/learner-profile-acknowledgment-audio.ts",
          import.meta.url,
        ),
      ),
      false,
    );
    assert.doesNotMatch(
      workerSource,
      /synthesizeAcknowledgment|synthesizeAudio|ElevenLabsEnv|ELEVENLABS_(?:API_KEY|REQUEST_TIMEOUT_MS)|api\.elevenlabs\.io/,
    );
    assert.match(
      questionnaireSource,
      /LEARNER_PROFILE_ACKNOWLEDGMENT_AUDIO_ID\s*=\s*"peppa-thank-you"/,
    );
    assert.match(
      workerSource,
      /resolveAudio\(LEARNER_PROFILE_ACKNOWLEDGMENT_AUDIO_ID, text\)/,
    );
  });
});
