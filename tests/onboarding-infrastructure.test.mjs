import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, it } from "node:test";
import questionnaireV2 from "../content/onboarding/questionnaire-v2.json" with { type: "json" };
import { validateOnboardingQuestionnaire } from "../lib/onboarding-questionnaire.js";
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
  it("keeps deployed v2 profile persistence independent of questionnaire tables", () => {
    const repository = readFileSync(
      new URL("../worker/onboarding-repository.ts", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(repository, /\bquestionnaireQuestion\b/);
    assert.doesNotMatch(repository, /\bquestionnaire\b/);
    assert.doesNotMatch(repository, /\bassignQuestionnaireVersion\b/);
    assert.doesNotMatch(repository, /\basc\b/);
  });

  it("validates the six simple v2 prose questions", () => {
    const definition = validateOnboardingQuestionnaire(questionnaireV2);

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
    assert.ok(Object.isFrozen(definition));
    assert.ok(Object.isFrozen(definition.questions));
    assert.ok(definition.questions.every(Object.isFrozen));
  });

  it("rejects duplicate positions and unknown definition fields", () => {
    assert.throws(
      () =>
        validateOnboardingQuestionnaire({
          ...questionnaireV2,
          questions: questionnaireV2.questions.map((entry, index) =>
            index === 1 ? { ...entry, position: 1, mystery: true } : entry,
          ),
        }),
      /Invalid onboarding questionnaire/,
    );
  });

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

describe("checked-in questionnaire deployment", () => {
  it("applies D1 migrations and deploys without publishing questionnaire rows", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url),
      "utf8",
    );
    const migration = workflow.indexOf(
      "wrangler d1 migrations apply parrot-english --remote",
    );
    const deploy = workflow.indexOf("wrangler deploy --config wrangler.jsonc");

    assert.ok(migration >= 0, "Expected a remote D1 migration step");
    assert.ok(deploy > migration, "Expected Worker deploy after migrations");
    assert.doesNotMatch(workflow, /questionnaire:publish|publish-questionnaire/);
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
        new URL("../content/onboarding/questionnaire-v2.json", import.meta.url),
      ),
      true,
    );
  });

  it("documents the runtime secret, JSON snapshots, and dormant legacy tables", () => {
    const documentation = [
      readFileSync(new URL("../README.md", import.meta.url), "utf8"),
      readFileSync(
        new URL("../docs/design/technical-architecture.md", import.meta.url),
        "utf8",
      ),
    ].join("\n");

    assert.match(documentation, /wrangler secret put ELEVENLABS_API_KEY/);
    assert.match(documentation, /answers_json/);
    assert.match(documentation, /checked-in.*questionnaire/i);
    assert.match(documentation, /dormant/i);
  });
});
