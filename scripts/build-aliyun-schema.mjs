import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { postgresQuery } from "../backend/postgres.mjs";

const sqlite = new DatabaseSync(":memory:");
for (const name of readdirSync("migrations").filter((name) => name.endsWith(".sql")).sort()) {
  sqlite.exec(readFileSync(`migrations/${name}`, "utf8"));
}
const objects = sqlite.prepare("SELECT name, type, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
const tables = objects.filter(({ type }) => type === "table");
const ordered = [];
while (tables.length) {
  const index = tables.findIndex(({ name }) =>
    sqlite.prepare(`PRAGMA foreign_key_list("${name}")`).all().every((reference) =>
      reference.table === name || ordered.some((table) => table.name === reference.table),
    ),
  );
  if (index === -1) throw new Error("Database tables have cyclic dependencies.");
  ordered.push(...tables.splice(index, 1));
}
ordered.push(...objects.filter(({ type }) => type !== "table"));
const seed = ["user", "learner_profile"].flatMap((table) =>
  sqlite.prepare(`SELECT * FROM "${table}"`).all().map((row) => {
    const columns = Object.keys(row);
    const values = columns.map((column) => {
      const value = row[column];
      if (value === null) return "NULL";
      if (column.endsWith("_at")) return "0";
      return typeof value === "number" ? String(value) : `'${value.replaceAll("'", "''")}'`;
    });
    return `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${values.join(", ")});`;
  }),
);
const output = `-- Generated from the current app schema by scripts/build-aliyun-schema.mjs.
-- Baseline for a NEW, isolated PostgreSQL database; never apply to existing users.
BEGIN;
CREATE TABLE IF NOT EXISTS parrot_backend_migration (name text PRIMARY KEY);
CREATE FUNCTION unixepoch(mode text) RETURNS numeric LANGUAGE sql VOLATILE AS $$ SELECT extract(epoch FROM clock_timestamp()) $$;
CREATE FUNCTION max(a bigint, b bigint) RETURNS bigint LANGUAGE sql IMMUTABLE AS $$ SELECT greatest(a, b) $$;
CREATE FUNCTION json_valid(value text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$ BEGIN PERFORM value::jsonb; RETURN true; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END $$;
CREATE FUNCTION json_type(value text, path text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_typeof(jsonb_path_query_first(value::jsonb, path::jsonpath)) $$;
${ordered.map(({ sql }) => postgresQuery(sql).replace(/\binteger\b/gi, "bigint").replace(/\bDEFAULT false\b/gi, "DEFAULT 0").replace(/\bDEFAULT true\b/gi, "DEFAULT 1") + ";").join("\n")}
CREATE TABLE parrot_private_media (
  key text COLLATE "C" PRIMARY KEY, etag text NOT NULL, body bytea NOT NULL,
  uploaded bigint NOT NULL, custom_metadata jsonb NOT NULL, http_metadata jsonb NOT NULL
);
CREATE TABLE parrot_rate_limit (key text PRIMARY KEY, window_start bigint NOT NULL, hits integer NOT NULL);
${seed.join("\n")}
INSERT INTO parrot_backend_migration VALUES ('0001-isolated-postgres');
COMMIT;
`;
sqlite.close();
writeFileSync("backend/postgres-baseline.sql", output);
