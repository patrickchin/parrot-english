import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { withMysqlTransaction } from "./mysql.mjs";

const columns = "`key`, etag, octet_length(body) AS size, uploaded, custom_metadata, http_metadata";
function object(row) {
  if (!row) return null;
  return {
    key: row.key, etag: row.etag, httpEtag: `"${row.etag}"`, version: row.etag,
    size: row.size, uploaded: new Date(Number(row.uploaded)),
    customMetadata: row.custom_metadata, httpMetadata: row.http_metadata,
    writeHttpMetadata(headers) {
      if (row.http_metadata.contentType) headers.set("Content-Type", row.http_metadata.contentType);
      if (row.http_metadata.cacheControl) headers.set("Cache-Control", row.http_metadata.cacheControl);
    },
  };
}

// ponytail: clips remain in SQL for the pilot. Move immutable bodies to OSS
// behind this conditional-write index when recording volume warrants it.
export function createPrivateMediaBucket(pool) {
  return {
    async head(key) { return object((await pool.execute(`SELECT ${columns} FROM parrot_private_media WHERE \`key\` = ?`, [key]))[0][0]); },
    async put(key, value, options = {}) {
      const body = Buffer.from(value);
      if (body.byteLength > 16 * 1024 * 1024) throw new Error("Recording exceeds the storage limit.");
      const values = [randomUUID(), body, Date.now(), JSON.stringify(options.customMetadata ?? {}), JSON.stringify(options.httpMetadata ?? {}), key];
      return withMysqlTransaction(pool, async (client) => {
        if (options.onlyIf?.etagMatches !== undefined) {
          const [updated] = await client.execute("UPDATE parrot_private_media SET etag=?,body=?,uploaded=?,custom_metadata=?,http_metadata=? WHERE `key`=? AND etag=?", [...values, options.onlyIf.etagMatches]);
          if (updated.affectedRows === 0) return null;
        } else if (options.onlyIf?.etagDoesNotMatch === "*") {
          try {
            await client.execute("INSERT INTO parrot_private_media (etag,body,uploaded,custom_metadata,http_metadata,`key`) VALUES (?,?,?,?,?,?)", values);
          } catch (error) { if (error.code === "ER_DUP_ENTRY") return null; throw error; }
        } else {
          if (options.onlyIf) throw new Error("Unsupported storage write condition.");
          await client.execute("INSERT INTO parrot_private_media (etag,body,uploaded,custom_metadata,http_metadata,`key`) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE etag=VALUES(etag),body=VALUES(body),uploaded=VALUES(uploaded),custom_metadata=VALUES(custom_metadata),http_metadata=VALUES(http_metadata)", values);
        }
        return object((await client.execute(`SELECT ${columns} FROM parrot_private_media WHERE \`key\`=?`, [key]))[0][0]);
      });
    },
    async get(key, options = {}) {
      const row = (await pool.execute(`SELECT ${columns}, body FROM parrot_private_media WHERE \`key\`=?`, [key]))[0][0];
      const metadata = object(row);
      if (!row) return null;
      if (options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== row.etag) return metadata;
      if (options.onlyIf && !options.onlyIf.etagMatches) throw new Error("Unsupported storage read condition.");
      const offset = options.range?.offset ?? 0;
      const length = options.range?.length ?? row.body.byteLength - offset;
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) throw new Error("Invalid storage range.");
      const bytes = row.body.subarray(offset, offset + length);
      return { ...metadata, body: new Blob([bytes]).stream(), bodyUsed: false,
        arrayBuffer: async () => Uint8Array.from(bytes).buffer, bytes: async () => Uint8Array.from(bytes),
        text: async () => bytes.toString("utf8"), json: async () => JSON.parse(bytes.toString("utf8")),
      };
    },
    async list({ prefix = "", cursor = "", limit = 1000 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("Invalid storage page size.");
      const [rows] = await pool.query(`SELECT ${columns} FROM parrot_private_media WHERE left(\`key\`, char_length(?))=? AND \`key\`>? ORDER BY \`key\` LIMIT ?`, [prefix, prefix, cursor, limit + 1]);
      const truncated = rows.length > limit;
      const objects = rows.slice(0, limit).map(object);
      return { objects, truncated, delimitedPrefixes: [], ...(truncated ? { cursor: objects.at(-1).key } : {}) };
    },
    async delete(keys) {
      const values = Array.isArray(keys) ? keys : [keys];
      if (values.length) await pool.execute(`DELETE FROM parrot_private_media WHERE \`key\` IN (${values.map(() => "?").join(",")})`, values);
    },
  };
}

export function createRateLimiter(pool, namespace, limit) {
  return {
    async limit({ key }) {
      const result = await withMysqlTransaction(pool, async (client) => {
        const window = Math.floor(Date.now() / 60_000);
        const id = `${namespace}:${key}`;
        await client.execute("INSERT INTO parrot_rate_limit VALUES (?,?,1) ON DUPLICATE KEY UPDATE hits=IF(window_start=VALUES(window_start),hits+1,1),window_start=VALUES(window_start)", [id, window]);
        const [rows] = await client.execute("SELECT hits FROM parrot_rate_limit WHERE `key`=?", [id]);
        return { success: rows[0].hits <= limit };
      });
      // Do not sweep other clients' rows while holding this counter's lock.
      await pool.execute("DELETE FROM parrot_rate_limit WHERE window_start<?", [Math.floor(Date.now() / 60_000) - 1]);
      return result;
    },
  };
}
