import process from "node:process";
import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import pg from "pg";
import { createBackendHandler } from "./index.mjs";

export { createBackendHandler };

export function createHttpServer(handler) {
  return createServer(async (incoming, outgoing) => {
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of incoming) {
        size += chunk.byteLength;
        if (size > 16 * 1024 * 1024) {
          outgoing.writeHead(413, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          outgoing.end('{"error":"request_too_large"}');
          return;
        }
        chunks.push(chunk);
      }
      const body = ["GET", "HEAD"].includes(incoming.method) || size === 0 ? undefined : Buffer.concat(chunks);
      const response = await handler(new Request(new URL(incoming.url, "http://runtime.invalid"), {
        method: incoming.method, headers: incoming.headers, body,
      }));
      const headers = Object.fromEntries(response.headers);
      const cookies = response.headers.getSetCookie();
      if (cookies.length) headers["set-cookie"] = cookies;
      outgoing.writeHead(response.status, headers);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!outgoing.headersSent) outgoing.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      outgoing.end('{"error":"backend_unavailable"}');
    }
  });
}

export function startBackend() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const databaseUrl = new URL(process.env.DATABASE_URL);
  // pg connection-string SSL options override the explicit pool SSL object.
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol) || databaseUrl.search || databaseUrl.hash) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL without query options.");
  }
  // RDS TLS verification is mandatory. Package the instance's CA certificate.
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000,
    ssl: { ca: readFileSync(process.env.RDS_CA_PATH ?? "rds-ca.pem", "utf8"), rejectUnauthorized: true },
  });
  const server = createHttpServer(createBackendHandler({ pool, variables: process.env }));
  server.listen(9000, "0.0.0.0");
}
