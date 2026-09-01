import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, it } from "node:test";
import questionnaireV2 from "../content/learner-profile/questionnaire-v2.json" with { type: "json" };
import { validateLearnerProfileQuestionnaire } from "../lib/learner-profile-questionnaire.js";
import * as schema from "../src/db/schema.ts";

const EXPECTED_MODELS = {
  learnerProfile: {
    table: "learner_profile",
    properties: [
      "id",
      "authUserId",
      "legacyStorageOwner",
      "name",
      "age",
      "storyLevel",
      "answersJson",
      "skippedQuestionKeysJson",
      "questionnaireVersion",
      "currentQuestionKey",
      "profileStatus",
      "lastSkippedAt",
      "lastSkippedSessionId",
      "completedAt",
      "lessonRecordingConsentVersion",
      "lessonRecordingConsentAt",
      "lessonRecordingGeneration",
      "lessonRecordingCleanupBeforeGeneration",
      "createdAt",
      "updatedAt",
    ],
  },
  questionnaire: {
    table: "questionnaire",
    properties: [
      "id",
      "version",
      "status",
      "definitionHash",
      "createdAt",
      "activatedAt",
    ],
  },
  questionnaireQuestion: {
    table: "questionnaire_question",
    properties: [
      "id",
      "questionnaireId",
      "answerKey",
      "position",
      "promptEn",
      "promptZh",
      "answerType",
      "cardinality",
      "required",
      "optionsJson",
      "validationJson",
      "branchingJson",
      "audioId",
    ],
  },
  profileSessionBypass: {
    table: "onboarding_session_bypass",
    properties: ["sessionId", "authUserId", "skippedAt"],
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
  learnerStoryArtGenerationLease: {
    table: "learner_story_art_generation_lease",
    properties: [
      "learnerProfileId",
      "authUserId",
      "storyId",
      "generationToken",
      "candidateR2ObjectKey",
      "previousR2ObjectKey",
      "leaseExpiresAt",
      "createdAt",
      "updatedAt",
    ],
  },
};

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
        name: "EVALUATE_RATE_LIMITER",
        namespace_id: "104201",
        simple: { limit: 8, period: 60 },
      },
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
      definition.questions.map(({ fallbackAcknowledgment }) =>
        fallbackAcknowledgment
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
  });

  it("exports separate learner profile and questionnaire Drizzle models", () => {
    for (const [exportName, expected] of Object.entries(EXPECTED_MODELS)) {
      const table = schema[exportName];
      assert.ok(table, `Expected schema.${exportName}`);
      assert.equal(getTableName(table), expected.table);
      assert.deepEqual(Object.keys(getTableColumns(table)), expected.properties);
    }

    assert.ok(schema.sessionLearnerSelection);
    assert.ok(schema.learnerSessionBypass);
    assert.ok(schema.learnerDubConsent);
    assert.ok(schema.learnerStoryArtGenerationLease);
  });

  it("generates additive D1 tables with foreign keys, checks, and lookup indexes", () => {
    const migrations = readMigrations();
    assert.ok(
      migrations.length >= 5 && migrations.some(({ name }) => /^0004_/.test(name)),
      "Expected the conversation persistence migration",
    );
    assert.doesNotMatch(
      migrations[1].sql,
      /(?:^|\n)\s*(?:INSERT|UPDATE|DELETE)\b/im,
    );
    assert.doesNotMatch(migrations[1].sql, /ALTER TABLE [`"]?(?:user|session|account|verification)/i);
    assert.match(
      migrations[2].sql,
      /UPDATE [`"]?questionnaire[`"]?\s+SET [`"]?definition_hash/i,
    );
    assert.doesNotMatch(
      migrations[2].sql,
      /(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?[`"]?(?:user|session|account|verification)/i,
    );

    const database = createMigratedDatabase();
    try {
      const profileSql = tableSql(database, "learner_profile");
      const questionnaireSql = tableSql(database, "questionnaire");
      const questionSql = tableSql(database, "questionnaire_question");
      const bypassSql = tableSql(database, "onboarding_session_bypass");
      const selectionSql = tableSql(database, "session_learner_selection");
      const learnerBypassSql = tableSql(
        database,
        "onboarding_learner_session_bypass",
      );
      const learnerConsentSql = tableSql(database, "learner_dub_consent");
      const learnerLeaseSql = tableSql(
        database,
        "learner_story_art_generation_lease",
      );

      assert.match(profileSql, /REFERENCES [`"]?user[`"]?\s*\([`"]?id[`"]?\).*ON DELETE cascade/i);
      assert.match(profileSql, /CHECK\s*\(json_valid\([^)]*answers_json[^)]*\)\)/i);
      assert.match(
        profileSql,
        /CHECK\s*\(json_valid\([^)]*skipped_question_keys_json[^)]*\)\)/i,
      );
      assert.match(profileSql, /CHECK\s*\([^\n]*onboarding_status[^\n]* in \('not_started', 'in_progress', 'completed'\)\)/i);
      assert.match(questionnaireSql, /[`"]?definition_hash[`"]?\s+text/i);
      assert.match(questionnaireSql, /CHECK\s*\([^\n]*status[^\n]* in \('draft', 'active', 'inactive'\)\)/i);
      assert.match(questionSql, /CHECK\s*\([^\n]*answer_type[^\n]* in \('text', 'number', 'choice'\)\)/i);
      assert.match(questionSql, /CHECK\s*\([^\n]*cardinality[^\n]* in \('scalar', 'array'\)\)/i);
      for (const column of ["options_json", "validation_json", "branching_json"]) {
        assert.match(
          questionSql,
          new RegExp(`CHECK\\s*\\([^\\n]*${column}[^\\n]*json_valid\\([^\\n]*${column}`),
        );
      }
      assert.match(
        bypassSql,
        /REFERENCES [`"]?user[`"]?\s*\([`"]?id[`"]?\).*ON DELETE cascade/i,
      );
      assert.match(
        bypassSql,
        /REFERENCES [`"]?session[`"]?\s*\([`"]?id[`"]?\).*ON DELETE cascade/i,
      );
      for (const sql of [selectionSql, learnerBypassSql, learnerConsentSql, learnerLeaseSql]) {
        assert.match(
          sql,
          /REFERENCES [`"]?learner_profile[`"]?\s*\([`"]?id[`"]?\).*ON DELETE cascade/i,
        );
      }

      const profileIndexes = indexDetails(database, "learner_profile");
      assert.ok(
        profileIndexes.some(
          (index) => index.unique === 1 && index.columns.join() === "auth_user_id",
        ),
      );
      assert.ok(
        profileIndexes.some(
          (index) =>
            index.unique === 1 && index.columns.join() === "id,auth_user_id",
        ),
      );
      assert.ok(
        profileIndexes.some(
          (index) => index.columns.join() === "questionnaire_version,onboarding_status",
        ),
      );

      const questionnaireIndexes = indexDetails(database, "questionnaire");
      assert.ok(
        questionnaireIndexes.some(
          (index) => index.unique === 1 && index.columns.join() === "version",
        ),
      );
      assert.ok(
        questionnaireIndexes.some((index) => index.columns.join() === "status"),
      );

      const questionIndexes = indexDetails(database, "questionnaire_question");
      assert.ok(
        questionIndexes.some(
          (index) =>
            index.unique === 1 &&
            index.columns.join() === "questionnaire_id,answer_key",
        ),
      );
      assert.ok(
        questionIndexes.some(
          (index) =>
            index.unique === 1 &&
            index.columns.join() === "questionnaire_id,position",
        ),
      );

      const bypassIndexes = indexDetails(database, "onboarding_session_bypass");
      assert.ok(
        bypassIndexes.some((index) => index.columns.join() === "auth_user_id"),
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
      new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url),
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
      existsSync(new URL("../scripts/publish-questionnaire.mjs", import.meta.url)),
      false,
    );
    assert.equal(
      existsSync(
        new URL("../content/learner-profile/questionnaire-v2.json", import.meta.url),
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
      readFileSync(new URL("../worker/learner-profile.ts", import.meta.url), "utf8"),
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
