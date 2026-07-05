import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

const EXPECTED_COLUMNS = {
  user: [
    { name: "id", type: "TEXT", notNull: 1, primaryKey: 1 },
    { name: "name", type: "TEXT", notNull: 1 },
    { name: "email", type: "TEXT", notNull: 1 },
    {
      name: "emailVerified",
      type: "INTEGER",
      notNull: 1,
      defaultValue: "0",
    },
    { name: "image", type: "TEXT", notNull: 0 },
    { name: "createdAt", type: "INTEGER", notNull: 1 },
    { name: "updatedAt", type: "INTEGER", notNull: 1 },
  ],
  session: [
    { name: "id", type: "TEXT", notNull: 1, primaryKey: 1 },
    { name: "expiresAt", type: "INTEGER", notNull: 1 },
    { name: "token", type: "TEXT", notNull: 1 },
    { name: "createdAt", type: "INTEGER", notNull: 1 },
    { name: "updatedAt", type: "INTEGER", notNull: 1 },
    { name: "ipAddress", type: "TEXT", notNull: 0 },
    { name: "userAgent", type: "TEXT", notNull: 0 },
    { name: "userId", type: "TEXT", notNull: 1 },
  ],
  account: [
    { name: "id", type: "TEXT", notNull: 1, primaryKey: 1 },
    { name: "accountId", type: "TEXT", notNull: 1 },
    { name: "providerId", type: "TEXT", notNull: 1 },
    { name: "userId", type: "TEXT", notNull: 1 },
    { name: "accessToken", type: "TEXT", notNull: 0 },
    { name: "refreshToken", type: "TEXT", notNull: 0 },
    { name: "idToken", type: "TEXT", notNull: 0 },
    { name: "accessTokenExpiresAt", type: "INTEGER", notNull: 0 },
    { name: "refreshTokenExpiresAt", type: "INTEGER", notNull: 0 },
    { name: "scope", type: "TEXT", notNull: 0 },
    { name: "password", type: "TEXT", notNull: 0 },
    { name: "createdAt", type: "INTEGER", notNull: 1 },
    { name: "updatedAt", type: "INTEGER", notNull: 1 },
  ],
  verification: [
    { name: "id", type: "TEXT", notNull: 1, primaryKey: 1 },
    { name: "identifier", type: "TEXT", notNull: 1 },
    { name: "value", type: "TEXT", notNull: 1 },
    { name: "expiresAt", type: "INTEGER", notNull: 1 },
    { name: "createdAt", type: "INTEGER", notNull: 1 },
    { name: "updatedAt", type: "INTEGER", notNull: 1 },
  ],
};

const EXPECTED_INDEXES = [
  ["user", "user_email_unique", ["email"], 1],
  ["session", "session_token_unique", ["token"], 1],
  ["session", "session_user_id_idx", ["userId"], 0],
  ["account", "account_user_id_idx", ["userId"], 0],
  [
    "account",
    "account_provider_account_idx",
    ["providerId", "accountId"],
    0,
  ],
  ["verification", "verification_identifier_idx", ["identifier"], 0],
];

function readProjectFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function createAuthDatabase(migration) {
  const database = new DatabaseSync(":memory:");

  try {
    database.exec("PRAGMA foreign_keys = ON");
    database.exec(migration);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
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
    [{ table: "user", from: "userId", to: "id", onDelete: "CASCADE" }],
    `Expected ${table}.userId to cascade deletes from user.id`
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
    INSERT INTO "user" ("id", "name", "email", "createdAt", "updatedAt")
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
      ("id", "expiresAt", "token", "createdAt", "updatedAt", "userId")
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
        ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run("account-1", "provider-user-1", "credential", "user-1", 1, 1);
  database
    .prepare(`
      INSERT INTO "verification"
        ("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt")
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
  it("configures Better Auth and a local-capable D1 binding", () => {
    const packageJson = JSON.parse(readProjectFile("package.json"));
    const wrangler = readProjectFile("wrangler.jsonc");
    const tsconfig = readProjectFile("tsconfig.json");
    const devVars = readProjectFile(".dev.vars.example");
    const workerTypes = readProjectFile("worker-configuration.d.ts");

    assert.match(packageJson.dependencies["better-auth"], /^\^1\.6\./);
    assert.equal(
      packageJson.scripts["db:migrate:local"],
      "wrangler d1 migrations apply parrot-english-auth --local"
    );
    assert.match(wrangler, /"nodejs_compat"/);
    assert.match(wrangler, /"binding"\s*:\s*"DB"/);
    assert.match(wrangler, /"database_name"\s*:\s*"parrot-english-auth"/);
    assert.match(wrangler, /"migrations_dir"\s*:\s*"migrations"/);
    assert.match(
      wrangler,
      /"database_id"\s*:\s*"f1eb0748-0901-4b6e-821e-c120f6d6768e"/
    );
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

  it("defines the Better Auth core schema with lookup indexes", () => {
    const migration = readProjectFile("migrations/0001_better_auth.sql");
    const database = createAuthDatabase(migration);

    try {
      assertAuthSchema(database);
      assertAuthConstraints(database);
    } finally {
      database.close();
    }
  });

  it("rejects schema drift in the semantic checks", () => {
    const migration = readProjectFile("migrations/0001_better_auth.sql");
    const driftedMigration = migration.replace(
      'CREATE INDEX "session_user_id_idx" ON "session" ("userId");',
      'CREATE INDEX "session_user_id_idx" ON "session" ("token");'
    );
    assert.notEqual(
      driftedMigration,
      migration,
      "Expected the sensitivity fixture to alter the migration"
    );
    const database = createAuthDatabase(driftedMigration);

    try {
      assert.throws(
        () => assertAuthSchema(database),
        /session_user_id_idx.*userId/
      );
    } finally {
      database.close();
    }
  });
});
