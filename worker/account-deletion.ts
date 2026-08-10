import { eq, sql } from "drizzle-orm";
import {
  accountDeletionTombstone,
  personalizedStoryArt,
} from "../src/db/schema.ts";
import type { Database } from "./database.ts";

type Clock = () => Date;

type AccountDeletionInput = {
  bucket: Pick<R2Bucket, "delete" | "list">;
  database: Database;
  now?: Clock;
  userId: string;
};

function r2PrefixForUser(userId: string) {
  return `personalized-story-art/${encodeURIComponent(userId)}/`;
}

async function hashUserId(userId: string) {
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
  const userIdHash = await hashUserId(userId);
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
    userIdHash: await hashUserId(userId),
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

export async function prepareAccountDeletion({
  bucket,
  database,
  now = () => new Date(),
  userId,
}: AccountDeletionInput) {
  const { r2Prefix } = await markAccountDeletionPending(database, userId, now);
  let cursor: string | undefined;
  let hasMore = true;
  const seenCursors = new Set<string>();

  while (hasMore) {
    const page = await bucket.list({
      ...(cursor === undefined ? {} : { cursor }),
      prefix: r2Prefix,
    });
    const keys = page.objects.map(({ key }) => key);
    if (keys.some((key) => !key.startsWith(r2Prefix))) {
      throw new Error("R2 returned an object outside the account deletion prefix.");
    }
    if (keys.length > 0) await bucket.delete(keys);

    hasMore = page.truncated;
    if (page.truncated) {
      if (!page.cursor || seenCursors.has(page.cursor)) {
        throw new Error("R2 account deletion listing did not advance its cursor.");
      }
      seenCursors.add(page.cursor);
      cursor = page.cursor;
    }
  }
}
