import { and, eq } from "drizzle-orm";
import { DUB_DEFINITIONS } from "../src/dubbing/rhyme-catalog.ts";
import {
  learnerProfileDeletionTombstone,
} from "../src/db/schema.ts";
import type { Database } from "./database.ts";
import {
  createDubStorageKeys,
  dubStorageClosureKeys,
} from "./dub-storage.ts";
import { lessonRecordingOwnerPrefix } from "./lesson-recording-storage.ts";
import { learnerPrivateMediaPrefix } from "./private-media-storage.ts";
import type { AccountIdentity } from "./request-identity.ts";
import {
  deleteWithRetry,
  persistFence,
  runBoundedFenceWrites,
  type StorageDeletionBucket,
  type StorageDeletionWait,
} from "./storage-deletion.ts";

const MAX_CLOSURE_CONFLICTS = 16;
const DELETE_BATCH_SIZE = 1_000;
const EMPTY_STORAGE_CLOSURE = JSON.stringify({
  markerKeys: [],
  prefixes: [],
  slotKeys: [],
  version: 1,
});

export type LearnerDeletionStorageClosure = {
  markerKeys: string[];
  prefixes: string[];
  slotKeys: string[];
  version: 1;
};

type LearnerDeletionInput = {
  bucket: StorageDeletionBucket;
  database: Database;
  identity: AccountIdentity;
  profileId: string;
  wait?: StorageDeletionWait;
};

type DeletionTombstone = typeof learnerProfileDeletionTombstone.$inferSelect;
export type LearnerDeletionStorageOwner = Pick<
  AccountIdentity,
  "userEmail"
> & {
  privateMediaName: string;
};

export class LearnerDeletionError extends Error {
  readonly code: "last_learner" | "learner_busy" | "not_found";
  readonly status: 404 | 409;

  constructor(status: 404 | 409, code: LearnerDeletionError["code"]) {
    super(code);
    this.name = "LearnerDeletionError";
    this.status = status;
    this.code = code;
  }
}

function unique(values: string[]) {
  return [...new Set(values)].sort();
}

function stringArray(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry === "")
  ) {
    throw new Error("Learner deletion storage closure is invalid.");
  }
  return unique(value);
}

export function parseLearnerDeletionStorageClosure(
  serialized: string,
): LearnerDeletionStorageClosure {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Learner deletion storage closure is invalid.");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    (parsed as Record<string, unknown>).version !== 1
  ) {
    throw new Error("Learner deletion storage closure is invalid.");
  }
  const closure = parsed as Record<string, unknown>;
  const keys = Object.keys(closure);
  if (
    keys.length !== 4 ||
    keys.some((key) =>
      key !== "markerKeys" &&
      key !== "prefixes" &&
      key !== "slotKeys" &&
      key !== "version"
    )
  ) {
    throw new Error("Learner deletion storage closure is invalid.");
  }
  return {
    markerKeys: stringArray(closure.markerKeys),
    prefixes: stringArray(closure.prefixes),
    slotKeys: stringArray(closure.slotKeys),
    version: 1,
  };
}

function mergeClosure(
  left: LearnerDeletionStorageClosure,
  right: LearnerDeletionStorageClosure,
): LearnerDeletionStorageClosure {
  return {
    markerKeys: unique([...left.markerKeys, ...right.markerKeys]),
    prefixes: unique([...left.prefixes, ...right.prefixes]),
    slotKeys: unique([...left.slotKeys, ...right.slotKeys]),
    version: 1,
  };
}

export async function learnerDeletionUserIdHash(userId: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(userId),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function findTombstone(database: Database, profileId: string) {
  const [row] = await database
    .select()
    .from(learnerProfileDeletionTombstone)
    .where(eq(learnerProfileDeletionTombstone.learnerProfileId, profileId))
    .limit(1);
  return row ?? null;
}

function learnerDeletionGeneration(
  tombstone: Pick<
    DeletionTombstone,
    "generation" | "learnerProfileId" | "requestedAt"
  >,
) {
  return `learner-deletion-v1:${tombstone.learnerProfileId}:${tombstone.generation}:${tombstone.requestedAt.getTime()}`;
}

async function markDeletionPending(
  database: Database,
  identity: AccountIdentity,
  profileId: string,
) {
  const userIdHash = await learnerDeletionUserIdHash(identity.userId);
  const existing = await findTombstone(database, profileId);
  if (existing && existing.userIdHash !== userIdHash) {
    throw new LearnerDeletionError(404, "not_found");
  }
  const requestedAt = Date.now();
  const batchResults = await database.$client.batch([
    database.$client.prepare(
      `INSERT INTO learner_profile_deletion_tombstone (
         learner_profile_id, user_id_hash, private_media_name,
         generation, requested_at, storage_keys_json
       )
       SELECT target.id, ?, target.private_media_name, 1, ?, ?
       FROM learner_profile AS target
       WHERE target.id = ? AND target.auth_user_id = ?
         AND EXISTS (
           SELECT 1
           FROM learner_profile AS sibling
           LEFT JOIN learner_profile_deletion_tombstone AS sibling_deletion
             ON sibling_deletion.learner_profile_id = sibling.id
           WHERE sibling.auth_user_id = target.auth_user_id
             AND sibling.id <> target.id
             AND sibling_deletion.learner_profile_id IS NULL
         )
         AND NOT EXISTS (
           SELECT 1 FROM conversation_session
           WHERE learner_profile_id = target.id
             AND auth_user_id = target.auth_user_id
             AND status IN ('starting', 'active')
         )
       ON CONFLICT(learner_profile_id) DO NOTHING`,
    ).bind(
      userIdHash,
      requestedAt,
      EMPTY_STORAGE_CLOSURE,
      profileId,
      identity.userId,
    ),
    database.$client.prepare(
      `DELETE FROM session_learner_selection
       WHERE learner_profile_id = ? AND auth_user_id = ?
         AND EXISTS (
           SELECT 1 FROM learner_profile_deletion_tombstone
           WHERE learner_profile_id = ? AND user_id_hash = ?
         )`,
    ).bind(profileId, identity.userId, profileId, userIdHash),
    database.$client.prepare(
      `SELECT
         EXISTS (
           SELECT 1 FROM learner_profile AS target
           WHERE target.id = ? AND target.auth_user_id = ?
         ) AS target_exists,
         EXISTS (
           SELECT 1
           FROM learner_profile AS sibling
           LEFT JOIN learner_profile_deletion_tombstone AS deletion
             ON deletion.learner_profile_id = sibling.id
           WHERE sibling.auth_user_id = ? AND sibling.id <> ?
             AND deletion.learner_profile_id IS NULL
         ) AS sibling_exists,
         EXISTS (
           SELECT 1 FROM conversation_session
           WHERE learner_profile_id = ? AND auth_user_id = ?
             AND status IN ('starting', 'active')
         ) AS busy`,
    ).bind(
      profileId,
      identity.userId,
      identity.userId,
      profileId,
      profileId,
      identity.userId,
    ),
  ]);

  const tombstone = await findTombstone(database, profileId);
  if (tombstone) {
    if (tombstone.userIdHash !== userIdHash) {
      throw new LearnerDeletionError(404, "not_found");
    }
    return tombstone;
  }

  const diagnostic = batchResults[2]?.results?.[0] as
    | { busy?: number; sibling_exists?: number; target_exists?: number }
    | undefined;
  if (!diagnostic?.target_exists) {
    throw new LearnerDeletionError(404, "not_found");
  }
  if (!diagnostic.sibling_exists) {
    throw new LearnerDeletionError(409, "last_learner");
  }
  if (diagnostic.busy) {
    throw new LearnerDeletionError(409, "learner_busy");
  }
  throw new Error("Learner deletion tombstone could not be persisted.");
}

async function listPrefix(
  bucket: StorageDeletionBucket,
  prefix: string,
) {
  const objects: R2Object[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  while (true) {
    const page = await bucket.list({
      include: ["customMetadata"],
      prefix,
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (page.objects.some(({ key }) => !key.startsWith(prefix))) {
      throw new Error("R2 returned an object outside the learner deletion prefix.");
    }
    objects.push(...page.objects);
    if (!page.truncated) return objects;
    if (!page.cursor || seenCursors.has(page.cursor)) {
      throw new Error("R2 learner deletion listing did not advance its cursor.");
    }
    seenCursors.add(page.cursor);
    cursor = page.cursor;
  }
}

function deletionOwner(identity: AccountIdentity, tombstone: DeletionTombstone) {
  return {
    privateMediaName: tombstone.privateMediaName,
    userEmail: identity.userEmail,
  };
}

function closureAuthority(owner: LearnerDeletionStorageOwner) {
  const learnerPrefix = learnerPrivateMediaPrefix(owner);
  const recordingPrefix = lessonRecordingOwnerPrefix(owner);
  const dubClosure = DUB_DEFINITIONS.map(({ id }) =>
    dubStorageClosureKeys(createDubStorageKeys(owner, id))
  );
  return {
    allowedMarkers: new Set(dubClosure.flatMap(({ markerKeys }) => markerKeys)),
    allowedPrefixes: new Set([learnerPrefix]),
    allowedSlots: new Set(dubClosure.flatMap(({ slotKeys }) => slotKeys)),
    learnerPrefix,
    recordingPrefix,
  };
}

export function preflightLearnerDeletionStorageClosure(
  owner: LearnerDeletionStorageOwner,
  closure: LearnerDeletionStorageClosure,
) {
  const authority = closureAuthority(owner);
  if (
    closure.prefixes.some((prefix) => !authority.allowedPrefixes.has(prefix)) ||
    closure.markerKeys.some((key) => !authority.allowedMarkers.has(key)) ||
    closure.slotKeys.some((key) =>
      !authority.allowedSlots.has(key) &&
      !key.startsWith(authority.recordingPrefix)
    )
  ) {
    throw new Error("Learner deletion storage closure is invalid.");
  }
}

async function snapshotClosure(
  bucket: StorageDeletionBucket,
  identity: AccountIdentity,
  tombstone: DeletionTombstone,
) {
  const owner = deletionOwner(identity, tombstone);
  const learnerPrefix = learnerPrivateMediaPrefix(owner);
  const prefixes = [learnerPrefix];
  const listed = await listPrefix(bucket, learnerPrefix);
  const storages = DUB_DEFINITIONS.map(({ id }) =>
    createDubStorageKeys(owner, id)
  );
  const dubClosure = storages.map((storage) => dubStorageClosureKeys(storage));
  const recordingPrefixes = [lessonRecordingOwnerPrefix(owner)];
  const recordingKeys = listed
    .map(({ key }) => key)
    .filter((key) => recordingPrefixes.some((prefix) => key.startsWith(prefix)));
  return {
    markerKeys: unique(dubClosure.flatMap(({ markerKeys }) => markerKeys)),
    prefixes: unique(prefixes),
    slotKeys: unique([
      ...dubClosure.flatMap(({ slotKeys }) => slotKeys),
      ...recordingKeys,
    ]),
    version: 1,
  } satisfies LearnerDeletionStorageClosure;
}

async function persistClosure(
  database: Database,
  identity: AccountIdentity,
  tombstone: DeletionTombstone,
  snapshot: LearnerDeletionStorageClosure,
) {
  for (let conflict = 0; conflict < MAX_CLOSURE_CONFLICTS; conflict += 1) {
    const current = await findTombstone(database, tombstone.learnerProfileId);
    if (!current || current.userIdHash !== tombstone.userIdHash) {
      throw new Error("Learner deletion tombstone could not be persisted.");
    }
    const persisted = parseLearnerDeletionStorageClosure(
      current.storageKeysJson,
    );
    preflightLearnerDeletionStorageClosure(
      deletionOwner(identity, current),
      persisted,
    );
    const merged = mergeClosure(persisted, snapshot);
    const serialized = JSON.stringify(merged);
    if (serialized === current.storageKeysJson) return merged;
    const updated = await database
      .update(learnerProfileDeletionTombstone)
      .set({ storageKeysJson: serialized })
      .where(
        and(
          eq(
            learnerProfileDeletionTombstone.learnerProfileId,
            current.learnerProfileId,
          ),
          eq(
            learnerProfileDeletionTombstone.storageKeysJson,
            current.storageKeysJson,
          ),
        ),
      )
      .returning({
        learnerProfileId: learnerProfileDeletionTombstone.learnerProfileId,
      });
    if (updated.length === 1) return merged;
  }
  throw new Error("Learner deletion storage closure contention exceeded.");
}

async function cleanStorage(
  bucket: StorageDeletionBucket,
  closure: LearnerDeletionStorageClosure,
  generation: string,
  wait: StorageDeletionWait,
) {
  const protectedKeys = new Set([...closure.markerKeys, ...closure.slotKeys]);
  for (const prefix of closure.prefixes) {
    const objects = await listPrefix(bucket, prefix);
    const deletable = objects
      .filter(({ key, customMetadata }) =>
        !protectedKeys.has(key) && customMetadata?.state !== "account-deleting"
      )
      .map(({ key }) => key);
    for (let index = 0; index < deletable.length; index += DELETE_BATCH_SIZE) {
      await deleteWithRetry(
        bucket,
        deletable.slice(index, index + DELETE_BATCH_SIZE),
        wait,
      );
    }
  }
  const fence = (key: string, kind: "marker" | "slot") => () =>
    persistFence(
      bucket,
      key,
      kind,
      generation,
      "learner-deleting",
      wait,
      ["account-deleting"],
    );
  await runBoundedFenceWrites(
    closure.markerKeys.map((key) => fence(key, "marker")),
  );
  await runBoundedFenceWrites(
    closure.slotKeys.map((key) => fence(key, "slot")),
  );
}

async function deleteDatabaseClosure(
  database: Database,
  identity: AccountIdentity,
  tombstone: DeletionTombstone,
) {
  await database.$client.prepare(
    `DELETE FROM learner_profile
     WHERE id = ? AND auth_user_id = ?
       AND EXISTS (
         SELECT 1 FROM learner_profile_deletion_tombstone
         WHERE learner_profile_id = ? AND user_id_hash = ?
       )`,
  ).bind(
    tombstone.learnerProfileId,
    identity.userId,
    tombstone.learnerProfileId,
    tombstone.userIdHash,
  ).run();
}

export async function prepareLearnerDeletion({
  bucket,
  database,
  identity,
  profileId,
  wait = (delay: number) => scheduler.wait(delay),
}: LearnerDeletionInput) {
  const tombstone = await markDeletionPending(database, identity, profileId);
  preflightLearnerDeletionStorageClosure(
    deletionOwner(identity, tombstone),
    parseLearnerDeletionStorageClosure(tombstone.storageKeysJson),
  );
  const closure = await persistClosure(
    database,
    identity,
    tombstone,
    await snapshotClosure(bucket, identity, tombstone),
  );
  await cleanStorage(
    bucket,
    closure,
    learnerDeletionGeneration(tombstone),
    wait,
  );
  await deleteDatabaseClosure(database, identity, tombstone);
}
