import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getTableColumns, getTableName } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";

const MODELS = {
  conversationSession: {
    table: "conversation_session",
    properties: [
      "id",
      "authUserId",
      "scenarioKey",
      "scenarioVersion",
      "roomName",
      "status",
      "finishReason",
      "controllerState",
      "startedAt",
      "endedAt",
      "createdAt",
      "updatedAt",
    ],
  },
  conversationTurn: {
    table: "conversation_turn",
    properties: [
      "id",
      "conversationId",
      "providerItemId",
      "sequence",
      "role",
      "text",
      "language",
      "inputMode",
      "interrupted",
      "startedAt",
      "endedAt",
      "createdAt",
    ],
  },
  conversationFact: {
    table: "conversation_fact",
    properties: [
      "id",
      "conversationId",
      "factKey",
      "valueJson",
      "sourceTurnIds",
      "status",
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

function migratedDatabase() {
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

function indexColumns(database, table) {
  return database
    .prepare(`PRAGMA index_list(${JSON.stringify(table)})`)
    .all()
    .map((index) => ({
      unique: index.unique,
      columns: database
        .prepare(`PRAGMA index_info(${JSON.stringify(index.name)})`)
        .all()
        .map((column) => column.name),
    }));
}

describe("conversation persistence infrastructure", () => {
  it("exports focused Drizzle table models and relations", () => {
    for (const [exportName, expected] of Object.entries(MODELS)) {
      const table = schema[exportName];
      assert.ok(table, `Expected schema.${exportName}`);
      assert.equal(getTableName(table), expected.table);
      assert.deepEqual(Object.keys(getTableColumns(table)), expected.properties);
    }

    assert.ok(schema.conversationSessionRelations);
    assert.ok(schema.conversationTurnRelations);
    assert.ok(schema.conversationFactRelations);
  });

  it("keeps realtime deployment production-shaped and enabled", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url),
      "utf8",
    );
    const dockerfile = readFileSync(
      new URL("../agent/Dockerfile", import.meta.url),
      "utf8",
    );
    const deployDockerfile = readFileSync(
      new URL("../Dockerfile", import.meta.url),
      "utf8",
    );
    const workerExample = readFileSync(
      new URL("../.dev.vars.example", import.meta.url),
      "utf8",
    );
    const agentExample = readFileSync(
      new URL("../.env.example", import.meta.url),
      "utf8",
    );
    const wrangler = readFileSync(
      new URL("../wrangler.jsonc", import.meta.url),
      "utf8",
    );
    const deployment = readFileSync(
      new URL("../docs/deployment/livekit-agent.md", import.meta.url),
      "utf8",
    );

    assert.ok(
      workflow.indexOf("d1 migrations apply") < workflow.indexOf("wrangler deploy"),
      "D1 migrations must run before the Worker deploy.",
    );
    assert.match(workflow, /npm run build:agent/);
    assert.match(dockerfile, /COPY package\.json package-lock\.json/);
    assert.match(dockerfile, /npm ci/);
    assert.match(
      dockerfile,
      /COPY lib \.\/lib/,
      "The agent image must include every shared runtime module imported from lib.",
    );
    assert.equal(deployDockerfile, dockerfile);
    assert.match(dockerfile, /ca-certificates/);
    assert.match(dockerfile, /USER node/);
    assert.match(wrangler, /"REALTIME_CONVERSATIONS_ENABLED": "1"/);
    for (const name of [
      "LIVEKIT_URL",
      "LIVEKIT_API_KEY",
      "LIVEKIT_API_SECRET",
      "CONVERSATION_AGENT_SECRET",
    ]) {
      assert.match(workerExample, new RegExp(`^${name}=`, "m"));
    }
    for (const name of [
      "CONVERSATION_INGEST_URL",
      "AGENT_STT_MODEL",
      "AGENT_LLM_MODEL",
      "AGENT_TTS_MODEL",
      "AGENT_TTS_VOICE_ID",
    ]) {
      assert.match(agentExample, new RegExp(`^${name}=`, "m"));
    }
    assert.doesNotMatch(workerExample, /sk-[A-Za-z0-9]/);
    assert.doesNotMatch(agentExample, /sk-[A-Za-z0-9]/);
    for (const command of [
      "npm run db:migrate:local",
      "npm run build",
      "npm run build:agent",
      "lk agent create",
      "lk agent deploy",
    ]) {
      assert.match(deployment, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(deployment, /REALTIME_CONVERSATIONS_ENABLED/);
    assert.match(deployment, /record: false/);
    assert.match(deployment, /form fallback/i);
  });

  it("migrates constrained conversation storage with cascading ownership", () => {
    const migrations = readMigrations();
    assert.ok(migrations.length >= 5);
    assert.ok(migrations.some(({ name }) => /^0004_/.test(name)));

    const database = migratedDatabase();
    try {
      const sessionSql = tableSql(database, "conversation_session");
      const turnSql = tableSql(database, "conversation_turn");
      const factSql = tableSql(database, "conversation_fact");

      assert.match(sessionSql, /REFERENCES [`"]?user[`"]?\s*\([`"]?id[`"]?\).*ON DELETE cascade/i);
      assert.match(sessionSql, /json_valid\([^)]*controller_state/i);
      assert.match(sessionSql, /starting.*active.*completed.*stopped.*disconnected.*failed.*abandoned/i);
      assert.match(turnSql, /REFERENCES [`"]?conversation_session/i);
      assert.match(turnSql, /CHECK\s*\([^\n]*role[^\n]*user[^\n]*assistant/i);
      assert.match(turnSql, /CHECK\s*\([^\n]*input_mode[^\n]*voice[^\n]*text/i);
      assert.match(factSql, /REFERENCES [`"]?conversation_session/i);
      assert.match(factSql, /json_valid\([^)]*value_json/i);
      assert.match(factSql, /json_valid\([^)]*source_turn_ids/i);
      assert.match(factSql, /candidate.*accepted.*edited.*rejected/i);

      const turnIndexes = indexColumns(database, "conversation_turn");
      assert.ok(
        turnIndexes.some(
          (index) =>
            index.unique === 1 &&
            index.columns.join() === "conversation_id,provider_item_id",
        ),
      );
      assert.ok(
        turnIndexes.some(
          (index) =>
            index.unique === 1 &&
            index.columns.join() === "conversation_id,sequence",
        ),
      );

      database.exec(`
        INSERT INTO user (id, name, email) VALUES ('user-1', 'Mia', 'mia@example.test');
        INSERT INTO conversation_session
          (id, auth_user_id, scenario_key, scenario_version, room_name, status, controller_state, started_at)
          VALUES ('conversation-1', 'user-1', 'learner-profile.get-to-know-you', 1, 'room-1', 'active', '{}', 1);
        INSERT INTO conversation_turn
          (id, conversation_id, provider_item_id, sequence, role, text, input_mode)
          VALUES ('turn-1', 'conversation-1', 'provider-1', 1, 'user', 'Hello', 'voice');
        INSERT INTO conversation_fact
          (id, conversation_id, fact_key, value_json, source_turn_ids, status)
          VALUES ('fact-1', 'conversation-1', 'name', '"Mia"', '["turn-1"]', 'candidate');
      `);
      database.exec("DELETE FROM user WHERE id = 'user-1'");
      assert.equal(
        database.prepare("SELECT count(*) count FROM conversation_session").get().count,
        0,
      );
      assert.equal(
        database.prepare("SELECT count(*) count FROM conversation_turn").get().count,
        0,
      );
      assert.equal(
        database.prepare("SELECT count(*) count FROM conversation_fact").get().count,
        0,
      );
    } finally {
      database.close();
    }
  });
});
