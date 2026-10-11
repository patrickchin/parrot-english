import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

const columns = "key, etag, octet_length(body) AS size, uploaded, custom_metadata, http_metadata";

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

// ponytail: clips stay in PostgreSQL for the isolated pilot. Move immutable
// payloads to OSS behind this conditional-write index when volume warrants it.
// A direct R2 -> OSS PUT substitution would lose the consent/deletion fences.
export function createPrivateMediaBucket(pool) {
  return {
    async head(key) {
      return object((await pool.query(`SELECT ${columns} FROM parrot_private_media WHERE key = $1`, [key])).rows[0]);
    },
    async put(key, value, options = {}) {
      const body = Buffer.from(value);
      if (body.byteLength > 16 * 1024 * 1024) throw new Error("Recording exceeds the storage limit.");
      const values = [key, randomUUID(), body, Date.now(), options.customMetadata ?? {}, options.httpMetadata ?? {}];
      const assignment = "etag = $2, body = $3, uploaded = $4, custom_metadata = $5, http_metadata = $6";
      let sql;
      if (options.onlyIf?.etagMatches !== undefined) {
        values.push(options.onlyIf.etagMatches);
        sql = `UPDATE parrot_private_media SET ${assignment} WHERE key = $1 AND etag = $7`;
      } else if (options.onlyIf?.etagDoesNotMatch === "*") {
        sql = "INSERT INTO parrot_private_media VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(key) DO NOTHING";
      } else {
        if (options.onlyIf) throw new Error("Unsupported storage write condition.");
        sql = `INSERT INTO parrot_private_media VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(key) DO UPDATE SET ${assignment}`;
      }
      return object((await pool.query(`${sql} RETURNING ${columns}`, values)).rows[0]);
    },
    async get(key, options = {}) {
      const row = (await pool.query(`SELECT ${columns}, body FROM parrot_private_media WHERE key = $1`, [key])).rows[0];
      const metadata = object(row);
      if (!row) return null;
      if (options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== row.etag) return metadata;
      if (options.onlyIf && !options.onlyIf.etagMatches) throw new Error("Unsupported storage read condition.");
      const offset = options.range?.offset ?? 0;
      const length = options.range?.length ?? row.body.byteLength - offset;
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) throw new Error("Invalid storage range.");
      const bytes = row.body.subarray(offset, offset + length);
      return {
        ...metadata,
        body: new Blob([bytes]).stream(), bodyUsed: false,
        arrayBuffer: async () => Uint8Array.from(bytes).buffer,
        bytes: async () => Uint8Array.from(bytes),
        text: async () => bytes.toString("utf8"),
        json: async () => JSON.parse(bytes.toString("utf8")),
      };
    },
    async list({ prefix = "", cursor = "", limit = 1000 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("Invalid storage page size.");
      const response = await pool.query(`SELECT ${columns} FROM parrot_private_media WHERE left(key, length($1)) = $1 AND key > $2 COLLATE "C" ORDER BY key LIMIT $3`, [prefix, cursor, limit + 1]);
      const truncated = response.rows.length > limit;
      const objects = response.rows.slice(0, limit).map(object);
      return { objects, truncated, delimitedPrefixes: [], ...(truncated ? { cursor: objects.at(-1).key } : {}) };
    },
    async delete(keys) {
      await pool.query("DELETE FROM parrot_private_media WHERE key = ANY($1::text[])", [Array.isArray(keys) ? keys : [keys]]);
    },
  };
}

export function createRateLimiter(pool, namespace, limit) {
  return {
    async limit({ key }) {
      const window = Math.floor(Date.now() / 60_000);
      const result = await pool.query(`INSERT INTO parrot_rate_limit VALUES ($1,$2,1)
        ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start,
          hits = CASE WHEN parrot_rate_limit.window_start = excluded.window_start THEN parrot_rate_limit.hits + 1 ELSE 1 END
        RETURNING hits`, [`${namespace}:${key}`, window]);
      await pool.query("DELETE FROM parrot_rate_limit WHERE window_start < $1", [window - 1]);
      return { success: result.rows[0].hits <= limit };
    },
  };
}
