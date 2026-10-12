// Translate only this application's Drizzle/D1 SQL, not arbitrary SQLite SQL.
// MySQL has no RETURNING: preserve its rows and guards in the same transaction.
export function sqlTokens(sql) {
  const pattern = /\s+|--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`|\?|[a-zA-Z_][\w$]*|\d+(?:\.\d+)?|<>|!=|<=|>=|[^\s]/gy;
  const result = [];
  let parameter = 0;
  let match;
  while ((match = pattern.exec(sql))) {
    const raw = match[0];
    if (/^\s|^--|^\/\*/.test(raw)) continue;
    if (["'", '"', "`"].includes(raw)) throw new Error("Unterminated SQL quote.");
    const identifier = /^["`]/.test(raw) ? raw.slice(1, -1).replaceAll(raw[0] + raw[0], raw[0]) : null;
    result.push({ raw: identifier === null ? raw : `\`${identifier.replaceAll("`", "``")}\``,
      word: identifier ?? (/^[a-zA-Z_]/.test(raw) ? raw.toLowerCase() : null),
      ...(raw === "?" ? { parameter: parameter++ } : {}),
    });
  }
  return result;
}

function position(tokens, word, start = 0) {
  let depth = 0;
  for (let index = start; index < tokens.length; index++) {
    if (depth === 0 && tokens[index].word === word) return index;
    if (tokens[index].raw === "(") depth++;
    if (tokens[index].raw === ")") depth--;
  }
  return -1;
}

function close(tokens, start) {
  let depth = 0;
  for (let index = start; index < tokens.length; index++) {
    if (tokens[index].raw === "(") depth++;
    if (tokens[index].raw === ")" && --depth === 0) return index;
  }
  throw new Error("Unclosed SQL expression.");
}

function split(tokens) {
  const groups = [];
  let start = 0;
  let depth = 0;
  tokens.forEach((token, index) => {
    if (token.raw === "(") depth++;
    if (token.raw === ")") depth--;
    if (token.raw === "," && depth === 0) { groups.push(tokens.slice(start, index)); start = index + 1; }
  });
  groups.push(tokens.slice(start));
  return groups;
}

function compile(tokens, parameters = [], excluded) {
  const values = [];
  const render = (parts) => {
    const output = [];
    for (let index = 0; index < parts.length; index++) {
      const token = parts[index];
      if (token.word === "excluded" && parts[index + 1]?.raw === ".") {
        const key = parts[index + 2]?.word;
        if (!excluded || !Object.hasOwn(excluded, key)) throw new Error("Missing upsert value.");
        output.push("?"); values.push(excluded[key]); index += 2;
      } else if (token.parameter !== undefined) {
        if (token.parameter >= parameters.length) throw new Error("Missing SQL parameter.");
        output.push("?"); values.push(parameters[token.parameter]);
      } else if (["max", "unixepoch", "json_type"].includes(token.word) && parts[index + 1]?.raw === "(") {
        const end = close(parts, index + 1);
        const arguments_ = split(parts.slice(index + 2, end));
        if (token.word === "unixepoch") {
          if (arguments_.length !== 1 || arguments_[0][0]?.raw !== "'subsecond'") throw new Error("Unsupported epoch mode.");
          output.push("unix_timestamp(current_timestamp(3))");
        } else if (token.word === "json_type" && arguments_.length === 2) {
          output.push(`lower(json_type(json_extract(${render(arguments_[0])}, ${render(arguments_[1])})))`);
        } else {
          output.push(`${token.word === "max" && arguments_.length === 2 ? "greatest" : token.word}(${arguments_.map(render).join(", ")})`);
        }
        index = end;
      } else if (token.word === "as" && ["integer", "bigint"].includes(parts[index + 1]?.word)) {
        output.push("AS SIGNED"); index++;
      } else if (token.word !== null && parts[index + 1]?.raw === "(") {
        // MySQL distinguishes CAST(expr ...) from a stored function named cast.
        output.push(token.raw + "("); index++;
      } else output.push(token.raw);
    }
    return output.join(" ");
  };
  return { sql: render(tokens), values };
}

export function mysqlQuery(sql) {
  const tokens = sqlTokens(sql);
  return compile(tokens, Array(tokens.filter((token) => token.parameter !== undefined).length).fill(null)).sql;
}

export async function withMysqlTransaction(pool, work, serialize = false) {
  const client = await pool.getConnection();
  try {
    await client.query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_BACKSLASH_ESCAPES,NO_ENGINE_SUBSTITUTION'");
    await client.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await client.beginTransaction();
    if (serialize) {
      // ponytail: one transaction lock for the rare-use pilot. Use per-account
      // locks with a native MySQL repository if sustained concurrency warrants it.
      const [rows] = await client.query("SELECT id FROM parrot_batch_lock WHERE id = 1 FOR UPDATE");
      if (rows.length !== 1) throw new Error("Database baseline is missing its batch lock.");
    }
    const result = await work(client);
    await client.commit();
    return result;
  } catch (error) {
    await client.rollback().catch(() => {});
    throw error;
  } finally { client.release(); }
}

function cell(value, field) {
  if (value === null) return null;
  if (field.columnType === 8) {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error("Database integer exceeds the application range.");
    return number;
  }
  return value;
}

async function query(client, tokens, parameters, excluded) {
  const prepared = compile(tokens, parameters, excluded);
  const [rows, fields] = await client.execute({ sql: prepared.sql, rowsAsArray: true }, prepared.values);
  if (!Array.isArray(rows)) return { success: true, results: [], rows: [], meta: { changes: rows.affectedRows } };
  const arrays = rows.map((row) => row.map((value, index) => cell(value, fields[index])));
  return { success: true, rows: arrays, results: arrays.map((row) => Object.fromEntries(fields.map(({ name }, index) => [name, row[index]]))), meta: { changes: 0 } };
}

const quote = (name) => { if (!/^[a-zA-Z_][\w]*$/.test(name)) throw new Error("Unsupported SQL identifier."); return `\`${name}\``; };

export function createMysqlBinding(pool) {
  const primaryKeys = new Map();
  async function keys(client, table) {
    if (!primaryKeys.has(table)) {
      const [rows] = await client.execute("SELECT COLUMN_NAME AS name FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION", [table]);
      if (!rows.length) throw new Error("Mutation requires a primary key.");
      primaryKeys.set(table, rows.map(({ name }) => name));
    }
    return primaryKeys.get(table);
  }

  async function execute(client, tokens, parameters) {
    const operation = tokens[0]?.word;
    const returningIndex = position(tokens, "returning");
    const returning = returningIndex < 0 ? null : tokens.slice(returningIndex + 1);
    const body = returningIndex < 0 ? tokens : tokens.slice(0, returningIndex);
    try {
      if (!["insert", "update", "delete"].includes(operation)) return await query(client, body, parameters);
      const table = body[operation === "update" ? 1 : 2]?.word;
      const tableSql = quote(table);
      const pk = await keys(client, table);
      const byKey = (row) => ({ sql: pk.map((key) => `${quote(key)} = ?`).join(" AND "), values: pk.map((key) => row[key]) });
      const update = async (row, assignments, excluded) => {
        const key = byKey(row);
        const parts = split(assignments).map((assignment) => {
          const equal = assignment.findIndex(({ raw }) => raw === "=");
          const name = assignment[equal - 1]?.word;
          if (equal < 1 || pk.includes(name)) throw new Error("Unsupported primary-key update.");
          return { name, ...compile(assignment.slice(equal + 1), parameters, excluded) };
        });
        // SQLite evaluates all SET expressions against the original row. MySQL
        // assigns left-to-right, which would break consent-generation guards.
        const [values] = await client.execute({ sql: `SELECT ${parts.map(({ sql, name }) => `${sql} AS ${quote(name)}`).join(",")} FROM ${tableSql} WHERE ${key.sql}`, rowsAsArray: true }, [...parts.flatMap(({ values }) => values), ...key.values]);
        if (values.length !== 1) throw new Error("Mutation lost its locked row.");
        await client.execute(`UPDATE ${tableSql} SET ${parts.map(({ name }) => `${quote(name)}=?`).join(",")} WHERE ${key.sql}`, [...values[0], ...key.values]);
      };
      const returned = async (row) => {
        if (!returning) return [];
        const key = byKey(row);
        const expression = compile(returning, parameters);
        const [rows, fields] = await client.execute({ sql: `SELECT ${expression.sql} FROM ${tableSql} WHERE ${key.sql}`, rowsAsArray: true }, [...expression.values, ...key.values]);
        return rows.map((values) => ({ values: values.map((value, index) => cell(value, fields[index])), fields }));
      };
      let changes = 0;
      const returnedRows = [];
      const conflictIndex = position(body, "on");
      if (operation === "insert" && (returning || conflictIndex >= 0)) {
        if (body[3]?.raw !== "(") throw new Error("Insert columns must be explicit.");
        const columnEnd = close(body, 3);
        const columns = split(body.slice(4, columnEnd)).map((column) => column[0].word);
        const input = body.slice(columnEnd + 1, conflictIndex < 0 ? undefined : conflictIndex);
        let candidates;
        if (input[0]?.word === "values") {
          candidates = [];
          for (const group of split(input.slice(1))) {
            const expressions = split(group.slice(1, -1));
            if (expressions.length !== columns.length) throw new Error("Insert column count mismatch.");
            const parts = expressions.map((expression) => compile(expression, parameters));
            const [rows] = await client.execute({ sql: `SELECT ${parts.map(({ sql }, index) => `${sql} AS ${quote(columns[index])}`).join(", ")}`, rowsAsArray: true }, parts.flatMap(({ values }) => values));
            candidates.push(...rows);
          }
        } else {
          const prepared = compile(input, parameters);
          [candidates] = await client.execute({ sql: prepared.sql, rowsAsArray: true }, prepared.values);
        }
        const conflict = conflictIndex < 0 ? null : body.slice(conflictIndex);
        const conflictEnd = conflict ? close(conflict, 2) : -1;
        const targets = conflict ? split(conflict.slice(3, conflictEnd)).map((column) => column.at(-1).word) : [];
        const setIndex = conflict ? position(conflict, "set") : -1;
        const guardIndex = conflict ? position(conflict, "where") : -1;
        for (const values of candidates) {
          if (values.length !== columns.length) throw new Error("Insert column count mismatch.");
          const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
          if (returning && pk.some((key) => row[key] === null || row[key] === undefined)) throw new Error("Returned inserts require explicit primary keys.");
          let existing;
          if (conflict && targets.every((key) => row[key] !== null && row[key] !== undefined)) {
            const [rows] = await client.execute(`SELECT * FROM ${tableSql} WHERE ${targets.map((key) => `${quote(key)} = ?`).join(" AND ")} FOR UPDATE`, targets.map((key) => row[key]));
            existing = rows[0];
          }
          if (existing) {
            if (setIndex < 0) continue;
            const key = byKey(existing);
            if (guardIndex >= 0) {
              const guard = compile(conflict.slice(guardIndex + 1), parameters, row);
              const [allowed] = await client.execute(`SELECT 1 FROM ${tableSql} WHERE (${guard.sql}) AND ${key.sql}`, [...guard.values, ...key.values]);
              if (!allowed.length) continue;
            }
            await update(existing, conflict.slice(setIndex + 1, guardIndex < 0 ? undefined : guardIndex), row);
            changes++; returnedRows.push(...await returned(existing));
          } else {
            await client.execute(`INSERT INTO ${tableSql} (${columns.map(quote).join(",")}) VALUES (${columns.map(() => "?").join(",")})`, values);
            changes++; returnedRows.push(...await returned(row));
          }
        }
      } else if (["update", "delete"].includes(operation)) {
        const whereIndex = position(body, "where");
        const condition = whereIndex < 0 ? { sql: "1", values: [] } : compile(body.slice(whereIndex + 1), parameters);
        const [rows] = await client.execute(`SELECT ${pk.map(quote).join(",")} FROM ${tableSql} WHERE ${condition.sql} FOR UPDATE`, condition.values);
        const setIndex = position(body, "set");
        const assignments = operation === "update" ? body.slice(setIndex + 1, whereIndex < 0 ? undefined : whereIndex) : null;
        for (const row of rows) {
          const key = byKey(row);
          if (operation === "delete") returnedRows.push(...await returned(row));
          if (assignments) await update(row, assignments);
          else await client.execute(`DELETE FROM ${tableSql} WHERE ${key.sql}`, key.values);
          changes++;
          if (operation === "update") returnedRows.push(...await returned(row));
        }
      } else return await query(client, body, parameters);
      const arrays = returnedRows.map(({ values }) => values);
      return { success: true, rows: arrays, results: returnedRows.map(({ values, fields }) => Object.fromEntries(fields.map(({ name }, index) => [name, values[index]]))), meta: { changes } };
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY" && /learner_profile_user_(name_key|private_media_name)_unique/.test(error.message)) {
        throw new Error(`UNIQUE constraint failed: learner_profile.${error.message.includes("name_key") ? "name_key" : "private_media_name"}`, { cause: error });
      }
      throw error;
    }
  }

  function prepare(sql, parameters = []) {
    const tokens = sqlTokens(sql);
    const run = () => ["insert", "update", "delete"].includes(tokens[0]?.word)
      ? withMysqlTransaction(pool, (client) => execute(client, tokens, parameters), true)
      : execute(pool, tokens, parameters);
    return {
      bind: (...values) => prepare(sql, values), execute: (client) => execute(client, tokens, parameters),
      async all() { const result = await run(); return { success: true, results: result.results, meta: result.meta }; },
      async run() { return this.all(); }, async raw() { return (await run()).rows; },
      async first(column) { const row = (await run()).results[0] ?? null; return column ? row?.[column] ?? null : row; },
    };
  }
  return { prepare, batch: (statements) => withMysqlTransaction(pool, async (client) => {
    const results = [];
    for (const statement of statements) results.push(await statement.execute(client));
    return results;
  }, true) };
}
