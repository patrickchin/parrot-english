import process from "node:process";
import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import mysql from "mysql2/promise";
import { createBackendHandler } from "./index.mjs";
import { initializeMysqlDatabase } from "./mysql-bootstrap.mjs";

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

export function mysqlPoolOptions(variables = process.env) {
  if (!variables.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const databaseUrl = new URL(variables.DATABASE_URL);
  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (databaseUrl.protocol !== "mysql:" || databaseUrl.search || databaseUrl.hash || databaseUrl.pathname.split("/").length !== 2 || !databaseUrl.pathname.slice(1) || isIP(databaseUrl.hostname) || !/^[a-z0-9.-]+$/i.test(databaseUrl.hostname)) {
    throw new Error("DATABASE_URL must be a MySQL URL without query options, with a DNS hostname and one database name.");
  }
  if (!databaseUrl.username || !databaseUrl.password || /[\\/]/.test(databaseName)) throw new Error("DATABASE_URL requires application credentials and one database name.");
  // Database TLS verification is mandatory. Package the cluster's CA certificate.
  return { host: databaseUrl.hostname, port: Number(databaseUrl.port || 3306),
    user: decodeURIComponent(databaseUrl.username), password: decodeURIComponent(databaseUrl.password), database: databaseName,
    connectionLimit: 2, maxIdle: 1, idleTimeout: 1000, connectTimeout: 45000, waitForConnections: true, queueLimit: 16,
    supportBigNumbers: true, bigNumberStrings: true,
    ssl: { ca: readFileSync(variables.RDS_CA_PATH ?? "rds-ca.pem", "utf8"), rejectUnauthorized: true, verifyIdentity: true },
  };
}

export async function startBackend() {
  const options = mysqlPoolOptions();
  if (process.env.PARROT_INITIALIZE_DATABASE === "true") {
    const pool = mysql.createPool(options);
    try { await initializeMysqlDatabase(pool, readFileSync("mysql-baseline.sql", "utf8")); }
    finally { await pool.end(); }
  }
  const server = createHttpServer(async (request) => {
    const pool = mysql.createPool(options);
    try { return await createBackendHandler({ pool, variables: process.env })(request); }
    // Close sockets before replying. Function Compute can freeze timers after a
    // response; an idle pool timer alone could keep the database awake.
    finally { await pool.end(); }
  });
  server.listen(9000, "0.0.0.0");
  return server;
}
