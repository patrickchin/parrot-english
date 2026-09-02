import { and, eq } from "drizzle-orm";
import { learnerDubConsent } from "../src/db/schema.ts";
import type { Database } from "./database.ts";
import type { LearnerIdentity } from "./request-identity.ts";

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

function statusFromRow(
  row: typeof learnerDubConsent.$inferSelect,
): DubConsentStatus {
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
  async function status(identity: LearnerIdentity): Promise<DubConsentStatus> {
    const [row] = await database
      .select()
      .from(learnerDubConsent)
      .where(
        and(
          eq(learnerDubConsent.learnerProfileId, identity.learnerProfileId),
          eq(learnerDubConsent.authUserId, identity.userId),
        ),
      )
      .limit(1);
    return row ? statusFromRow(row) : { state: "not_granted" };
  }

  async function grant(identity: LearnerIdentity): Promise<DubConsentStatus> {
    const existing = await status(identity);
    if (
      existing.state === "granted" &&
      existing.consentVersion === CURRENT_DUB_CONSENT_VERSION
    ) {
      const pending = await database.$client.prepare(
        `SELECT 1 AS pending FROM learner_profile_deletion_tombstone
         WHERE learner_profile_id = ?`,
      ).bind(identity.learnerProfileId).first<{ pending: number }>();
      if (pending) throw new Error("learner_deletion_pending");
      return existing;
    }
    const timestamp = now();
    const grantGeneration = createGeneration();
    const timestampMs = timestamp.getTime();
    await database.$client.prepare(
      `INSERT INTO learner_dub_consent
        (learner_profile_id, auth_user_id, consent_version,
         grant_generation, state, granted_at, updated_at)
       SELECT ?, ?, ?, ?, 'granted', ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM learner_profile_deletion_tombstone
         WHERE learner_profile_id = ?
       )
       ON CONFLICT(learner_profile_id, auth_user_id) DO UPDATE SET
         consent_version = excluded.consent_version,
         grant_generation = excluded.grant_generation,
         state = 'granted',
         granted_at = excluded.granted_at,
         updated_at = excluded.updated_at
       WHERE learner_dub_consent.state = 'granted'
         AND learner_dub_consent.consent_version <> excluded.consent_version
         AND NOT EXISTS (
           SELECT 1 FROM learner_profile_deletion_tombstone
           WHERE learner_profile_id = ?
         )`,
    ).bind(
      identity.learnerProfileId,
      identity.userId,
      CURRENT_DUB_CONSENT_VERSION,
      grantGeneration,
      timestampMs,
      timestampMs,
      identity.learnerProfileId,
      identity.learnerProfileId,
    ).run();
    const pending = await database.$client.prepare(
      `SELECT 1 AS pending FROM learner_profile_deletion_tombstone
       WHERE learner_profile_id = ?`,
    ).bind(identity.learnerProfileId).first<{ pending: number }>();
    if (pending) throw new Error("learner_deletion_pending");
    const current = await status(identity);
    if (
      current.state === "granted" &&
      current.consentVersion === CURRENT_DUB_CONSENT_VERSION
    ) {
      return current;
    }
    throw new Error("dub_consent_revoking");
  }

  async function beginRevocation(
    identity: LearnerIdentity,
  ): Promise<DubConsentStatus> {
    const [row] = await database
      .update(learnerDubConsent)
      .set({ state: "revoking", updatedAt: now() })
      .where(
        and(
          eq(learnerDubConsent.learnerProfileId, identity.learnerProfileId),
          eq(learnerDubConsent.authUserId, identity.userId),
          eq(learnerDubConsent.state, "granted"),
        ),
      )
      .returning();
    return row ? statusFromRow(row) : status(identity);
  }

  async function finishRevocation(
    identity: LearnerIdentity,
    generation: string,
  ) {
    await database
      .delete(learnerDubConsent)
      .where(
        and(
          eq(learnerDubConsent.learnerProfileId, identity.learnerProfileId),
          eq(learnerDubConsent.authUserId, identity.userId),
          eq(learnerDubConsent.grantGeneration, generation),
          eq(learnerDubConsent.state, "revoking"),
        ),
      );
  }

  async function requireCurrentGrant(
    identity: LearnerIdentity,
    expectedGeneration?: string,
  ) {
    const current = await status(identity);
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
