import { and, eq, lte } from "drizzle-orm";
import { guardianSessionUnlock } from "../src/db/schema.ts";
import type { Database } from "./database.ts";
import {
  readBoundedText,
  RequestBodyTooLargeError,
} from "./request-body.ts";

export const GUARDIAN_ACCESS_TTL_MS = 15 * 60 * 1000;

const MAX_GUARDIAN_ACCESS_BODY_BYTES = 8 * 1024;

export type GuardianAccessPayload =
  | { mode: "learner" }
  | { mode: "guardian"; expiresAt: string };

export type GuardianAccessRepository = {
  status(sessionId: string): Promise<GuardianAccessPayload>;
  unlock(sessionId: string): Promise<GuardianAccessPayload>;
  lock(sessionId: string): Promise<{ mode: "learner" }>;
  require(sessionId: string): Promise<boolean>;
};

class GuardianAccessApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function json(payload: unknown, init?: ResponseInit) {
  return Response.json(payload, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function createGuardianAccessRepository(
  database: Database,
  dependencies: { now: () => Date } = { now: () => new Date() },
): GuardianAccessRepository {
  async function status(sessionId: string): Promise<GuardianAccessPayload> {
    const timestamp = dependencies.now();
    const [row] = await database
      .select({ expiresAt: guardianSessionUnlock.expiresAt })
      .from(guardianSessionUnlock)
      .where(eq(guardianSessionUnlock.sessionId, sessionId))
      .limit(1);

    if (!row) return { mode: "learner" };
    if (row.expiresAt.getTime() <= timestamp.getTime()) {
      await database
        .delete(guardianSessionUnlock)
        .where(
          and(
            eq(guardianSessionUnlock.sessionId, sessionId),
            lte(guardianSessionUnlock.expiresAt, timestamp),
          ),
        );
      return { mode: "learner" };
    }
    return { mode: "guardian", expiresAt: row.expiresAt.toISOString() };
  }

  async function unlock(sessionId: string): Promise<GuardianAccessPayload> {
    const unlockedAt = dependencies.now();
    const expiresAt = new Date(unlockedAt.getTime() + GUARDIAN_ACCESS_TTL_MS);
    await database
      .insert(guardianSessionUnlock)
      .values({ sessionId, unlockedAt, expiresAt })
      .onConflictDoUpdate({
        target: guardianSessionUnlock.sessionId,
        set: { unlockedAt, expiresAt },
      });
    return { mode: "guardian", expiresAt: expiresAt.toISOString() };
  }

  async function lock(sessionId: string) {
    await database
      .delete(guardianSessionUnlock)
      .where(eq(guardianSessionUnlock.sessionId, sessionId));
    return { mode: "learner" as const };
  }

  async function requireAccess(sessionId: string) {
    return (await status(sessionId)).mode === "guardian";
  }

  return { status, unlock, lock, require: requireAccess };
}

async function readPassword(request: Request) {
  let text: string;
  try {
    text = await readBoundedText(request, MAX_GUARDIAN_ACCESS_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw new GuardianAccessApiError(413, "payload_too_large");
    }
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new GuardianAccessApiError(400, "invalid_json");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GuardianAccessApiError(400, "invalid_json");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 1 ||
    typeof record.password !== "string"
  ) {
    throw new GuardianAccessApiError(400, "invalid_request");
  }
  return record.password;
}

export async function handleGuardianAccessRequest(input: {
  database: Database;
  identity: { sessionId: string; userId: string };
  request: Request;
  verifyPassword: (password: string) => Promise<boolean>;
}): Promise<Response> {
  const repository = createGuardianAccessRepository(input.database);
  const url = new URL(input.request.url);

  try {
    if (url.pathname === "/api/guardian-access") {
      if (input.request.method === "GET") {
        return json(await repository.status(input.identity.sessionId));
      }
      if (input.request.method === "POST") {
        const password = await readPassword(input.request);
        if (!(await input.verifyPassword(password))) {
          return json(
            {
              error: "invalid_password",
              message: "The password did not match this account.",
            },
            { status: 401 },
          );
        }
        return json(await repository.unlock(input.identity.sessionId));
      }
      if (input.request.method === "DELETE") {
        return json(await repository.lock(input.identity.sessionId));
      }
      return json({ error: "method_not_allowed" }, { status: 405 });
    }
    return json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    if (error instanceof GuardianAccessApiError) {
      return json({ error: error.code }, { status: error.status });
    }
    throw error;
  }
}

export async function requireGuardianAccess(input: {
  database: Database;
  sessionId: string;
  now?: () => Date;
}): Promise<Response | null> {
  const repository = createGuardianAccessRepository(input.database, {
    now: input.now ?? (() => new Date()),
  });
  if (await repository.require(input.sessionId)) return null;
  return json({ error: "guardian_required" }, { status: 403 });
}

export function requiresGuardianAccess(pathname: string, method: string) {
  if (pathname === "/api/profile") {
    return method === "GET" || method === "PUT";
  }
  if (pathname === "/api/profile/preferences") {
    return method === "PUT";
  }
  if (pathname === "/api/profile/lesson-recording-consent") {
    return method === "PUT";
  }
  if (pathname === "/api/lessons/my") {
    return method === "POST";
  }
  if (pathname === "/api/lessons/my/generate") {
    return method === "POST";
  }
  if (/^\/api\/lessons\/my\/[^/]+$/.test(pathname)) {
    return method === "PUT";
  }
  return (
    /^\/api\/stories\/[^/]+\/personalized-art$/.test(pathname) &&
    (method === "POST" || method === "DELETE")
  );
}
