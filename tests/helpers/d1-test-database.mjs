import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

class TestD1PreparedStatement {
  constructor(database, sql, parameters = []) {
    this.database = database;
    this.sql = sql;
    this.parameters = parameters;
  }

  bind(...parameters) {
    return new TestD1PreparedStatement(this.database, this.sql, parameters);
  }

  async all() {
    const results = this.database
      .prepare(this.sql)
      .all(...this.parameters);
    return { success: true, results, meta: {} };
  }

  async first(column) {
    const result = this.database
      .prepare(this.sql)
      .get(...this.parameters);
    return column ? result?.[column] ?? null : result ?? null;
  }

  async raw() {
    const statement = this.database.prepare(this.sql);
    const columns = statement.columns().map(({ name }) => name);
    return statement
      .all(...this.parameters)
      .map((row) => columns.map((column) => row[column]));
  }

  async run() {
    const result = this.database
      .prepare(this.sql)
      .run(...this.parameters);
    return {
      success: true,
      results: [],
      meta: {
        changes: result.changes,
        last_row_id: result.lastInsertRowid,
      },
    };
  }
}

export function createTestD1Database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");

  const migrationDirectory = new URL("../../migrations/", import.meta.url);
  for (const name of readdirSync(migrationDirectory)
    .filter((entry) => entry.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(new URL(name, migrationDirectory), "utf8"));
  }

  const d1 = {
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.all());
      return results;
    },
    async exec(sql) {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
    prepare(sql) {
      return new TestD1PreparedStatement(sqlite, sql);
    },
  };

  return {
    close: () => sqlite.close(),
    d1,
    sqlite,
  };
}
