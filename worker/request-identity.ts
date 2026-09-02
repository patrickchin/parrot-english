import { and, eq, isNull } from "drizzle-orm";
import {
  learnerProfile,
  learnerProfileDeletionTombstone,
  learnerSelectionRequired,
  session,
  sessionLearnerSelection,
} from "../src/db/schema.ts";
import type { Database } from "./database.ts";

export type AccountIdentity = {
  sessionId: string;
  userId: string;
  userEmail: string;
  userName: string | null;
};

export type LearnerIdentity = AccountIdentity & {
  learnerProfileId: string;
  learnerName: string | null;
  legacyStorageOwner: boolean;
  privateMediaName: string;
};

export type LearnerIdentityResolution =
  | { status: "selected"; identity: LearnerIdentity }
  | { status: "selection_required" };

export const LEARNER_PROFILE_TARGET_QUERY_KEY = "learnerProfileId";
export const LEARNER_NAME_CONFLICT_MESSAGE =
  "Please choose a different name; each learner on this account needs a unique name.";

const MAX_LEARNER_PROFILE_ID_BYTES = 128;

export function normalizeUserEmail(email: string) {
  return email.normalize("NFKC").trim().toLowerCase();
}

export function normalizeLearnerName(name: string | null | undefined) {
  return name?.normalize("NFKC").trim() || null;
}

export function learnerNameKey(name: string | null | undefined) {
  return normalizeLearnerName(name)?.toLowerCase() ?? null;
}

export function availablePrivateMediaName(
  name: string | null | undefined,
  existingNames: Iterable<string>,
) {
  const baseName = normalizeLearnerName(name) ?? "Learner";
  const occupied = new Set(
    Array.from(
      existingNames,
      (existing) => existing.normalize("NFKC").trim().toLowerCase(),
    ),
  );
  if (!occupied.has(baseName.toLowerCase())) return baseName;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${baseName} (${suffix})`;
    if (!occupied.has(candidate.toLowerCase())) return candidate;
  }
}

export function isLearnerNameConflict(error: unknown) {
  const constraint =
    /UNIQUE constraint failed:.*learner_profile\.(?:name_key|private_media_name)/i;
  if (error instanceof Error && constraint.test(error.message)) return true;
  const cause =
    error && typeof error === "object" && "cause" in error
      ? error.cause
      : null;
  return cause instanceof Error && constraint.test(cause.message);
}

export function parseLearnerProfileTarget(
  searchParams: URLSearchParams,
): string | null {
  const values = searchParams.getAll(LEARNER_PROFILE_TARGET_QUERY_KEY);
  if (values.length !== 1) return null;
  const [value] = values;
  if (
    value.trim() === "" ||
    new TextEncoder().encode(value).byteLength > MAX_LEARNER_PROFILE_ID_BYTES
  ) {
    return null;
  }
  return value;
}

export async function isLearnerDeletionPending(
  database: Database,
  learnerProfileId: string,
) {
  const [tombstone] = await database
    .select({ learnerProfileId: learnerProfileDeletionTombstone.learnerProfileId })
    .from(learnerProfileDeletionTombstone)
    .where(
      eq(learnerProfileDeletionTombstone.learnerProfileId, learnerProfileId),
    )
    .limit(1);
  return tombstone !== undefined;
}

export async function resolveOwnedLearnerIdentity(
  database: Database,
  account: AccountIdentity,
  learnerProfileId: string,
): Promise<LearnerIdentity | null> {
  const [owned] = await database
    .select({
      learnerProfileId: learnerProfile.id,
      learnerName: learnerProfile.name,
      legacyStorageOwner: learnerProfile.legacyStorageOwner,
      privateMediaName: learnerProfile.privateMediaName,
    })
    .from(learnerProfile)
    .leftJoin(
      learnerProfileDeletionTombstone,
      eq(
        learnerProfileDeletionTombstone.learnerProfileId,
        learnerProfile.id,
      ),
    )
    .where(
      and(
        eq(learnerProfile.id, learnerProfileId),
        eq(learnerProfile.authUserId, account.userId),
        isNull(learnerProfileDeletionTombstone.learnerProfileId),
      ),
    )
    .limit(1);

  return owned
    ? {
        ...account,
        learnerProfileId: owned.learnerProfileId,
        learnerName: normalizeLearnerName(owned.learnerName),
        legacyStorageOwner: owned.legacyStorageOwner,
        privateMediaName: owned.privateMediaName,
      }
    : null;
}

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
        privateMediaName: learnerProfile.privateMediaName,
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
      .leftJoin(
        learnerProfileDeletionTombstone,
        eq(
          learnerProfileDeletionTombstone.learnerProfileId,
          learnerProfile.id,
        ),
      )
      .where(
        and(
          eq(sessionLearnerSelection.sessionId, account.sessionId),
          eq(session.userId, account.userId),
          eq(learnerProfile.authUserId, account.userId),
          isNull(learnerProfileDeletionTombstone.learnerProfileId),
        ),
      )
      .limit(1);

    return selected
      ? {
          ...account,
          learnerProfileId: selected.learnerProfileId,
          learnerName: normalizeLearnerName(selected.learnerName),
          legacyStorageOwner: selected.legacyStorageOwner,
          privateMediaName: selected.privateMediaName,
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

  const [selectionRequired] = await database
    .select({ sessionId: learnerSelectionRequired.sessionId })
    .from(learnerSelectionRequired)
    .where(eq(learnerSelectionRequired.sessionId, account.sessionId))
    .limit(1);
  if (selectionRequired) return { status: "selection_required" };

  let profiles = await database
    .select({ id: learnerProfile.id })
    .from(learnerProfile)
    .leftJoin(
      learnerProfileDeletionTombstone,
      eq(
        learnerProfileDeletionTombstone.learnerProfileId,
        learnerProfile.id,
      ),
    )
    .where(
      and(
        eq(learnerProfile.authUserId, account.userId),
        isNull(learnerProfileDeletionTombstone.learnerProfileId),
      ),
    )
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
      .leftJoin(
        learnerProfileDeletionTombstone,
        eq(
          learnerProfileDeletionTombstone.learnerProfileId,
          learnerProfile.id,
        ),
      )
      .where(
        and(
          eq(learnerProfile.authUserId, account.userId),
          isNull(learnerProfileDeletionTombstone.learnerProfileId),
        ),
      )
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
