// Keep the existing Drizzle/D1 query contract while storing this deployment in
// PostgreSQL. Only the app's SQL dialect is supported; migrations use a separate
// PostgreSQL baseline rather than translating historical SQLite migrations.
export function postgresQuery(sql) {
  let output = "";
  let parameter = 0;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (character === "'" || character === '"' || character === "`") {
      const quote = character;
      const target = quote === "`" ? '"' : quote;
      output += target;
      let closed = false;
      for (index += 1; index < sql.length; index += 1) {
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) {
            output += target + target;
            index += 1;
          } else {
            output += target;
            closed = true;
            break;
          }
        } else {
          output += quote === "`" && sql[index] === '"' ? '""' : sql[index];
        }
      }
      if (!closed) throw new Error("Unterminated SQL quote.");
    } else if (sql.slice(index, index + 2) === "--") {
      const end = sql.indexOf("\n", index);
      output += sql.slice(index, end === -1 ? sql.length : end);
      index = end === -1 ? sql.length : end - 1;
    } else if (sql.slice(index, index + 2) === "/*") {
      const end = sql.indexOf("*/", index + 2);
      if (end === -1) throw new Error("Unterminated SQL comment.");
      output += sql.slice(index, end + 2);
      index = end + 1;
    } else {
      output += character === "?" ? `$${++parameter}` : character;
    }
  }
  // SQLite Drizzle qualifies conflict targets; PostgreSQL accepts column names only.
  return output.replace(/on conflict \(([^)]+)\)/gi, (clause, target) =>
    `on conflict (${target.replace(/"[^"]+"\.("[^"]+")/g, "$1")})`,
  );
}

function cell(value, field) {
  if (value === null) return null;
  if (field.dataTypeID === 16) return value ? 1 : 0;
  if (field.dataTypeID === 20) {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error("Database integer exceeds the application range.");
    return number;
  }
  return value;
}

async function execute(client, sql, parameters) {
  try {
    const response = await client.query({ text: postgresQuery(sql), values: parameters, rowMode: "array" });
    const rows = response.rows.map((row) => row.map((value, index) => cell(value, response.fields[index])));
    return {
      success: true,
      results: rows.map((row) => Object.fromEntries(response.fields.map(({ name }, index) => [name, row[index]]))),
      rows,
      meta: { changes: response.rowCount ?? 0 },
    };
  } catch (error) {
    if (error.code === "23505" && /^learner_profile_user_(name_key|private_media_name)_unique$/.test(error.constraint ?? "")) {
      throw new Error(`UNIQUE constraint failed: learner_profile.${error.constraint.includes("name_key") ? "name_key" : "private_media_name"}`, { cause: error });
    }
    throw error;
  }
}

export function createPostgresBinding(pool) {
  function prepare(sql, parameters = []) {
    return {
      bind: (...values) => prepare(sql, values),
      execute: (client) => execute(client, sql, parameters),
      async all() {
        const result = await execute(pool, sql, parameters);
        return { success: result.success, results: result.results, meta: result.meta };
      },
      async run() { return this.all(); },
      async raw() { return (await execute(pool, sql, parameters)).rows; },
      async first(column) {
        const row = (await execute(pool, sql, parameters)).results[0] ?? null;
        return column ? row?.[column] ?? null : row;
      },
    };
  }
  return {
    prepare,
    async batch(statements) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // ponytail: global batch lock for this pilot; use per-account locks
        // if throughput warrants it. Preserve D1 serialization for learner-deletion
        // checks, which must not simultaneously delete the final two learners.
        await client.query("SELECT pg_advisory_xact_lock(728391)");
        const results = [];
        for (const statement of statements) results.push(await statement.execute(client));
        await client.query("COMMIT");
        return results;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
