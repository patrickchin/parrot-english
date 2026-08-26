import { and, eq } from "drizzle-orm";
import {
  learnerProfile,
  session,
  sessionLearnerSelection,
} from "../src/db/schema.ts";
import type { Database } from "./database.ts";

export type AccountIdentity = {
  sessionId: string;
  userId: string;
  userName: string | null;
};

export type LearnerIdentity = AccountIdentity & {
  learnerProfileId: string;
  learnerName: string | null;
  legacyStorageOwner: boolean;
};

export type LearnerIdentityResolution =
  | { status: "selected"; identity: LearnerIdentity }
  | { status: "selection_required" };

export async function resolveLearnerIdentity(
  database: Database,
  account: AccountIdentity,
): Promise<LearnerIdentityResolution> {
  async function selectedIdentity(): Promise<LearnerIdentity | null> {
    const [selected] = await database
      .select({
        learnerProfileId: learnerProfile.id,
        learnerName: learnerProfile.name,
        legacyStorageOwner: learnerProfile.legacyStorageOwner,
      })
      .from(sessionLearnerSelection)
      .innerJoin(
        session,
        and(
          eq(sessionLearnerSelection.sessionId, session.id),
          eq(sessionLearnerSelection.authUserId, session.userId),
        ),
      )
      .innerJoin(
        learnerProfile,
        and(
          eq(sessionLearnerSelection.learnerProfileId, learnerProfile.id),
          eq(sessionLearnerSelection.authUserId, learnerProfile.authUserId),
        ),
      )
      .where(
        and(
          eq(sessionLearnerSelection.sessionId, account.sessionId),
          eq(session.userId, account.userId),
          eq(learnerProfile.authUserId, account.userId),
        ),
      )
      .limit(1);

    return selected
      ? {
          ...account,
          learnerProfileId: selected.learnerProfileId,
          learnerName: selected.learnerName?.trim() || null,
          legacyStorageOwner: selected.legacyStorageOwner,
        }
      : null;
  }

  const selected = await selectedIdentity();
  if (selected) return { status: "selected", identity: selected };

  const [existingSelection] = await database
    .select({ sessionId: sessionLearnerSelection.sessionId })
    .from(sessionLearnerSelection)
    .where(eq(sessionLearnerSelection.sessionId, account.sessionId))
    .limit(1);
  if (existingSelection) return { status: "selection_required" };

  let profiles = await database
    .select({ id: learnerProfile.id })
    .from(learnerProfile)
    .where(eq(learnerProfile.authUserId, account.userId))
    .limit(2);

  if (profiles.length === 0) {
    await database
      .insert(learnerProfile)
      .values({
        id: crypto.randomUUID(),
        authUserId: account.userId,
        legacyStorageOwner: true,
        name: null,
        profileStatus: "not_started",
      })
      .onConflictDoNothing();
    profiles = await database
      .select({ id: learnerProfile.id })
      .from(learnerProfile)
      .where(eq(learnerProfile.authUserId, account.userId))
      .limit(2);
  }

  if (profiles.length !== 1) return { status: "selection_required" };

  await database
    .insert(sessionLearnerSelection)
    .values({
      sessionId: account.sessionId,
      authUserId: account.userId,
      learnerProfileId: profiles[0].id,
    })
    .onConflictDoNothing({ target: sessionLearnerSelection.sessionId });

  const resolved = await selectedIdentity();
  return resolved
    ? { status: "selected", identity: resolved }
    : { status: "selection_required" };
}
