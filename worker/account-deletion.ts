import { eq, sql } from "drizzle-orm";
import { DUB_LINES } from "../src/dubbing/dub-script.ts";
import {
  accountDeletionTombstone,
  personalizedStoryArt,
} from "../src/db/schema.ts";
import type { Database } from "./database.ts";
import {
  fenceBody,
  hasState,
  isR2WriteRateError,
  LEGACY_DUB_LINE_IDS,
  legacyMarkerKey,
  legacyObjectKey,
  markerKey,
  MAX_R2_WRITE_ATTEMPTS,
  objectKey,
  retryDelay,
} from "./dub-storage.ts";

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

export async function prepareAccountDeletion({
  bucket,
  database,
  now = () => new Date(),
  userId,
  wait = (delay: number) => scheduler.wait(delay),
}: AccountDeletionInput) {
  const tombstone = await markAccountDeletionPending(database, userId, now);
  const { r2Prefix } = tombstone;
  const generation = accountDeletionGeneration(
    tombstone.userIdHash,
    tombstone.requestedAt,
  );
  const closureKeys = new Set([
    markerKey(userId),
    ...DUB_LINES.map(({ id }) => objectKey(userId, id)),
    legacyMarkerKey(userId),
    ...LEGACY_DUB_LINE_IDS.map((lineId) => legacyObjectKey(userId, lineId)),
  ]);
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

  await persistFence(
    bucket,
    markerKey(userId),
    "marker",
    generation,
    "account-deleting",
    wait,
  );
  for (const { id } of DUB_LINES) {
    await persistFence(
      bucket,
      objectKey(userId, id),
      "slot",
      generation,
      "account-deleting",
      wait,
    );
  }
  await persistFence(
    bucket,
    legacyMarkerKey(userId),
    "marker",
    generation,
    "account-deleting",
    wait,
  );
  for (const lineId of LEGACY_DUB_LINE_IDS) {
    await persistFence(
      bucket,
      legacyObjectKey(userId, lineId),
      "slot",
      generation,
      "account-deleting",
      wait,
    );
  }
}
