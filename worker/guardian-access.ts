import { and, eq, lte } from "drizzle-orm";
import { guardianSessionUnlock } from "../src/db/schema.ts";
import type { Database } from "./database.ts";
import { parseDubRoute } from "./dub-route.ts";
import type { AccountIdentity } from "./request-identity.ts";

export const GUARDIAN_ACCESS_TTL_MS = 15 * 60 * 1000;

export type GuardianAccessPayload =
  | { mode: "learner" }
  | { mode: "guardian"; expiresAt: string };

export type GuardianAccessRepository = {
  status(sessionId: string): Promise<GuardianAccessPayload>;
  unlock(sessionId: string): Promise<GuardianAccessPayload>;
  lock(sessionId: string): Promise<{ mode: "learner" }>;
  require(sessionId: string): Promise<boolean>;
};

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

export async function handleGuardianAccessRequest(input: {
  database: Database;
  identity: AccountIdentity;
  request: Request;
}): Promise<Response> {
  const repository = createGuardianAccessRepository(input.database);
  const url = new URL(input.request.url);

  if (url.pathname === "/api/guardian-access") {
    if (input.request.method === "GET") {
      return json(await repository.status(input.identity.sessionId));
    }
    if (input.request.method === "POST") {
      return json(await repository.unlock(input.identity.sessionId));
    }
    if (input.request.method === "DELETE") {
      return json(await repository.lock(input.identity.sessionId));
    }
    return json({ error: "method_not_allowed" }, { status: 405 });
  }
  return json({ error: "not_found" }, { status: 404 });
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

export function requiresGuardianAccess(
  pathname: string,
  method: string,
  hasLearnerTarget = false,
) {
  if (hasLearnerTarget) return true;
  if (pathname === "/api/learner-profiles") {
    return method === "GET" || method === "POST";
  }
  if (/^\/api\/learner-profiles\/[^/]+\/active$/.test(pathname)) {
    return method === "PUT";
  }
  if (/^\/api\/learner-profiles\/[^/]+$/.test(pathname)) {
    return method === "DELETE";
  }
  const dubRoute = parseDubRoute(pathname);
  if (dubRoute?.consent) {
    return method === "PUT";
  }
  if (dubRoute && !dubRoute.lineId) {
    return method === "DELETE";
  }
  if (pathname === "/api/profile") {
    return method === "GET" || method === "PUT";
  }
  if (pathname === "/api/profile/preferences") {
    return method === "PUT";
  }
  if (pathname === "/api/profile/lesson-recording-consent") {
    return method === "PUT";
  }
  return (
    /^\/api\/stories\/[^/]+\/personalized-art$/.test(pathname) &&
    (method === "POST" || method === "DELETE")
  );
}
