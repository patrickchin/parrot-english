import { readdirSync, readFileSync } from "node:fs";

const productionDirectory = new URL("../../migrations/", import.meta.url);

export function readProductionMigrations() {
  return readdirSync(productionDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(new URL(name, productionDirectory), "utf8"),
    }));
}

export function readTestMigrations() {
  return readProductionMigrations();
}
