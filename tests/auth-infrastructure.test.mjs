import assert from "node:assert/strict";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { getTableColumns, getTableName } from "drizzle-orm";
import * as authSchema from "../src/db/schema.ts";

const EXPECTED_COLUMNS = {
  user: [
    { name: "id", type: "TEXT", notNull: 1, primaryKey: 1 },
    { name: "name", type: "TEXT", notNull: 1 },
    { name: "email", type: "TEXT", notNull: 1 },
    {
      name: "email_verified",
      type: "INTEGER",
      notNull: 1,
      defaultValue: "false",
    },
    { name: "image", type: "TEXT", notNull: 0 },
    { name: "created_at", type: "INTEGER", notNull: 1 },
    { name: "updated_at", type: "INTEGER", notNull: 1 },
  ],
  session: [
    { name: "id", type: "TEXT", notNull: 1, primaryKey: 1 },
    { name: "expires_at", type: "INTEGER", notNull: 1 },
    { name: "token", type: "TEXT", notNull: 1 },
    { name: "created_at", type: "INTEGER", notNull: 1 },
    { name: "updated_at", type: "INTEGER", notNull: 1 },
    { name: "ip_address", type: "TEXT", notNull: 0 },
    { name: "user_agent", type: "TEXT", notNull: 0 },
    { name: "user_id", type: "TEXT", notNull: 1 },
  ],
  account: [
    { name: "id", type: "TEXT", notNull: 1, primaryKey: 1 },
    { name: "account_id", type: "TEXT", notNull: 1 },
    { name: "provider_id", type: "TEXT", notNull: 1 },
    { name: "user_id", type: "TEXT", notNull: 1 },
    { name: "access_token", type: "TEXT", notNull: 0 },
    { name: "refresh_token", type: "TEXT", notNull: 0 },
    { name: "id_token", type: "TEXT", notNull: 0 },
    { name: "access_token_expires_at", type: "INTEGER", notNull: 0 },
    { name: "refresh_token_expires_at", type: "INTEGER", notNull: 0 },
    { name: "scope", type: "TEXT", notNull: 0 },
    { name: "password", type: "TEXT", notNull: 0 },
    { name: "created_at", type: "INTEGER", notNull: 1 },
    { name: "updated_at", type: "INTEGER", notNull: 1 },
  ],
  verification: [
    { name: "id", type: "TEXT", notNull: 1, primaryKey: 1 },
    { name: "identifier", type: "TEXT", notNull: 1 },
    { name: "value", type: "TEXT", notNull: 1 },
    { name: "expires_at", type: "INTEGER", notNull: 1 },
    { name: "created_at", type: "INTEGER", notNull: 1 },
    { name: "updated_at", type: "INTEGER", notNull: 1 },
  ],
};

const EXPECTED_INDEXES = [
  ["user", "user_email_unique", ["email"], 1],
  ["session", "session_token_unique", ["token"], 1],
  ["session", "session_user_id_idx", ["user_id"], 0],
  ["account", "account_user_id_idx", ["user_id"], 0],
  [
    "account",
    "account_provider_account_idx",
    ["provider_id", "account_id"],
    0,
  ],
  ["verification", "verification_identifier_idx", ["identifier"], 0],
];

const EXPECTED_TABLE_MODELS = {
  user: {
    properties: [
      "id",
      "name",
      "email",
      "emailVerified",
      "image",
      "createdAt",
      "updatedAt",
    ],
    columns: EXPECTED_COLUMNS.user.map(({ name }) => name),
  },
  session: {
    properties: [
      "id",
      "expiresAt",
      "token",
      "createdAt",
      "updatedAt",
      "ipAddress",
      "userAgent",
      "userId",
    ],
    columns: EXPECTED_COLUMNS.session.map(({ name }) => name),
  },
  account: {
    properties: [
      "id",
      "accountId",
      "providerId",
      "userId",
      "accessToken",
      "refreshToken",
      "idToken",
      "accessTokenExpiresAt",
      "refreshTokenExpiresAt",
      "scope",
      "password",
      "createdAt",
      "updatedAt",
    ],
    columns: EXPECTED_COLUMNS.account.map(({ name }) => name),
  },
  verification: {
    properties: [
      "id",
      "identifier",
      "value",
      "expiresAt",
      "createdAt",
      "updatedAt",
    ],
    columns: EXPECTED_COLUMNS.verification.map(({ name }) => name),
  },
};

function readProjectFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function readSqlMigrations(
  migrationsDirectory = new URL("../migrations/", import.meta.url)
) {
  const migrationFiles = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  assert.ok(
    migrationFiles.length > 0,
    "Expected at least one SQL migration"
  );
  assert.ok(
    !migrationFiles.includes("0001_better_auth.sql"),
    "Expected the legacy handwritten migration to remain removed"
  );

  return migrationFiles.map((name) => ({
    name,
    sql: readFileSync(
      migrationsDirectory instanceof URL
        ? new URL(name, migrationsDirectory)
        : join(migrationsDirectory, name),
      "utf8"
    ),
  }));
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function createAuthDatabase(migrations) {
  const database = new DatabaseSync(":memory:");

  try {
    database.exec("PRAGMA foreign_keys = ON");
    for (const migration of migrations) {
      database.exec(migration.sql);
    }
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

function assertTableModel(
  table,
  expectedName,
  expectedProperties,
  expectedColumns
) {
  const columns = getTableColumns(table);

  assert.equal(getTableName(table), expectedName);
  assert.deepEqual(
    Object.keys(columns),
    expectedProperties,
    `Expected ${expectedName} to expose the Better Auth model properties`
  );
  assert.deepEqual(
    Object.values(columns).map(({ name }) => name),
    expectedColumns,
    `Expected ${expectedName} properties to map to the database columns`
  );
}

function assertTableSchema(database, table, expectedColumns) {
  const columns = database
    .prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
    .all();

  assert.deepEqual(
    columns.map(({ name }) => name),
    expectedColumns.map(({ name }) => name),
    `Expected ${table} to have the Better Auth columns`
  );

  for (const expected of expectedColumns) {
    const column = columns.find(({ name }) => name === expected.name);

    assert.equal(
      column.type,
      expected.type,
      `Expected ${table}.${expected.name} to use ${expected.type}`
    );
    assert.equal(
      column.notnull,
      expected.notNull,
      `Expected ${table}.${expected.name} NOT NULL to be ${expected.notNull}`
    );
    if (Object.hasOwn(expected, "defaultValue")) {
      assert.equal(
        column.dflt_value,
        expected.defaultValue,
        `Expected ${table}.${expected.name} default to be ${expected.defaultValue}`
      );
    }
    if (Object.hasOwn(expected, "primaryKey")) {
      assert.equal(
        column.pk,
        expected.primaryKey,
        `Expected ${table}.${expected.name} to be the primary key`
      );
    }
  }
}

function assertIndex(database, table, indexName, expectedColumns, unique) {
  const indexes = database
    .prepare(`PRAGMA index_list(${quoteIdentifier(table)})`)
    .all();
  const index = indexes.find(({ name }) => name === indexName);

  assert.ok(index, `Expected ${table} to define ${indexName}`);
  assert.equal(
    index.unique,
    unique,
    `Expected ${indexName} uniqueness to be ${unique}`
  );

  const columns = database
    .prepare(`PRAGMA index_info(${quoteIdentifier(indexName)})`)
    .all()
    .map(({ name }) => name);
  assert.deepEqual(
    columns,
    expectedColumns,
    `Expected ${indexName} to target ${expectedColumns.join(", ")}`
  );
}

function assertCascadeForeignKey(database, table) {
  const foreignKeys = database
    .prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`)
    .all()
    .map((foreignKey) => ({
      table: foreignKey.table,
      from: foreignKey.from,
      to: foreignKey.to,
      onDelete: foreignKey.on_delete,
    }));

  assert.deepEqual(
    foreignKeys,
    [{ table: "user", from: "user_id", to: "id", onDelete: "CASCADE" }],
    `Expected ${table}.user_id to cascade deletes from user.id`
  );
}

function assertAuthSchema(database) {
  assert.equal(
    database.prepare("PRAGMA foreign_keys").get().foreign_keys,
    1,
    "Expected foreign key enforcement to be enabled"
  );

  for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
    assertTableSchema(database, table, columns);
  }
  for (const [table, indexName, columns, unique] of EXPECTED_INDEXES) {
    assertIndex(database, table, indexName, columns, unique);
  }

  assertCascadeForeignKey(database, "session");
  assertCascadeForeignKey(database, "account");
}

function assertAuthConstraints(database) {
  const insertUser = database.prepare(`
    INSERT INTO "user" ("id", "name", "email", "created_at", "updated_at")
    VALUES (?, ?, ?, ?, ?)
  `);
  insertUser.run("user-1", "Parrot Learner", "learner@example.com", 1, 1);
  assert.throws(
    () =>
      insertUser.run(
        "duplicate-email-user",
        "Another Learner",
        "learner@example.com",
        1,
        1
      ),
    /UNIQUE constraint failed: user\.email/
  );

  const insertSession = database.prepare(`
    INSERT INTO "session"
      ("id", "expires_at", "token", "created_at", "updated_at", "user_id")
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertSession.run("session-1", 2, "session-token", 1, 1, "user-1");
  assert.throws(
    () =>
      insertSession.run(
        "duplicate-token-session",
        2,
        "session-token",
        1,
        1,
        "user-1"
      ),
    /UNIQUE constraint failed: session\.token/
  );

  database
    .prepare(`
      INSERT INTO "account"
        ("id", "account_id", "provider_id", "user_id", "created_at", "updated_at")
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run("account-1", "provider-user-1", "credential", "user-1", 1, 1);
  database
    .prepare(`
      INSERT INTO "verification"
        ("id", "identifier", "value", "expires_at", "created_at", "updated_at")
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run("verification-1", "learner@example.com", "code", 2, 1, 1);

  database.prepare('DELETE FROM "user" WHERE "id" = ?').run("user-1");

  assert.equal(
    database.prepare('SELECT count(*) AS count FROM "session"').get().count,
    0,
    "Expected deleting a user to cascade to sessions"
  );
  assert.equal(
    database.prepare('SELECT count(*) AS count FROM "account"').get().count,
    0,
    "Expected deleting a user to cascade to accounts"
  );
}

describe("authentication infrastructure", () => {
  it("explicitly enables Cloudflare Worker preview URLs", () => {
    const wrangler = JSON.parse(readProjectFile("wrangler.jsonc"));

    assert.equal(wrangler.preview_urls, true);
  });

  it("configures Better Auth and a local-capable D1 binding", () => {
    const packageJson = JSON.parse(readProjectFile("package.json"));
    const wrangler = readProjectFile("wrangler.jsonc");
    const drizzleConfig = readProjectFile("drizzle.config.ts");
    const tsconfig = readProjectFile("tsconfig.json");
    const devVars = readProjectFile(".dev.vars.example");
    const workerTypes = readProjectFile("worker-configuration.d.ts");

    assert.match(packageJson.dependencies["better-auth"], /^\^1\.6\./);
    assert.match(packageJson.dependencies["drizzle-orm"], /^\^0\.45\./);
    assert.match(packageJson.devDependencies["drizzle-kit"], /^\^0\.31\./);
    assert.equal(packageJson.scripts["db:generate"], "drizzle-kit generate");
    assert.equal(
      packageJson.scripts["db:migrate:local"],
      "wrangler d1 migrations apply parrot-english --local"
    );
    assert.match(drizzleConfig, /dialect:\s*["']sqlite["']/);
    assert.match(drizzleConfig, /out:\s*["']\.\/migrations["']/);
    assert.match(drizzleConfig, /schema:\s*["']\.\/src\/db\/schema\.ts["']/);
    assert.match(wrangler, /"nodejs_compat"/);
    assert.match(wrangler, /"binding"\s*:\s*"DB"/);
    assert.match(
      wrangler,
      /"database_name"\s*:\s*"parrot-english"\s*,\s*"database_id"\s*:\s*"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/i
    );
    assert.doesNotMatch(wrangler, /parrot-english-auth/);
    assert.match(wrangler, /"migrations_dir"\s*:\s*"migrations"/);
    assert.match(tsconfig, /worker-configuration\.d\.ts/);
    assert.equal(
      devVars,
      "GROQ_API_KEY=your_groq_api_key_here\n" +
        "BETTER_AUTH_SECRET=replace_with_at_least_32_random_characters\n" +
        "BETTER_AUTH_URL=http://localhost:3000\n"
    );
    assert.match(workerTypes, /\bDB:\s*D1Database;/);
    assert.match(workerTypes, /\bdeclare abstract class D1Database\b/);
    assert.match(workerTypes, /\btype Fetcher</);
  });

  it("discovers and applies every shared-database migration in order", () => {
    const migrationsDirectory = mkdtempSync(
      join(tmpdir(), "parrot-migrations-")
    );

    try {
      writeFileSync(
        join(migrationsDirectory, "0001_feature.sql"),
        'ALTER TABLE "probe" ADD COLUMN "name" TEXT;'
      );
      writeFileSync(
        join(migrationsDirectory, "0000_base.sql"),
        'CREATE TABLE "probe" ("id" INTEGER PRIMARY KEY);'
      );

      const migrations = readSqlMigrations(migrationsDirectory);
      assert.deepEqual(
        migrations.map(({ name }) => name),
        ["0000_base.sql", "0001_feature.sql"]
      );

      const database = createAuthDatabase(migrations);
      try {
        assert.deepEqual(
          database
            .prepare('PRAGMA table_info("probe")')
            .all()
            .map(({ name }) => name),
          ["id", "name"]
        );
      } finally {
        database.close();
      }
    } finally {
      rmSync(migrationsDirectory, { recursive: true, force: true });
    }
  });

  it("exports exact Better Auth Drizzle table models", () => {
    for (const [name, expected] of Object.entries(EXPECTED_TABLE_MODELS)) {
      assertTableModel(
        authSchema[name],
        name,
        expected.properties,
        expected.columns
      );
    }

    assert.throws(
      () =>
        assertTableModel(
          authSchema.user,
          "user",
          EXPECTED_TABLE_MODELS.user.properties.with(3, "verified"),
          EXPECTED_TABLE_MODELS.user.columns
        ),
      /user.*Better Auth model properties/
    );
  });

  it("defines the Better Auth core schema with lookup indexes", () => {
    const migrations = readSqlMigrations();
    const database = createAuthDatabase(migrations);

    try {
      assertAuthSchema(database);
      assertAuthConstraints(database);
    } finally {
      database.close();
    }
  });

  it("rejects schema drift in the semantic checks", () => {
    const migrations = readSqlMigrations();
    const driftedMigration = migrations[0].sql.replace(
      'CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);',
      'CREATE INDEX "session_user_id_idx" ON "session" ("token");'
    );
    assert.notEqual(
      driftedMigration,
      migrations[0].sql,
      "Expected the sensitivity fixture to alter the migration"
    );
    const database = createAuthDatabase([
      { ...migrations[0], sql: driftedMigration },
      ...migrations.slice(1),
    ]);

    try {
      assert.throws(
        () => assertAuthSchema(database),
        /session_user_id_idx.*user_id/
      );
    } finally {
      database.close();
    }
  });
});
