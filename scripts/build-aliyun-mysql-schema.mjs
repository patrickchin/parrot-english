import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mysqlQuery } from "../backend/mysql.mjs";

const sqlite = new DatabaseSync(":memory:");
for (const name of readdirSync("migrations").filter((name) => name.endsWith(".sql")).sort()) sqlite.exec(readFileSync(`migrations/${name}`, "utf8"));
const tables = sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
const ordered = [];
while (tables.length) {
  const index = tables.findIndex(({ name }) => sqlite.prepare(`PRAGMA foreign_key_list("${name}")`).all().every(({ table }) => ordered.some((entry) => entry.name === table) || table === name));
  if (index < 0) throw new Error("Database tables have cyclic dependencies.");
  ordered.push(...tables.splice(index, 1));
}
const indexes = sqlite.prepare("SELECT tbl_name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY rowid").all();
const output = [
  "-- Generated baseline for a NEW isolated MySQL 8.0.18+ database. Never apply to existing data.",
  "SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_BACKSLASH_ESCAPES,NO_ENGINE_SUBSTITUTION';",
  "CREATE TABLE parrot_backend_migration (name varchar(255) PRIMARY KEY) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;",
];
for (const { name, sql } of ordered) {
  const indexed = new Set(sqlite.prepare(`PRAGMA table_info("${name}")`).all().filter(({ pk }) => pk).map(({ name }) => name));
  for (const { name: index } of sqlite.prepare(`PRAGMA index_list("${name}")`).all()) {
    for (const { name: column } of sqlite.prepare(`PRAGMA index_info("${index}")`).all()) indexed.add(column);
  }
  for (const { from } of sqlite.prepare(`PRAGMA foreign_key_list("${name}")`).all()) indexed.add(from);
  let ddl = mysqlQuery(sql).replace(/\binteger\b/gi, "bigint").replace(/\bDEFAULT false\b/gi, "DEFAULT 0").replace(/\bDEFAULT true\b/gi, "DEFAULT 1");
  ddl = ddl.replace(/(`[^`]+`)\s+text\b/gi, (match, column) => {
    const key = column.slice(1, -1);
    const size = key === "r2_prefix" || key === "identifier" ? 768 : key === "email" ? 320 : 255;
    return `${column} ${indexed.has(key) ? `varchar(${size})` : "longtext"}`;
  });
  // MySQL check constraints are unqualified; SQLite Drizzle uses table names.
  ddl = ddl.replace(/`[^`]+`\s*\.\s*(`[^`]+`)/g, "$1");
  // MySQL text defaults must be expressions, including literal defaults.
  ddl = ddl.replace(/(longtext\s+DEFAULT)\s+('(?:[^']|'')*')/gi, "$1 ($2)");
  output.push(`${ddl} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;`);
}
for (const { sql } of indexes) output.push(`${mysqlQuery(sql)};`);
output.push(
  "CREATE TABLE parrot_batch_lock (id integer PRIMARY KEY) ENGINE=InnoDB;",
  "INSERT INTO parrot_batch_lock VALUES (1);",
  "CREATE TABLE parrot_private_media (`key` varchar(768) PRIMARY KEY, etag varchar(36) NOT NULL, body longblob NOT NULL, uploaded bigint NOT NULL, custom_metadata json NOT NULL, http_metadata json NOT NULL) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;",
  "CREATE TABLE parrot_rate_limit (`key` varchar(255) PRIMARY KEY, window_start bigint NOT NULL, hits integer NOT NULL) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;",
);
for (const table of ["user", "learner_profile"]) {
  for (const row of sqlite.prepare(`SELECT * FROM "${table}"`).all()) {
    const columns = Object.keys(row);
    const values = columns.map((column) => row[column] === null ? "NULL" : column.endsWith("_at") ? "0" : typeof row[column] === "number" ? String(row[column]) : `'${row[column].replaceAll("'", "''")}'`);
    output.push(`INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(",")}) VALUES (${values.join(",")});`);
  }
}
output.push("INSERT INTO parrot_backend_migration VALUES ('0001-isolated-mysql');");
sqlite.close();
writeFileSync("backend/mysql-baseline.sql", output.join("\n") + "\n");
