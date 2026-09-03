import { and, eq, isNull } from "drizzle-orm";
import {
  learnerProfile,
  learnerProfileDeletionTombstone,
  session,
  sessionLearnerSelection,
} from "../src/db/schema.ts";
import type { Database } from "./database.ts";

export type AccountIdentity = {
  sessionId: string;
  userId: string;
  userEmail: string;
};

export type LearnerIdentity = AccountIdentity & {
  learnerProfileId: string;
  learnerName: string | null;
  privateMediaName: string;
};

export type LearnerIdentityResolution =
  | { status: "selected"; identity: LearnerIdentity }
  | { status: "selection_required" };

export const LEARNER_PROFILE_TARGET_QUERY_KEY = "learnerProfileId";
export const LEARNER_NAME_CONFLICT_MESSAGE =
  "Please choose a different name; each learner on this account needs a unique name.";

const MAX_LEARNER_PROFILE_ID_BYTES = 128;

export type LearnerProfileResource = {
  action: "active" | "details" | "lesson-recording-consent";
  learnerProfileId: string;
};

export function parseLearnerProfileResource(
  pathname: string,
): LearnerProfileResource | null {
  const match = /^\/api\/learner-profiles\/([^/]+)(?:\/(active|lesson-recording-consent))?$/.exec(
    pathname,
  );
  if (!match) return null;
  try {
    const learnerProfileId = decodeURIComponent(match[1]);
    if (
      !learnerProfileId ||
      learnerProfileId.includes("/") ||
      new TextEncoder().encode(learnerProfileId).byteLength >
        MAX_LEARNER_PROFILE_ID_BYTES
    ) {
      return null;
    }
    const action = match[2];
    return {
      action:
        action === "active" || action === "lesson-recording-consent"
          ? action
          : "details",
      learnerProfileId,
    };
  } catch {
    return null;
  }
}

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
          privateMediaName: selected.privateMediaName,
        }
      : null;
  }

  const selected = await selectedIdentity();
  return selected
    ? { status: "selected", identity: selected }
    : { status: "selection_required" };
}
