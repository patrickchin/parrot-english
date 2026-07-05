import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, it } from "node:test";
import {
  buildQuestionnaireSql,
  validateQuestionnaireDefinition,
} from "../scripts/publish-questionnaire.mjs";
import * as schema from "../src/db/schema.ts";

const EXPECTED_MODELS = {
  learnerProfile: {
    table: "learner_profile",
    properties: [
      "id",
      "authUserId",
      "name",
      "age",
      "answersJson",
      "skippedQuestionKeysJson",
      "questionnaireVersion",
      "currentQuestionKey",
      "onboardingStatus",
      "lastSkippedAt",
      "lastSkippedSessionId",
      "completedAt",
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
  onboardingSessionBypass: {
    table: "onboarding_session_bypass",
    properties: ["sessionId", "authUserId", "skippedAt"],
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

describe("onboarding infrastructure", () => {
  it("exports separate learner profile and questionnaire Drizzle models", () => {
    for (const [exportName, expected] of Object.entries(EXPECTED_MODELS)) {
      const table = schema[exportName];
      assert.ok(table, `Expected schema.${exportName}`);
      assert.equal(getTableName(table), expected.table);
      assert.deepEqual(Object.keys(getTableColumns(table)), expected.properties);
    }

    assert.ok(schema.learnerProfileRelations);
    assert.ok(schema.onboardingSessionBypassRelations);
    assert.ok(schema.questionnaireRelations);
    assert.ok(schema.questionnaireQuestionRelations);
  });

  it("generates additive D1 tables with foreign keys, checks, and lookup indexes", () => {
    const migrations = readMigrations();
    assert.equal(migrations.length, 3, "Expected the onboarding recovery migration");
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

      const profileIndexes = indexDetails(database, "learner_profile");
      assert.ok(
        profileIndexes.some(
          (index) => index.unique === 1 && index.columns.join() === "auth_user_id",
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
});

describe("questionnaire publishing", () => {
  const definitionPath = new URL(
    "../content/onboarding/questionnaire-v1.json",
    import.meta.url,
  );

  function readDefinition() {
    return JSON.parse(readFileSync(definitionPath, "utf8"));
  }

  it("validates the complete initial questionnaire and saved audio contract", () => {
    const definition = readDefinition();
    const validated = validateQuestionnaireDefinition(definition);

    assert.equal(validated.version, 1);
    assert.equal(validated.questions.length, 5);
    assert.deepEqual(
      validated.questions.map(({ position }) => position),
      [1, 2, 3, 4, 5],
    );
    assert.deepEqual(
      validated.questions.map(({ answerKey }) => answerKey),
      [
        "age",
        "favoriteCartoons",
        "favoriteAnimals",
        "favoriteActivities",
        "favoriteStoryTopics",
      ],
    );

    for (const audioId of [
      validated.introductionAudioId,
      ...validated.questions.map(({ audioId }) => audioId),
    ]) {
      const line = validated.audioLines[audioId];
      assert.equal(line.speaker, "peppa", audioId);
      assert.equal(
        existsSync(new URL(`../public${line.src}`, import.meta.url)),
        true,
        `${audioId} source audio`,
      );
    }
  });

  it("rejects invalid ordering, forward branches, and audio prompt drift", () => {
    const definition = readDefinition();

    assert.throws(
      () =>
        validateQuestionnaireDefinition({
          ...definition,
          questions: definition.questions.map((entry, index) => ({
            ...entry,
            position: index === 4 ? 4 : entry.position,
          })),
        }),
      /positions must be unique and contiguous/i,
    );
    assert.throws(
      () =>
        validateQuestionnaireDefinition({
          ...definition,
          questions: definition.questions.map((entry, index) =>
            index === 0
              ? {
                  ...entry,
                  branching: {
                    key: "favoriteAnimals",
                    operator: "includes",
                    value: "dog",
                  },
                }
              : entry,
          ),
        }),
      /earlier question/i,
    );
    assert.throws(
      () =>
        validateQuestionnaireDefinition({
          ...definition,
          questions: definition.questions.map((entry, index) =>
            index === 0 ? { ...entry, promptEn: "A changed prompt" } : entry,
          ),
        }),
      /audio text must exactly match/i,
    );
  });

  it("builds escaped data-only activation SQL", () => {
    const definition = readDefinition();
    const sql = buildQuestionnaireSql(
      {
        ...definition,
        questions: definition.questions.map((entry, index) =>
          index === 1 ? { ...entry, promptZh: "孩子's choice" } : entry,
        ),
      },
      1_783_257_600_000,
    );

    assert.match(sql, /UPDATE questionnaire SET status = 'inactive'/);
    assert.match(sql, /INSERT INTO questionnaire /);
    assert.match(sql, /DELETE FROM questionnaire_question/);
    assert.equal(
      (sql.match(/INSERT INTO questionnaire_question/g) ?? []).length,
      5,
    );
    assert.match(sql, /孩子''s choice/);
    assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP)\b/i);
  });

  it("keeps an identical publish idempotent and rejects changed versions", () => {
    const definition = readDefinition();
    const database = createMigratedDatabase();
    try {
      database.exec(buildQuestionnaireSql(definition, 1_000));
      database.exec(buildQuestionnaireSql(definition, 2_000));

      const changed = JSON.parse(JSON.stringify(definition));
      changed.questions[0].validation.max = 18;
      assert.throws(
        () =>
          database.exec(
            `BEGIN; ${buildQuestionnaireSql(changed, 3_000)} COMMIT;`,
          ),
        /constraint/i,
      );
      database.exec("ROLLBACK");

      assert.equal(
        database
          .prepare(
            "SELECT definition_hash FROM questionnaire WHERE version = 1",
          )
          .get().definition_hash,
        "0e256950166405c15d0b7e303b733240f19558bb7aad48d217caaaf344014b8d",
      );
      assert.equal(
        database
          .prepare(
            "SELECT validation_json FROM questionnaire_question WHERE answer_key = 'age'",
          )
          .get().validation_json,
        '{"min":3,"max":17}',
      );
    } finally {
      database.close();
    }
  });

  it("migrates and publishes D1 before deploying the gated Worker", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url),
      "utf8",
    );
    const migration = workflow.indexOf(
      "wrangler d1 migrations apply parrot-english --remote",
    );
    const publish = workflow.indexOf(
      "npm run questionnaire:publish -- --remote",
    );
    const deploy = workflow.indexOf("wrangler deploy --config wrangler.jsonc");

    assert.ok(migration >= 0, "Expected a remote D1 migration step");
    assert.ok(publish > migration, "Expected questionnaire publish after migration");
    assert.ok(deploy > publish, "Expected Worker deploy after questionnaire publish");
  });

  it("exposes an explicit local-or-remote publish command", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    assert.equal(
      packageJson.scripts["questionnaire:publish"],
      "node scripts/publish-questionnaire.mjs",
    );
  });
});
