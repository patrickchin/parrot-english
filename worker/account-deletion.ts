import { eq, sql } from "drizzle-orm";
import { DUB_LINES } from "../src/dubbing/dub-script.ts";
import {
  accountDeletionTombstone,
  learnerProfile,
  personalizedStoryArt,
} from "../src/db/schema.ts";
import type { Database } from "./database.ts";
import {
  createDubStorageKeys,
  type DubStorageKeys,
  fenceBody,
  hasState,
  isR2WriteRateError,
  LEGACY_DUB_LINE_IDS,
  MAX_R2_WRITE_ATTEMPTS,
  retryDelay,
} from "./dub-storage.ts";
import type { LearnerIdentity } from "./request-identity.ts";

type Clock = () => Date;
type Wait = (delay: number) => Promise<void>;

type AccountDeletionInput = {
  bucket: Pick<R2Bucket, "delete" | "head" | "list" | "put">;
  database: Database;
  now?: Clock;
  userId: string;
  wait?: Wait;
};

const MAX_FENCE_CONFLICTS = 16;

function r2PrefixForUser(userId: string) {
  return `personalized-story-art/${encodeURIComponent(userId)}/`;
}

export async function listLearnerStorageIdentities(
  database: Database,
  userId: string,
): Promise<Array<Pick<
  LearnerIdentity,
  "userId" | "learnerProfileId" | "legacyStorageOwner"
>>> {
  return database
    .select({
      learnerProfileId: learnerProfile.id,
      legacyStorageOwner: learnerProfile.legacyStorageOwner,
      userId: learnerProfile.authUserId,
    })
    .from(learnerProfile)
    .where(eq(learnerProfile.authUserId, userId));
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

async function deleteWithRetry(
  bucket: AccountDeletionInput["bucket"],
  keys: string[],
  wait: Wait,
) {
  for (let attempt = 0; attempt < MAX_R2_WRITE_ATTEMPTS; attempt += 1) {
    try {
      await bucket.delete(keys);
      return;
    } catch (error) {
      if (
        !isR2WriteRateError(error) ||
        attempt === MAX_R2_WRITE_ATTEMPTS - 1
      ) {
        throw error;
      }
      await wait(retryDelay(attempt));
    }
  }
}

function conditionalWrite(object: R2Object | null) {
  return object
    ? { etagMatches: object.etag }
    : { etagDoesNotMatch: "*" };
}

async function persistFence(
  bucket: AccountDeletionInput["bucket"],
  key: string,
  kind: "marker" | "slot",
  generation: string,
  state: "account-deleting" | "deleting",
  wait: Wait,
) {
  let rateFailures = 0;
  for (let conflict = 0; conflict < MAX_FENCE_CONFLICTS; conflict += 1) {
    const current = await bucket.head(key);
    if (current && hasState(current, generation, state)) return;
    try {
      const stored = await bucket.put(key, fenceBody(kind, generation, state), {
        customMetadata: { generation, state },
        onlyIf: conditionalWrite(current),
      });
      if (stored) return;
    } catch (error) {
      if (!isR2WriteRateError(error)) throw error;
      const latest = await bucket.head(key);
      if (latest && hasState(latest, generation, state)) return;
      rateFailures += 1;
      if (rateFailures >= MAX_R2_WRITE_ATTEMPTS) throw error;
      await wait(retryDelay(rateFailures - 1));
    }
  }
  throw new Error("Dub account-deletion fence contention exceeded.");
}

function storageClosureKeys(storage: DubStorageKeys) {
  const keys = [
    storage.markerKey,
    ...DUB_LINES.map(({ id }) => storage.objectKey(id)),
  ];
  if (storage.retiredLegacyMarkerKey) {
    keys.push(storage.retiredLegacyMarkerKey);
    for (const lineId of LEGACY_DUB_LINE_IDS) {
      const key = storage.retiredLegacyObjectKey(lineId);
      if (key) keys.push(key);
    }
  }
  return keys;
}

async function persistStorageFences(
  bucket: AccountDeletionInput["bucket"],
  storage: DubStorageKeys,
  generation: string,
  wait: Wait,
) {
  await persistFence(
    bucket,
    storage.markerKey,
    "marker",
    generation,
    "account-deleting",
    wait,
  );
  for (const { id } of DUB_LINES) {
    await persistFence(
      bucket,
      storage.objectKey(id),
      "slot",
      generation,
      "account-deleting",
      wait,
    );
  }
  if (!storage.retiredLegacyMarkerKey) return;
  await persistFence(
    bucket,
    storage.retiredLegacyMarkerKey,
    "marker",
    generation,
    "account-deleting",
    wait,
  );
  for (const lineId of LEGACY_DUB_LINE_IDS) {
    const key = storage.retiredLegacyObjectKey(lineId);
    if (key) {
      await persistFence(
        bucket,
        key,
        "slot",
        generation,
        "account-deleting",
        wait,
      );
    }
  }
}

export async function prepareAccountDeletion({
  bucket,
  database,
  now = () => new Date(),
  userId,
  wait = (delay: number) => scheduler.wait(delay),
}: AccountDeletionInput) {
  const tombstone = await markAccountDeletionPending(database, userId, now);
  const identities = await listLearnerStorageIdentities(database, userId);
  const legacyIdentity = identities.find(({ legacyStorageOwner }) =>
    legacyStorageOwner
  );
  const storages = [
    createDubStorageKeys(legacyIdentity ?? {
      learnerProfileId: "",
      legacyStorageOwner: true,
      userId,
    }),
    ...identities
      .filter(({ legacyStorageOwner }) => !legacyStorageOwner)
      .map(createDubStorageKeys),
  ];
  const { r2Prefix } = tombstone;
  const generation = accountDeletionGeneration(
    tombstone.userIdHash,
    tombstone.requestedAt,
  );
  const closureKeys = new Set(storages.flatMap(storageClosureKeys));
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
      throw new Error("R2 returned an object outside the account deletion prefix.");
    }
    const keys = listedKeys.filter((key) => !closureKeys.has(key));
    if (keys.length > 0) await deleteWithRetry(bucket, keys, wait);

    hasMore = page.truncated;
    if (page.truncated) {
      if (!page.cursor || seenCursors.has(page.cursor)) {
        throw new Error("R2 account deletion listing did not advance its cursor.");
      }
      seenCursors.add(page.cursor);
      cursor = page.cursor;
    }
  }

  for (const storage of storages) {
    await persistStorageFences(bucket, storage, generation, wait);
  }
}
