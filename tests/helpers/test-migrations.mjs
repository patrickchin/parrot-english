import { readdirSync, readFileSync } from "node:fs";

export const MULTI_LEARNER_ENABLE_MIGRATION =
  "0013_multi_learner_enable.sql";

const productionDirectory = new URL("../../migrations/", import.meta.url);
const pendingEnableUrl = new URL(
  `../fixtures/migrations/${MULTI_LEARNER_ENABLE_MIGRATION}`,
  import.meta.url,
);

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
  const migrations = readProductionMigrations();
  const deployedEnable = migrations.find(
    ({ name }) => name === MULTI_LEARNER_ENABLE_MIGRATION,
  );
  const pendingEnableSql = readFileSync(pendingEnableUrl, "utf8");

  if (deployedEnable && deployedEnable.sql !== pendingEnableSql) {
    throw new Error(
      `${MULTI_LEARNER_ENABLE_MIGRATION} must match its staged test fixture`,
    );
  }
  if (!deployedEnable) {
    migrations.push({
      name: MULTI_LEARNER_ENABLE_MIGRATION,
      sql: pendingEnableSql,
    });
    migrations.sort(({ name: left }, { name: right }) =>
      left.localeCompare(right),
    );
  }

  return migrations;
}
