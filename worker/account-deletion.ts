import { and, eq, sql } from "drizzle-orm";
import { DUB_DEFINITIONS } from "../src/dubbing/rhyme-catalog.ts";
import {
  accountDeletionTombstone,
  learnerProfile,
  learnerProfileDeletionTombstone,
  learnerStoryArtGenerationLease,
  personalizedStoryArt,
  personalizedStoryArtGenerationLease,
} from "../src/db/schema.ts";
import type { Database } from "./database.ts";
import {
  createDubStorageKeys,
  dubStorageClosureKeys,
  LEGACY_DUB_LINE_IDS,
} from "./dub-storage.ts";
import { lessonRecordingOwnerPrefix } from "./lesson-recording-storage.ts";
import { parseLearnerDeletionStorageClosure } from "./learner-deletion.ts";
import type { LearnerIdentity } from "./request-identity.ts";
import {
  deleteWithRetry,
  persistFence,
  runBoundedFenceWrites,
} from "./storage-deletion.ts";

type Clock = () => Date;
type Wait = (delay: number) => Promise<void>;
type LearnerStorageIdentity = Pick<
  LearnerIdentity,
  "userId" | "learnerProfileId" | "legacyStorageOwner"
>;
type StoredLearnerStorageIdentity = Omit<LearnerStorageIdentity, "userId">;
type UnfinishedLearnerDeletion = {
  identity: LearnerStorageIdentity;
  markerKeys: string[];
  slotKeys: string[];
};

type AccountDeletionInput = {
  bucket: Pick<R2Bucket, "delete" | "head" | "list" | "put">;
  database: Database;
  now?: Clock;
  userId: string;
  wait?: Wait;
};

const MAX_TOMBSTONE_CONFLICTS = 16;

function r2PrefixForUser(userId: string) {
  return `personalized-story-art/${encodeURIComponent(userId)}/`;
}

export async function listLearnerStorageIdentities(
  database: Database,
  userId: string,
): Promise<LearnerStorageIdentity[]> {
  return database
    .select({
      learnerProfileId: learnerProfile.id,
      legacyStorageOwner: learnerProfile.legacyStorageOwner,
      userId: learnerProfile.authUserId,
    })
    .from(learnerProfile)
    .where(eq(learnerProfile.authUserId, userId));
}

async function listUnfinishedLearnerDeletions(
  database: Database,
  userIdHash: string,
  userId: string,
): Promise<UnfinishedLearnerDeletion[]> {
  const tombstones = await database
    .select({
      learnerProfileId: learnerProfileDeletionTombstone.learnerProfileId,
      legacyStorageOwner: learnerProfileDeletionTombstone.legacyStorageOwner,
      storageKeysJson: learnerProfileDeletionTombstone.storageKeysJson,
    })
    .from(learnerProfileDeletionTombstone)
    .where(eq(learnerProfileDeletionTombstone.userIdHash, userIdHash));
  return tombstones.map((tombstone) => {
    const closure = parseLearnerDeletionStorageClosure(
      tombstone.storageKeysJson,
    );
    return {
      identity: {
        learnerProfileId: tombstone.learnerProfileId,
        legacyStorageOwner: tombstone.legacyStorageOwner,
        userId,
      },
      markerKeys: closure.markerKeys,
      slotKeys: closure.slotKeys,
    };
  });
}

function parseLearnerStorageClosure(serialized: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Account deletion learner storage closure is invalid.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Account deletion learner storage closure is invalid.");
  }
  return parsed.map((identity): StoredLearnerStorageIdentity => {
    if (
      typeof identity !== "object" ||
      identity === null ||
      typeof (identity as Record<string, unknown>).learnerProfileId !==
        "string" ||
      (identity as Record<string, unknown>).learnerProfileId === "" ||
      typeof (identity as Record<string, unknown>).legacyStorageOwner !==
        "boolean"
    ) {
      throw new Error("Account deletion learner storage closure is invalid.");
    }
    return {
      learnerProfileId: (identity as Record<string, unknown>)
        .learnerProfileId as string,
      legacyStorageOwner: (identity as Record<string, unknown>)
        .legacyStorageOwner as boolean,
    };
  });
}

function parsePersonalizedArtCandidateClosure(serialized: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error(
      "Account deletion personalized-art candidate closure is invalid.",
    );
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some((key) => typeof key !== "string" || key === "")
  ) {
    throw new Error(
      "Account deletion personalized-art candidate closure is invalid.",
    );
  }
  return parsed as string[];
}

function mergeLearnerStorageClosure(
  stored: StoredLearnerStorageIdentity[],
  identities: LearnerStorageIdentity[],
  userId: string,
) {
  const merged = new Map<string, StoredLearnerStorageIdentity>();
  for (const identity of stored) {
    merged.set(
      `${identity.legacyStorageOwner ? 1 : 0}:${identity.learnerProfileId}`,
      identity,
    );
  }
  for (const identity of identities) {
    if (identity.userId !== userId || identity.learnerProfileId === "") {
      throw new Error("Account deletion learner storage identity is invalid.");
    }
    const storedIdentity = {
      learnerProfileId: identity.learnerProfileId,
      legacyStorageOwner: identity.legacyStorageOwner,
    };
    merged.set(
      `${identity.legacyStorageOwner ? 1 : 0}:${identity.learnerProfileId}`,
      storedIdentity,
    );
  }
  return [...merged.values()].sort((left, right) => {
    if (left.learnerProfileId < right.learnerProfileId) return -1;
    if (left.learnerProfileId > right.learnerProfileId) return 1;
    return Number(right.legacyStorageOwner) - Number(left.legacyStorageOwner);
  });
}

async function persistLearnerStorageClosure(
  database: Database,
  userIdHash: string,
  userId: string,
  identities: LearnerStorageIdentity[],
): Promise<LearnerStorageIdentity[]> {
  for (let conflict = 0; conflict < MAX_TOMBSTONE_CONFLICTS; conflict += 1) {
    const [tombstone] = await database
      .select({
        learnerStorageIdentitiesJson:
          accountDeletionTombstone.learnerStorageIdentitiesJson,
      })
      .from(accountDeletionTombstone)
      .where(eq(accountDeletionTombstone.userIdHash, userIdHash))
      .limit(1);
    if (!tombstone) {
      throw new Error("Account deletion tombstone could not be persisted.");
    }
    const merged = mergeLearnerStorageClosure(
      parseLearnerStorageClosure(tombstone.learnerStorageIdentitiesJson),
      identities,
      userId,
    );
    const serialized = JSON.stringify(merged);
    if (serialized === tombstone.learnerStorageIdentitiesJson) {
      return merged.map((identity) => ({ ...identity, userId }));
    }

    const updated = await database
      .update(accountDeletionTombstone)
      .set({ learnerStorageIdentitiesJson: serialized })
      .where(
        and(
          eq(accountDeletionTombstone.userIdHash, userIdHash),
          eq(
            accountDeletionTombstone.learnerStorageIdentitiesJson,
            tombstone.learnerStorageIdentitiesJson,
          ),
        ),
      )
      .returning({ userIdHash: accountDeletionTombstone.userIdHash });
    if (updated.length === 1) {
      return merged.map((identity) => ({ ...identity, userId }));
    }
  }
  throw new Error(
    "Account deletion learner storage closure contention exceeded.",
  );
}

async function listPersonalizedArtCandidateKeys(
  database: Database,
  userId: string,
) {
  const legacy = await database
    .select({
      key: personalizedStoryArtGenerationLease.candidateR2ObjectKey,
    })
    .from(personalizedStoryArtGenerationLease)
    .where(eq(personalizedStoryArtGenerationLease.authUserId, userId));
  const learner = await database
    .select({ key: learnerStoryArtGenerationLease.candidateR2ObjectKey })
    .from(learnerStoryArtGenerationLease)
    .where(eq(learnerStoryArtGenerationLease.authUserId, userId));
  return [...legacy, ...learner].flatMap(({ key }) => (key ? [key] : []));
}

async function listExternalPersonalizedArtKeys(
  database: Database,
  userId: string,
  r2Prefix: string,
) {
  const ready = await database
    .select({ key: personalizedStoryArt.r2ObjectKey })
    .from(personalizedStoryArt)
    .where(eq(personalizedStoryArt.authUserId, userId));
  const legacy = await database
    .select({
      candidateKey: personalizedStoryArtGenerationLease.candidateR2ObjectKey,
      previousKey: personalizedStoryArtGenerationLease.previousR2ObjectKey,
    })
    .from(personalizedStoryArtGenerationLease)
    .where(eq(personalizedStoryArtGenerationLease.authUserId, userId));
  const learner = await database
    .select({
      candidateKey: learnerStoryArtGenerationLease.candidateR2ObjectKey,
      previousKey: learnerStoryArtGenerationLease.previousR2ObjectKey,
    })
    .from(learnerStoryArtGenerationLease)
    .where(eq(learnerStoryArtGenerationLease.authUserId, userId));
  return [
    ...new Set([
      ...ready.map(({ key }) => key),
      ...[...legacy, ...learner].flatMap(({ candidateKey, previousKey }) =>
        [candidateKey, previousKey].filter(
          (key): key is string => Boolean(key),
        )
      ),
    ].filter((key) => !key.startsWith(r2Prefix))),
  ].sort();
}

async function persistPersonalizedArtCandidateClosure(
  database: Database,
  userIdHash: string,
  r2Prefix: string,
  keys: string[],
) {
  for (let conflict = 0; conflict < MAX_TOMBSTONE_CONFLICTS; conflict += 1) {
    const [tombstone] = await database
      .select({
        personalizedArtCandidateKeysJson:
          accountDeletionTombstone.personalizedArtCandidateKeysJson,
      })
      .from(accountDeletionTombstone)
      .where(eq(accountDeletionTombstone.userIdHash, userIdHash))
      .limit(1);
    if (!tombstone) {
      throw new Error("Account deletion tombstone could not be persisted.");
    }
    const merged = [
      ...new Set([
        ...parsePersonalizedArtCandidateClosure(
          tombstone.personalizedArtCandidateKeysJson,
        ),
        ...keys,
      ]),
    ].sort();
    if (
      merged.some((key) => !key.startsWith(r2Prefix) || key === r2Prefix)
    ) {
      throw new Error(
        "Account deletion personalized-art candidate closure is invalid.",
      );
    }
    const serialized = JSON.stringify(merged);
    if (serialized === tombstone.personalizedArtCandidateKeysJson) {
      return merged;
    }

    const updated = await database
      .update(accountDeletionTombstone)
      .set({ personalizedArtCandidateKeysJson: serialized })
      .where(
        and(
          eq(accountDeletionTombstone.userIdHash, userIdHash),
          eq(
            accountDeletionTombstone.personalizedArtCandidateKeysJson,
            tombstone.personalizedArtCandidateKeysJson,
          ),
        ),
      )
      .returning({ userIdHash: accountDeletionTombstone.userIdHash });
    if (updated.length === 1) return merged;
  }
  throw new Error(
    "Account deletion personalized-art candidate closure contention exceeded.",
  );
}

export async function accountDeletionTombstoneKey(userId: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(userId),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function isAccountDeletionPending(
  database: Database,
  userId: string,
) {
  const userIdHash = await accountDeletionTombstoneKey(userId);
  const [tombstone] = await database
    .select({ userIdHash: accountDeletionTombstone.userIdHash })
    .from(accountDeletionTombstone)
    .where(eq(accountDeletionTombstone.userIdHash, userIdHash))
    .limit(1);
  return tombstone !== undefined;
}

export async function markAccountDeletionPending(
  database: Database,
  userId: string,
  now: Clock = () => new Date(),
) {
  const requestedAt = now();
  const tombstone = {
    r2Prefix: r2PrefixForUser(userId),
    requestedAt,
    userIdHash: await accountDeletionTombstoneKey(userId),
  };

  await database.batch([
    database
      .insert(accountDeletionTombstone)
      .values(tombstone)
      .onConflictDoNothing({
        target: accountDeletionTombstone.userIdHash,
      }),
    database
      .update(personalizedStoryArt)
      .set({
        status: "deleting",
        updatedAt: sql`${personalizedStoryArt.updatedAt}`,
      })
      .where(eq(personalizedStoryArt.authUserId, userId)),
  ] as const);

  const [storedTombstone] = await database
    .select()
    .from(accountDeletionTombstone)
    .where(eq(accountDeletionTombstone.userIdHash, tombstone.userIdHash))
    .limit(1);
  if (!storedTombstone) {
    throw new Error("Account deletion tombstone could not be persisted.");
  }
  return storedTombstone;
}

function accountDeletionGeneration(userIdHash: string, requestedAt: Date) {
  const requestedAtMs = requestedAt.getTime();
  if (!Number.isFinite(requestedAtMs)) {
    throw new Error("Account deletion timestamp is invalid.");
  }
  return `account-deletion-v1:${userIdHash}:${requestedAtMs}`;
}

export async function prepareAccountDeletion({
  bucket,
  database,
  now = () => new Date(),
  userId,
  wait = (delay: number) => scheduler.wait(delay),
}: AccountDeletionInput) {
  const tombstone = await markAccountDeletionPending(database, userId, now);
  const unfinishedLearnerDeletions =
    await listUnfinishedLearnerDeletions(
      database,
      tombstone.userIdHash,
      userId,
    );
  const liveIdentities = await listLearnerStorageIdentities(database, userId);
  const identities = await persistLearnerStorageClosure(
    database,
    tombstone.userIdHash,
    userId,
    [
      ...liveIdentities,
      ...unfinishedLearnerDeletions.map(({ identity }) => identity),
    ],
  );
  const personalizedArtCandidateKeys =
    await persistPersonalizedArtCandidateClosure(
      database,
      tombstone.userIdHash,
      tombstone.r2Prefix,
      await listPersonalizedArtCandidateKeys(database, userId),
    );
  const externalPersonalizedArtKeys = await listExternalPersonalizedArtKeys(
    database,
    userId,
    tombstone.r2Prefix,
  );
  const legacyIdentity = identities.find(
    ({ legacyStorageOwner }) => legacyStorageOwner,
  );
  const storageIdentities = [
    legacyIdentity ?? {
      learnerProfileId: "",
      legacyStorageOwner: true,
      userId,
    },
    ...identities
      .filter(({ legacyStorageOwner }) => !legacyStorageOwner),
  ];
  const storages = storageIdentities.flatMap((identity) =>
    DUB_DEFINITIONS.map((definition) => ({
      definition,
      storage: createDubStorageKeys(identity, definition.id),
    }))
  );
  const { r2Prefix } = tombstone;
  const generation = accountDeletionGeneration(
    tombstone.userIdHash,
    tombstone.requestedAt,
  );
  const closureKeys = new Set([
    ...storages.flatMap(({ storage }) => {
      const closure = dubStorageClosureKeys(storage);
      return [...closure.markerKeys, ...closure.slotKeys];
    }),
    ...personalizedArtCandidateKeys,
    ...unfinishedLearnerDeletions.flatMap(({ markerKeys }) => markerKeys),
    ...unfinishedLearnerDeletions.flatMap(({ slotKeys }) => slotKeys),
  ]);
  const lessonRecordingKeys = new Set<string>();
  const recordingPrefixes = storageIdentities.map(lessonRecordingOwnerPrefix);
  let cursor: string | undefined;
  let hasMore = true;
  const seenCursors = new Set<string>();

  while (hasMore) {
    const page = await bucket.list({
      ...(cursor === undefined ? {} : { cursor }),
      prefix: r2Prefix,
    });
    const listedKeys = page.objects.map(({ key }) => key);
    if (listedKeys.some((key) => !key.startsWith(r2Prefix))) {
      throw new Error(
        "R2 returned an object outside the account deletion prefix.",
      );
    }
    for (const key of listedKeys) {
      if (recordingPrefixes.some((prefix) => key.startsWith(prefix))) {
        lessonRecordingKeys.add(key);
      }
    }
    const keys = listedKeys.filter(
      (key) => !closureKeys.has(key) && !lessonRecordingKeys.has(key),
    );
    if (keys.length > 0) await deleteWithRetry(bucket, keys, wait);

    hasMore = page.truncated;
    if (page.truncated) {
      if (!page.cursor || seenCursors.has(page.cursor)) {
        throw new Error(
          "R2 account deletion listing did not advance its cursor.",
        );
      }
      seenCursors.add(page.cursor);
      cursor = page.cursor;
    }
  }

  const fenceTask = (key: string, kind: "marker" | "slot") => () =>
    persistFence(bucket, key, kind, generation, "account-deleting", wait);

  await runBoundedFenceWrites(
    storages.map(({ storage }) => fenceTask(storage.markerKey, "marker")),
  );
  await runBoundedFenceWrites(
    storages.flatMap(({ storage }) =>
      storage.retiredLegacyMarkerKey
        ? [fenceTask(storage.retiredLegacyMarkerKey, "marker")]
        : [],
    ),
  );
  await runBoundedFenceWrites(
    storages.flatMap(({ definition, storage }) => [
      ...definition.lines.map(({ id }) => fenceTask(storage.objectKey(id), "slot")),
      ...LEGACY_DUB_LINE_IDS.flatMap((lineId) => {
        const key = storage.retiredLegacyObjectKey(lineId);
        return key ? [fenceTask(key, "slot")] : [];
      }),
    ]),
  );
  await runBoundedFenceWrites(
    [...lessonRecordingKeys].map((key) => fenceTask(key, "slot")),
  );
  await runBoundedFenceWrites(
    personalizedArtCandidateKeys.map((key) => fenceTask(key, "slot")),
  );
  await runBoundedFenceWrites(
    externalPersonalizedArtKeys.map((key) => fenceTask(key, "slot")),
  );
  await runBoundedFenceWrites(
    unfinishedLearnerDeletions.flatMap(({ markerKeys }) =>
      markerKeys.map((key) => fenceTask(key, "marker"))
    ),
  );
  await runBoundedFenceWrites(
    unfinishedLearnerDeletions.flatMap(({ slotKeys }) =>
      slotKeys.map((key) => fenceTask(key, "slot"))
    ),
  );
}
