import { and, eq } from "drizzle-orm";
import { DUB_DEFINITIONS } from "../src/dubbing/rhyme-catalog.ts";
import {
  accountDeletionTombstone,
  learnerProfile,
  learnerProfileDeletionTombstone,
  user,
} from "../src/db/schema.ts";
import type { Database } from "./database.ts";
import {
  createDubStorageKeys,
  dubStorageClosureKeys,
} from "./dub-storage.ts";
import { lessonRecordingOwnerPrefix } from "./lesson-recording-storage.ts";
import {
  parseLearnerDeletionStorageClosure,
  preflightLearnerDeletionStorageClosure,
} from "./learner-deletion.ts";
import { accountPrivateMediaPrefix } from "./private-media-storage.ts";
import {
  normalizeUserEmail,
  type LearnerIdentity,
} from "./request-identity.ts";
import {
  deleteWithRetry,
  persistFence,
  runBoundedFenceWrites,
} from "./storage-deletion.ts";

type Clock = () => Date;
type Wait = (delay: number) => Promise<void>;
type LearnerStorageIdentity = Pick<
  LearnerIdentity,
  "learnerProfileId" | "privateMediaName" | "userEmail" | "userId"
>;
type StoredLearnerStorageIdentity = {
  learnerProfileId: string;
  privateMediaName: string;
};
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

async function listLearnerStorageIdentities(
  database: Database,
  userId: string,
  userEmail: string,
): Promise<LearnerStorageIdentity[]> {
  const identities = await database
    .select({
      learnerProfileId: learnerProfile.id,
      privateMediaName: learnerProfile.privateMediaName,
      userId: learnerProfile.authUserId,
    })
    .from(learnerProfile)
    .where(eq(learnerProfile.authUserId, userId));
  return identities.map((identity) => ({ ...identity, userEmail }));
}

async function listUnfinishedLearnerDeletions(
  database: Database,
  userIdHash: string,
  userId: string,
  userEmail: string,
): Promise<UnfinishedLearnerDeletion[]> {
  const tombstones = await database
    .select({
      learnerProfileId: learnerProfileDeletionTombstone.learnerProfileId,
      privateMediaName: learnerProfileDeletionTombstone.privateMediaName,
      storageKeysJson: learnerProfileDeletionTombstone.storageKeysJson,
    })
    .from(learnerProfileDeletionTombstone)
    .where(eq(learnerProfileDeletionTombstone.userIdHash, userIdHash));
  const unfinished = tombstones.map((tombstone) => {
    const closure = parseLearnerDeletionStorageClosure(
      tombstone.storageKeysJson,
    );
    const identity = {
      learnerProfileId: tombstone.learnerProfileId,
      privateMediaName: tombstone.privateMediaName,
      userEmail,
      userId,
    };
    preflightLearnerDeletionStorageClosure(identity, closure);
    return { closure, identity, tombstone };
  });
  return unfinished.map(({ closure, identity }) => ({
    identity,
    markerKeys: closure.markerKeys,
    slotKeys: closure.slotKeys,
  }));
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
    const record = identity as Record<string, unknown>;
    if (
      typeof identity !== "object" ||
      identity === null ||
      typeof record.learnerProfileId !== "string" ||
      record.learnerProfileId === "" ||
      typeof record.privateMediaName !== "string" ||
      record.privateMediaName === "" ||
      Object.keys(record).length !== 2 ||
      Object.keys(record).some((key) =>
        key !== "learnerProfileId" && key !== "privateMediaName"
      )
    ) {
      throw new Error("Account deletion learner storage closure is invalid.");
    }
    return {
      learnerProfileId: record.learnerProfileId,
      privateMediaName: record.privateMediaName,
    };
  });
}

function mergeLearnerStorageClosure(
  stored: StoredLearnerStorageIdentity[],
  identities: LearnerStorageIdentity[],
  userId: string,
) {
  const merged = new Map<string, StoredLearnerStorageIdentity>();
  for (const identity of stored) {
    merged.set(identity.learnerProfileId, identity);
  }
  for (const identity of identities) {
    if (
      identity.userId !== userId ||
      identity.learnerProfileId === "" ||
      identity.privateMediaName === ""
    ) {
      throw new Error("Account deletion learner storage identity is invalid.");
    }
    const storedIdentity = {
      learnerProfileId: identity.learnerProfileId,
      privateMediaName: identity.privateMediaName,
    };
    merged.set(identity.learnerProfileId, storedIdentity);
  }
  return [...merged.values()].sort((left, right) => {
    if (left.learnerProfileId < right.learnerProfileId) return -1;
    if (left.learnerProfileId > right.learnerProfileId) return 1;
    return 0;
  });
}

async function persistLearnerStorageClosure(
  database: Database,
  userIdHash: string,
  userId: string,
  userEmail: string,
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
      return merged.map((identity) => ({ ...identity, userEmail, userId }));
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
      return merged.map((identity) => ({ ...identity, userEmail, userId }));
    }
  }
  throw new Error(
    "Account deletion learner storage closure contention exceeded.",
  );
}

async function accountDeletionTombstoneKey(userId: string) {
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
  const [account] = await database
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!account) {
    throw new Error("Account deletion owner could not be resolved.");
  }
  const userEmail = normalizeUserEmail(account.email);
  const requestedAt = now();
  const tombstone = {
    r2Prefix: accountPrivateMediaPrefix(userEmail),
    requestedAt,
    userIdHash: await accountDeletionTombstoneKey(userId),
  };

  await database
    .insert(accountDeletionTombstone)
    .values(tombstone)
    .onConflictDoNothing({
      target: accountDeletionTombstone.userIdHash,
    });

  const [storedTombstone] = await database
    .select()
    .from(accountDeletionTombstone)
    .where(eq(accountDeletionTombstone.userIdHash, tombstone.userIdHash))
    .limit(1);
  if (!storedTombstone) {
    throw new Error("Account deletion tombstone could not be persisted.");
  }
  if (storedTombstone.r2Prefix !== tombstone.r2Prefix) {
    throw new Error("Account deletion private-media namespace changed.");
  }
  return { ...storedTombstone, userEmail };
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
      tombstone.userEmail,
    );
  const liveIdentities = await listLearnerStorageIdentities(
    database,
    userId,
    tombstone.userEmail,
  );
  const identities = await persistLearnerStorageClosure(
    database,
    tombstone.userIdHash,
    userId,
    tombstone.userEmail,
    [
      ...liveIdentities,
      ...unfinishedLearnerDeletions.map(({ identity }) => identity),
    ],
  );
  const storages = identities.flatMap((identity) =>
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
    ...unfinishedLearnerDeletions.flatMap(({ markerKeys }) => markerKeys),
    ...unfinishedLearnerDeletions.flatMap(({ slotKeys }) => slotKeys),
  ]);
  const lessonRecordingKeys = new Set<string>();
  const recordingPrefixes = identities.map(lessonRecordingOwnerPrefix);
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
    storages.flatMap(({ definition, storage }) =>
      definition.lines.map(({ id }) => fenceTask(storage.objectKey(id), "slot"))
    ),
  );
  await runBoundedFenceWrites(
    [...lessonRecordingKeys].map((key) => fenceTask(key, "slot")),
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
