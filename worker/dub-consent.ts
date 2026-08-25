import { and, eq, ne } from "drizzle-orm";
import { guardianDubConsent } from "../src/db/schema.ts";
import type { Database } from "./database.ts";

export const CURRENT_DUB_CONSENT_VERSION = "guardian-voice-r2-v2";

type DubConsentStatus =
  | { state: "not_granted" }
  | {
      state: "granted";
      consentVersion: string;
      grantGeneration: string;
      grantedAt: Date;
    }
  | { state: "revoking"; grantGeneration: string };

type RepositoryOptions = {
  createGeneration?: () => string;
  now?: () => Date;
};

function statusFromRow(row: typeof guardianDubConsent.$inferSelect): DubConsentStatus {
  if (row.state === "revoking") {
    return { state: "revoking", grantGeneration: row.grantGeneration };
  }
  return {
    state: "granted",
    consentVersion: row.consentVersion,
    grantGeneration: row.grantGeneration,
    grantedAt: row.grantedAt,
  };
}

export function createDubConsentRepository(
  database: Database,
  {
    createGeneration = () => crypto.randomUUID(),
    now = () => new Date(),
  }: RepositoryOptions = {},
) {
  async function status(userId: string): Promise<DubConsentStatus> {
    const [row] = await database
      .select()
      .from(guardianDubConsent)
      .where(eq(guardianDubConsent.authUserId, userId))
      .limit(1);
    return row ? statusFromRow(row) : { state: "not_granted" };
  }

  async function grant(userId: string): Promise<DubConsentStatus> {
    const [existing] = await database
      .update(guardianDubConsent)
      .set({ consentVersion: CURRENT_DUB_CONSENT_VERSION })
      .where(
        and(
          eq(guardianDubConsent.authUserId, userId),
          eq(guardianDubConsent.state, "granted"),
          eq(
            guardianDubConsent.consentVersion,
            CURRENT_DUB_CONSENT_VERSION,
          ),
        ),
      )
      .returning();
    if (existing) return statusFromRow(existing);

    const timestamp = now();
    const grantGeneration = createGeneration();
    const [row] = await database
      .insert(guardianDubConsent)
      .values({
        authUserId: userId,
        consentVersion: CURRENT_DUB_CONSENT_VERSION,
        grantGeneration,
        state: "granted",
        grantedAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: guardianDubConsent.authUserId,
        set: {
          consentVersion: CURRENT_DUB_CONSENT_VERSION,
          grantGeneration,
          grantedAt: timestamp,
          state: "granted",
          updatedAt: timestamp,
        },
        where: and(
          eq(guardianDubConsent.state, "granted"),
          ne(
            guardianDubConsent.consentVersion,
            CURRENT_DUB_CONSENT_VERSION,
          ),
        ),
      })
      .returning();
    if (row) return statusFromRow(row);
    const current = await status(userId);
    if (
      current.state === "granted" &&
      current.consentVersion === CURRENT_DUB_CONSENT_VERSION
    ) {
      return current;
    }
    throw new Error("dub_consent_revoking");
  }

  async function beginRevocation(userId: string): Promise<DubConsentStatus> {
    const [row] = await database
      .update(guardianDubConsent)
      .set({ state: "revoking", updatedAt: now() })
      .where(
        and(
          eq(guardianDubConsent.authUserId, userId),
          eq(guardianDubConsent.state, "granted"),
        ),
      )
      .returning();
    return row ? statusFromRow(row) : status(userId);
  }

  async function finishRevocation(userId: string, generation: string) {
    await database
      .delete(guardianDubConsent)
      .where(
        and(
          eq(guardianDubConsent.authUserId, userId),
          eq(guardianDubConsent.grantGeneration, generation),
          eq(guardianDubConsent.state, "revoking"),
        ),
      );
  }

  async function requireCurrentGrant(userId: string, expectedGeneration?: string) {
    const current = await status(userId);
    if (
      current.state !== "granted" ||
      current.consentVersion !== CURRENT_DUB_CONSENT_VERSION ||
      (expectedGeneration !== undefined &&
        current.grantGeneration !== expectedGeneration)
    ) {
      return null;
    }
    return current;
  }

  return {
    beginRevocation,
    finishRevocation,
    grant,
    requireCurrentGrant,
    status,
  };
}
