import { createHash } from "node:crypto";
import { sqlTokens, mysqlQuery } from "./mysql.mjs";

// This baseline is applied once inside the Function Compute VPC. GitHub never
// connects to a public database endpoint or carries an admin migration tunnel.
export async function initializeMysqlDatabase(pool, baseline) {
  const client = await pool.getConnection();
  let lock;
  try {
    const [database] = await client.query("SELECT DATABASE() AS name");
    lock = createHash("sha256").update(database[0].name).digest("hex");
    const [acquired] = await client.execute("SELECT GET_LOCK(?, 30) AS acquired", [lock]);
    if (Number(acquired[0].acquired) !== 1) throw new Error("Database initialization lock unavailable.");
    const [tables] = await client.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()");
    if (tables.some(({ name }) => name === "parrot_backend_migration")) {
      const [markers] = await client.query("SELECT name FROM parrot_backend_migration");
      if (markers.length !== 1 || markers[0].name !== "0001-isolated-mysql") throw new Error("Incomplete or unknown database initialization; inspect it before retrying.");
      return false;
    }
    if (tables.length) throw new Error("Refusing to apply the baseline to a non-empty database.");
    let statement = [];
    for (const token of sqlTokens(baseline)) {
      if (token.raw === ";") {
        if (statement.length) await client.query(mysqlQuery(statement.join(" ")));
        statement = [];
      } else statement.push(token.raw);
    }
    if (statement.length) throw new Error("Baseline must end with a statement terminator.");
    return true;
  } finally {
    if (lock) await client.execute("SELECT RELEASE_LOCK(?)", [lock]).catch(() => {});
    client.release();
  }
}
