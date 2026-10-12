import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { createWorker } from "../worker/index.ts";
import { createMysqlBinding } from "./mysql.mjs";
import { createPrivateMediaBucket, createRateLimiter } from "./mysql-private-media.mjs";

const failure = (error, status) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store", ...(status === 503 ? { "Retry-After": "60" } : {}) } });

export function createBackendHandler({ pool, variables }) {
  for (const key of ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "TURNSTILE_SECRET_KEY", "PARROT_EDGE_SECRET"]) {
    if (!variables[key]?.trim()) throw new Error(`${key} is required.`);
  }
  if (variables.PARROT_EDGE_SECRET.length < 32) throw new Error("PARROT_EDGE_SECRET must be at least 32 characters.");
  const origin = new URL(variables.BETTER_AUTH_URL);
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) throw new Error("BETTER_AUTH_URL must be an HTTPS origin.");
  globalThis.scheduler ??= { wait: setTimeout };
  const env = {
    ...variables,
    DB: createMysqlBinding(pool),
    PRIVATE_MEDIA_BUCKET: createPrivateMediaBucket(pool),
    LEARNER_PROFILE_TRANSCRIPTION_RATE_LIMITER: createRateLimiter(pool, "transcription", 6),
    LEARNER_PROFILE_ENRICHMENT_RATE_LIMITER: createRateLimiter(pool, "enrichment", 12),
    ASSETS: { fetch: async () => failure("not_found", 404) },
  };
  const worker = createWorker();
  const expected = Buffer.from(variables.PARROT_EDGE_SECRET);
  return async (request) => {
    const headers = new Headers(request.headers);
    const provided = Buffer.from(headers.get("x-parrot-edge-secret") ?? "");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return failure("unauthorized", 401);
    const path = headers.get("x-parrot-original-path");
    // The authenticated ESA gateway supplies the original URL and trusted IP.
    if (!path?.startsWith("/api/") || path.startsWith("//") || path.includes("#")) return failure("invalid_path", 400);
    const url = new URL(path, origin);
    if (url.origin !== origin.origin || !url.pathname.startsWith("/api/")) return failure("invalid_path", 400);
    for (const key of ["x-parrot-edge-secret", "x-parrot-original-path", "host", "content-length", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-for"]) headers.delete(key);
    const body = request.body === null ? undefined : await request.arrayBuffer();
    if (body?.byteLength > 16 * 1024 * 1024) return failure("request_too_large", 413);
    try {
      return await worker.fetch(new Request(url, { method: request.method, headers, body }), env);
    } catch (error) {
      // Error codes only: SQL parameters and storage keys contain personal data.
      console.error("Backend request failed", error.code ?? error.name);
      return failure("backend_unavailable", 503);
    }
  };
}
