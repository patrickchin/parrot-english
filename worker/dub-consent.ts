import { and, eq, ne } from "drizzle-orm";
import {
  guardianDubConsent,
  learnerDubConsent,
} from "../src/db/schema.ts";
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
  row:
    | typeof guardianDubConsent.$inferSelect
    | typeof learnerDubConsent.$inferSelect,
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
    const [row] = identity.legacyStorageOwner
      ? await database
          .select()
          .from(guardianDubConsent)
          .where(eq(guardianDubConsent.authUserId, identity.userId))
          .limit(1)
      : await database
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
    const [existing] = identity.legacyStorageOwner
      ? await database
          .update(guardianDubConsent)
          .set({ consentVersion: CURRENT_DUB_CONSENT_VERSION })
          .where(
            and(
              eq(guardianDubConsent.authUserId, identity.userId),
              eq(guardianDubConsent.state, "granted"),
              eq(
                guardianDubConsent.consentVersion,
                CURRENT_DUB_CONSENT_VERSION,
              ),
            ),
          )
          .returning()
      : await database
          .update(learnerDubConsent)
          .set({ consentVersion: CURRENT_DUB_CONSENT_VERSION })
          .where(
            and(
              eq(learnerDubConsent.learnerProfileId, identity.learnerProfileId),
              eq(learnerDubConsent.authUserId, identity.userId),
              eq(learnerDubConsent.state, "granted"),
              eq(
                learnerDubConsent.consentVersion,
                CURRENT_DUB_CONSENT_VERSION,
              ),
            ),
          )
          .returning();
    if (existing) return statusFromRow(existing);

    const timestamp = now();
    const grantGeneration = createGeneration();
    const [row] = identity.legacyStorageOwner
      ? await database
          .insert(guardianDubConsent)
          .values({
            authUserId: identity.userId,
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
          .returning()
      : await database
          .insert(learnerDubConsent)
          .values({
            learnerProfileId: identity.learnerProfileId,
            authUserId: identity.userId,
            consentVersion: CURRENT_DUB_CONSENT_VERSION,
            grantGeneration,
            state: "granted",
            grantedAt: timestamp,
            updatedAt: timestamp,
          })
          .onConflictDoUpdate({
            target: [
              learnerDubConsent.learnerProfileId,
              learnerDubConsent.authUserId,
            ],
            set: {
              consentVersion: CURRENT_DUB_CONSENT_VERSION,
              grantGeneration,
              grantedAt: timestamp,
              state: "granted",
              updatedAt: timestamp,
            },
            where: and(
              eq(learnerDubConsent.state, "granted"),
              ne(
                learnerDubConsent.consentVersion,
                CURRENT_DUB_CONSENT_VERSION,
              ),
            ),
          })
          .returning();
    if (row) return statusFromRow(row);
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
    const [row] = identity.legacyStorageOwner
      ? await database
          .update(guardianDubConsent)
          .set({ state: "revoking", updatedAt: now() })
          .where(
            and(
              eq(guardianDubConsent.authUserId, identity.userId),
              eq(guardianDubConsent.state, "granted"),
            ),
          )
          .returning()
      : await database
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
    if (identity.legacyStorageOwner) {
      await database
        .delete(guardianDubConsent)
        .where(
          and(
            eq(guardianDubConsent.authUserId, identity.userId),
            eq(guardianDubConsent.grantGeneration, generation),
            eq(guardianDubConsent.state, "revoking"),
          ),
        );
      return;
    }
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
