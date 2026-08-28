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
type LearnerDeletionStorageOwner = Pick<
  AccountIdentity,
  "userId"
> & {
  learnerProfileId: string;
  legacyStorageOwner: boolean;
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
  if (Array.isArray(parsed) && parsed.length === 0) {
    return { markerKeys: [], prefixes: [], slotKeys: [], version: 1 };
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

export function learnerDeletionGeneration(
  tombstone: Pick<
    DeletionTombstone,
    "generation" | "learnerProfileId" | "requestedAt"
  >,
) {
  return `learner-deletion-v1:${tombstone.learnerProfileId}:${tombstone.generation}:${tombstone.requestedAt.getTime()}`;
}

export async function findLearnerDeletionGeneration(
  database: Database,
  profileId: string,
) {
  const tombstone = await findTombstone(database, profileId);
  return tombstone ? learnerDeletionGeneration(tombstone) : null;
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
         learner_profile_id, user_id_hash, legacy_storage_owner,
         generation, requested_at, storage_keys_json
       )
       SELECT target.id, ?, target.legacy_storage_owner, 1, ?, '[]'
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
    ).bind(userIdHash, requestedAt, profileId, identity.userId),
    database.$client.prepare(
      `INSERT INTO learner_selection_required (session_id)
       SELECT selection.session_id
       FROM session_learner_selection AS selection
       JOIN learner_profile_deletion_tombstone AS deletion
         ON deletion.learner_profile_id = selection.learner_profile_id
       WHERE selection.learner_profile_id = ?
         AND selection.auth_user_id = ?
         AND deletion.user_id_hash = ?
       ON CONFLICT(session_id) DO NOTHING`,
    ).bind(profileId, identity.userId, userIdHash),
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

  const diagnostic = batchResults[3]?.results?.[0] as
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

async function artKeys(
  database: Database,
  owner: LearnerDeletionStorageOwner,
) {
  const ready = await database.$client.prepare(
    `SELECT r2_object_key AS key
     FROM personalized_story_art
     WHERE auth_user_id = ?
       AND (
         learner_profile_id = ?
         OR (? = 1 AND learner_profile_id IS NULL)
       )`,
  ).bind(
    owner.userId,
    owner.learnerProfileId,
    owner.legacyStorageOwner ? 1 : 0,
  ).all<{ key: string }>();
  const learnerLease = await database.$client.prepare(
    `SELECT candidate_r2_object_key AS candidateKey,
            previous_r2_object_key AS previousKey
     FROM learner_story_art_generation_lease
     WHERE auth_user_id = ? AND learner_profile_id = ?`,
  ).bind(owner.userId, owner.learnerProfileId).all<{
    candidateKey: string | null;
    previousKey: string | null;
  }>();
  const legacyLease = owner.legacyStorageOwner
    ? await database.$client.prepare(
      `SELECT candidate_r2_object_key AS candidateKey,
              previous_r2_object_key AS previousKey
       FROM personalized_story_art_generation_lease
       WHERE auth_user_id = ?`,
    ).bind(owner.userId).all<{
      candidateKey: string | null;
      previousKey: string | null;
    }>()
    : { results: [] };
  return unique([
    ...ready.results.map(({ key }) => key),
    ...[...learnerLease.results, ...legacyLease.results].flatMap(
      ({ candidateKey, previousKey }) =>
        [candidateKey, previousKey].filter((key): key is string => Boolean(key)),
    ),
  ]);
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
    learnerProfileId: tombstone.learnerProfileId,
    legacyStorageOwner: tombstone.legacyStorageOwner,
    userId: identity.userId,
  };
}

export async function validateLearnerDeletionStorageClosure(
  bucket: Pick<R2Bucket, "head">,
  database: Database,
  owner: LearnerDeletionStorageOwner,
  closure: LearnerDeletionStorageClosure,
  deletionGeneration: string,
) {
  const accountPrefix =
    `personalized-story-art/${encodeURIComponent(owner.userId)}/`;
  const learnerPrefix =
    `${accountPrefix}learners/${encodeURIComponent(owner.learnerProfileId)}/`;
  const recordingPrefix = lessonRecordingOwnerPrefix(owner);
  const allowedPrefixes = new Set([learnerPrefix]);
  if (owner.legacyStorageOwner) {
    allowedPrefixes.add(`${accountPrefix}learner-dubs/`);
    allowedPrefixes.add(recordingPrefix);
  }
  if (closure.prefixes.some((prefix) => !allowedPrefixes.has(prefix))) {
    throw new Error("Learner deletion storage closure is invalid.");
  }

  const dubClosure = DUB_DEFINITIONS.map(({ id }) =>
    dubStorageClosureKeys(createDubStorageKeys(owner, id))
  );
  const allowedMarkers = new Set(
    dubClosure.flatMap(({ markerKeys }) => markerKeys),
  );
  if (closure.markerKeys.some((key) => !allowedMarkers.has(key))) {
    throw new Error("Learner deletion storage closure is invalid.");
  }

  const allowedSlots = new Set(dubClosure.flatMap(({ slotKeys }) => slotKeys));
  const ownedArtKeys = new Set(await artKeys(database, owner));
  const siblingNamespace = `${accountPrefix}learners/`;
  for (const key of closure.slotKeys) {
    if (
      key.startsWith(siblingNamespace) &&
      !key.startsWith(learnerPrefix)
    ) {
      throw new Error("Learner deletion storage closure is invalid.");
    }
    if (
      allowedSlots.has(key) ||
      key.startsWith(recordingPrefix) ||
      key.startsWith(learnerPrefix) ||
      ownedArtKeys.has(key)
    ) {
      continue;
    }
    const object = await bucket.head(key);
    const state = object?.customMetadata?.state;
    const generation = object?.customMetadata?.generation;
    if (
      state === "account-deleting" ||
      (state === "learner-deleting" &&
        generation === deletionGeneration)
    ) {
      continue;
    }
    throw new Error("Learner deletion storage closure is invalid.");
  }
}

async function snapshotClosure(
  bucket: StorageDeletionBucket,
  database: Database,
  identity: AccountIdentity,
  tombstone: DeletionTombstone,
) {
  const owner = deletionOwner(identity, tombstone);
  const accountPrefix = `personalized-story-art/${encodeURIComponent(identity.userId)}/`;
  const learnerPrefix =
    `${accountPrefix}learners/${encodeURIComponent(tombstone.learnerProfileId)}/`;
  const ownedArtKeys = await artKeys(database, owner);
  const siblingNamespace = `${accountPrefix}learners/`;
  if (
    ownedArtKeys.some((key) =>
      key.startsWith(siblingNamespace) && !key.startsWith(learnerPrefix)
    )
  ) {
    throw new Error("Learner deletion storage closure is invalid.");
  }
  const prefixes = [learnerPrefix];
  if (tombstone.legacyStorageOwner) {
    prefixes.push(`${accountPrefix}learner-dubs/`);
    prefixes.push(lessonRecordingOwnerPrefix(owner));
  }
  const listed = (
    await Promise.all(prefixes.map((prefix) => listPrefix(bucket, prefix)))
  ).flat();
  const storages = DUB_DEFINITIONS.map(({ id }) =>
    createDubStorageKeys(owner, id)
  );
  const dubClosure = storages.map(dubStorageClosureKeys);
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
      ...ownedArtKeys,
    ]),
    version: 1,
  } satisfies LearnerDeletionStorageClosure;
}

async function persistClosure(
  bucket: Pick<R2Bucket, "head">,
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
    await validateLearnerDeletionStorageClosure(
      bucket,
      database,
      deletionOwner(identity, current),
      persisted,
      learnerDeletionGeneration(current),
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
  const legacyGuard = `EXISTS (
    SELECT 1 FROM learner_profile_deletion_tombstone
    WHERE learner_profile_id = ? AND user_id_hash = ?
      AND legacy_storage_owner = 1
  )`;
  const statements = tombstone.legacyStorageOwner
    ? [
      database.$client.prepare(
        `DELETE FROM guardian_dub_consent
         WHERE auth_user_id = ? AND ${legacyGuard}`,
      ).bind(
        identity.userId,
        tombstone.learnerProfileId,
        tombstone.userIdHash,
      ),
      database.$client.prepare(
        `DELETE FROM onboarding_session_bypass
         WHERE auth_user_id = ? AND ${legacyGuard}`,
      ).bind(
        identity.userId,
        tombstone.learnerProfileId,
        tombstone.userIdHash,
      ),
      database.$client.prepare(
        `DELETE FROM personalized_story_art_generation_lease
         WHERE auth_user_id = ? AND ${legacyGuard}`,
      ).bind(
        identity.userId,
        tombstone.learnerProfileId,
        tombstone.userIdHash,
      ),
      ...["learner_lesson", "conversation_session", "personalized_story_art"].map(
        (table) => database.$client.prepare(
          `DELETE FROM ${table}
           WHERE auth_user_id = ? AND learner_profile_id IS NULL
             AND ${legacyGuard}`,
        ).bind(
          identity.userId,
          tombstone.learnerProfileId,
          tombstone.userIdHash,
        ),
      ),
    ]
    : [];
  await database.$client.batch([
    ...statements,
    database.$client.prepare(
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
    ),
  ]);
}

export async function prepareLearnerDeletion({
  bucket,
  database,
  identity,
  profileId,
  wait = (delay: number) => scheduler.wait(delay),
}: LearnerDeletionInput) {
  const tombstone = await markDeletionPending(database, identity, profileId);
  const closure = await persistClosure(
    bucket,
    database,
    identity,
    tombstone,
    await snapshotClosure(bucket, database, identity, tombstone),
  );
  await cleanStorage(
    bucket,
    closure,
    learnerDeletionGeneration(tombstone),
    wait,
  );
  await deleteDatabaseClosure(database, identity, tombstone);
}
