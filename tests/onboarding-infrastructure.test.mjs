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
    properties: ["id", "version", "status", "createdAt", "activatedAt"],
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
    assert.ok(schema.questionnaireRelations);
    assert.ok(schema.questionnaireQuestionRelations);
  });

  it("generates additive D1 tables with foreign keys, checks, and lookup indexes", () => {
    const migrations = readMigrations();
    assert.equal(migrations.length, 2, "Expected one additive onboarding migration");
    assert.doesNotMatch(
      migrations[1].sql,
      /(?:^|\n)\s*(?:INSERT|UPDATE|DELETE)\b/im,
    );
    assert.doesNotMatch(migrations[1].sql, /ALTER TABLE [`"]?(?:user|session|account|verification)/i);

    const database = createMigratedDatabase();
    try {
      const profileSql = tableSql(database, "learner_profile");
      const questionnaireSql = tableSql(database, "questionnaire");
      const questionSql = tableSql(database, "questionnaire_question");

      assert.match(profileSql, /REFERENCES [`"]?user[`"]?\s*\([`"]?id[`"]?\).*ON DELETE cascade/i);
      assert.match(profileSql, /CHECK\s*\(json_valid\([^)]*answers_json[^)]*\)\)/i);
      assert.match(profileSql, /CHECK\s*\([^\n]*onboarding_status[^\n]* in \('not_started', 'in_progress', 'completed'\)\)/i);
      assert.match(questionnaireSql, /CHECK\s*\([^\n]*status[^\n]* in \('draft', 'active', 'inactive'\)\)/i);
      assert.match(questionSql, /CHECK\s*\([^\n]*answer_type[^\n]* in \('text', 'number', 'choice'\)\)/i);
      assert.match(questionSql, /CHECK\s*\([^\n]*cardinality[^\n]* in \('scalar', 'array'\)\)/i);
      for (const column of ["options_json", "validation_json", "branching_json"]) {
        assert.match(
          questionSql,
          new RegExp(`CHECK\\s*\\([^\\n]*${column}[^\\n]*json_valid\\([^\\n]*${column}`),
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
