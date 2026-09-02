import { LESSON_RECORDING_CONSENT_VERSION } from "../lib/lesson-recording-consent.js";
import { DUB_DEFINITIONS } from "../src/dubbing/rhyme-catalog.ts";
import { parseDubPeakBars } from "../src/dubbing/dub-waveform.ts";
import { CURRENT_DUB_CONSENT_VERSION } from "../worker/dub-consent.ts";
import {
  createDubStorageKeys,
  fenceBody,
} from "../worker/dub-storage.ts";
import { resolveLessonRecordingTarget } from "../worker/lesson-recording-catalog.ts";
import { lessonRecordingObjectKey } from "../worker/lesson-recording-storage.ts";
import {
  learnerRecordingsPrefix,
  privateMediaPathSegment,
} from "../worker/private-media-storage.ts";

const SOURCE_PREFIX = "personalized-story-art/";
const RETIRED_DUB_ID = "five-little-ducks-v1";
const DUB_AUDIO_FORMAT = "parrot-dub-audio-v2";
const LESSON_AUDIO_FORMAT = "parrot-lesson-recording-audio-v1";
const COPY_CONFIRMATION = "copy-verified-50-private-media-objects";
const MAX_AUDIO_BYTES = 512 * 1024;

export const PRODUCTION_EXPECTATIONS = Object.freeze({
  activeAudioObjects: 41,
  audioBytes: 3_265_256,
  audioObjects: 50,
  currentAccounts: 3,
  deletedAccounts: 9,
  destinationBytes: 3_265_648,
  destinationObjects: 58,
  fenceBytes: 141_568,
  fenceMarkerObjects: 59,
  fenceObjects: 943,
  fenceSlotObjects: 884,
  mappedLearners: 4,
  markerObjects: 8,
  peakBarObjects: 5,
  retiredAudioObjects: 9,
  sourceBytes: 3_406_824,
  sourceObjects: 993,
  sourceSnapshotSha256:
    "b98fb9152727dfe5ebdb6ef1e086444887fcc3b481ecd7b257f2ab9b50b57660",
  upgradedConsentObjects: 5,
});

type MigrationExpectations = typeof PRODUCTION_EXPECTATIONS;

export type PrivateMediaMigrationEnv = {
  DB: D1Database;
  DESTINATION_BUCKET: R2Bucket;
  SOURCE_BUCKET: R2Bucket;
};

type ProfileRow = {
  dub_consent_state: string | null;
  dub_consent_version: string | null;
  dub_grant_generation: string | null;
  email: string;
  learner_deleting: number;
  learner_id: string;
  legacy_storage_owner: number;
  lesson_recording_cleanup_before_generation: number | null;
  lesson_recording_consent_version: string | null;
  lesson_recording_generation: number;
  private_media_name: string;
};

type Owner = {
  email: string;
  learnerId: string;
  privateMediaName: string;
  row: ProfileRow;
  userId: string;
};

type ParsedAudio = {
  dubId?: string;
  kind: "dub" | "lesson";
  learnerId: string | null;
  lessonId?: string;
  lineId?: string;
  object: R2Object;
  retired: boolean;
  sceneIndex?: number;
  stepIndex?: number;
  userId: string;
};

type PlannedObject = {
  body: Uint8Array;
  bodySha256: string;
  httpMetadata: R2HTTPMetadata;
  metadata: Record<string, string>;
  source: R2Object;
  targetKey: string;
};

type PlannedMarker = {
  body: Uint8Array;
  targetKey: string;
};

type MigrationPlan = {
  databaseFingerprint: string;
  markers: PlannedMarker[];
  objects: PlannedObject[];
  sourceFingerprint: string;
};

export type PrivateMediaMigrationSummary = {
  activeAudioObjects: number;
  alreadyCopiedObjects: number;
  copiedObjects: number;
  destinationBytes: number;
  destinationObjects: number;
  markerObjects: number;
  mode: "copy" | "plan";
  retiredAudioObjects: number;
  sourceObjects: number;
  sourceSnapshotSha256: string;
  verifiedObjects: number;
};

export class PrivateMediaMigrationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PrivateMediaMigrationError";
    this.code = code;
  }
}

function fail(code: string): never {
  throw new PrivateMediaMigrationError(code);
}

function bytes(value: string) {
  return new TextEncoder().encode(value);
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index]);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonical(nested)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonical(value));
}

async function sha256(value: string | Uint8Array) {
  const input = typeof value === "string" ? bytes(value) : Uint8Array.from(value);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    input,
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function privateMediaSourceFingerprint(objects: R2Object[]) {
  const records = objects
    .map((object) => ({
      customMetadata: object.customMetadata ?? {},
      etag: object.etag,
      httpMetadata: object.httpMetadata ?? {},
      key: object.key,
      size: object.size,
      uploaded: object.uploaded.toISOString(),
      version: object.version,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
  return sha256(canonicalJson(records));
}

async function listAll(bucket: R2Bucket) {
  const objects: R2Object[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  while (true) {
    const page = await bucket.list({
      include: ["customMetadata", "httpMetadata"],
      limit: 1_000,
      ...(cursor ? { cursor } : {}),
    });
    objects.push(...page.objects);
    if (!page.truncated) break;
    if (!page.cursor || cursors.has(page.cursor)) fail("r2_cursor_invalid");
    cursors.add(page.cursor);
    cursor = page.cursor;
  }
  const keys = objects.map(({ key }) => key);
  if (new Set(keys).size !== keys.length) fail("r2_duplicate_key");
  return objects.sort((left, right) => left.key.localeCompare(right.key));
}

function exactCount(actual: number, expected: number, code: string) {
  if (actual !== expected) fail(code);
}

function parseAudio(object: R2Object): ParsedAudio {
  const rootDub = new RegExp(
    `^${SOURCE_PREFIX}([^/]+)/learner-dubs/([^/]+)/([^/]+)\\.audio$`,
  ).exec(object.key);
  const learnerDub = new RegExp(
    `^${SOURCE_PREFIX}([^/]+)/learners/([^/]+)/learner-dubs/([^/]+)/([^/]+)\\.audio$`,
  ).exec(object.key);
  const lesson = new RegExp(
    `^${SOURCE_PREFIX}([^/]+)/learners/([^/]+)/lesson-recordings/parrot/([^/]+)/scene-(\\d+)/step-(\\d+)\\.audio$`,
  ).exec(object.key);

  if (rootDub || learnerDub) {
    const userId = (learnerDub ?? rootDub)![1];
    const learnerId = learnerDub?.[2] ?? null;
    const dubId = learnerDub?.[3] ?? rootDub?.[2];
    const lineId = learnerDub?.[4] ?? rootDub?.[3];
    if (!dubId || !lineId) fail("source_audio_key_invalid");
    const definition = DUB_DEFINITIONS.find(({ id }) => id === dubId);
    const retired = dubId === RETIRED_DUB_ID && /^line-[1-9]$/.test(lineId);
    if (!retired && !definition?.lines.some(({ id }) => id === lineId)) {
      fail("source_dub_catalog_mismatch");
    }
    return {
      dubId,
      kind: "dub",
      learnerId,
      lineId,
      object,
      retired,
      userId,
    };
  }

  if (lesson) {
    const sceneIndex = Number(lesson[4]);
    const stepIndex = Number(lesson[5]);
    if (!Number.isSafeInteger(sceneIndex) || !Number.isSafeInteger(stepIndex)) {
      fail("source_lesson_key_invalid");
    }
    return {
      kind: "lesson",
      learnerId: lesson[2],
      lessonId: lesson[3],
      object,
      retired: false,
      sceneIndex,
      stepIndex,
      userId: lesson[1],
    };
  }

  fail("source_audio_key_invalid");
}

function validateSourceShape(
  objects: R2Object[],
  expected: MigrationExpectations,
) {
  exactCount(objects.length, expected.sourceObjects, "source_object_count_changed");
  exactCount(
    objects.reduce((total, object) => total + object.size, 0),
    expected.sourceBytes,
    "source_byte_count_changed",
  );
  const audio = objects.filter(({ customMetadata }) =>
    customMetadata?.state === "audio"
  );
  const fences = objects.filter(({ customMetadata }) =>
    customMetadata?.state !== "audio"
  );
  exactCount(audio.length, expected.audioObjects, "source_audio_count_changed");
  exactCount(
    audio.reduce((total, object) => total + object.size, 0),
    expected.audioBytes,
    "source_audio_bytes_changed",
  );
  exactCount(fences.length, expected.fenceObjects, "source_fence_count_changed");
  exactCount(
    fences.reduce((total, object) => total + object.size, 0),
    expected.fenceBytes,
    "source_fence_bytes_changed",
  );
  return { audio: audio.map(parseAudio), fences };
}

async function requireMigration(database: D1Database) {
  const row = await database.prepare(
    "SELECT 1 AS applied FROM d1_migrations WHERE name = ? LIMIT 1",
  ).bind("0020_human-readable-private-media.sql").first<{ applied: number }>();
  if (row?.applied !== 1) fail("database_migration_not_applied");
}

async function profilesFor(database: D1Database, userId: string) {
  const result = await database.prepare(
    `SELECT
       u.email,
       p.id AS learner_id,
       p.private_media_name,
       p.legacy_storage_owner,
       p.lesson_recording_consent_version,
       p.lesson_recording_generation,
       p.lesson_recording_cleanup_before_generation,
       c.consent_version AS dub_consent_version,
       c.grant_generation AS dub_grant_generation,
       c.state AS dub_consent_state,
       EXISTS (
         SELECT 1 FROM learner_profile_deletion_tombstone d
         WHERE d.learner_profile_id = p.id
       ) AS learner_deleting
     FROM user u
     JOIN learner_profile p ON p.auth_user_id = u.id
     LEFT JOIN learner_dub_consent c
       ON c.auth_user_id = u.id AND c.learner_profile_id = p.id
     WHERE u.id = ?
     ORDER BY p.created_at, p.id`,
  ).bind(userId).all<ProfileRow>();
  return result.results;
}

async function deletionTombstone(database: D1Database, userHash: string) {
  return database.prepare(
    `SELECT r2_prefix, requested_at
     FROM account_deletion_tombstone
     WHERE user_id_hash = ?
     LIMIT 1`,
  ).bind(userHash).first<{ r2_prefix: string; requested_at: number }>();
}

async function currentUserExists(database: D1Database, userId: string) {
  const row = await database.prepare(
    "SELECT 1 AS present FROM user WHERE id = ? LIMIT 1",
  ).bind(userId).first<{ present: number }>();
  return row?.present === 1;
}

function normalizedEmail(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

function normalizedPrivateName(value: string) {
  return value.normalize("NFKC").trim();
}

async function resolveOwners(
  database: D1Database,
  audio: ParsedAudio[],
  fences: R2Object[],
  expected: MigrationExpectations,
) {
  await requireMigration(database);
  const userIds = [...new Set(audio.map(({ userId }) => userId))].sort();
  exactCount(userIds.length, expected.currentAccounts, "current_account_count_changed");
  const profileMap = new Map<string, ProfileRow[]>();
  const databaseRecords: unknown[] = [];

  for (const userId of userIds) {
    const rows = await profilesFor(database, userId);
    if (rows.length === 0) fail("current_account_mapping_missing");
    const email = rows[0].email;
    if (
      rows.some((row) => row.email !== email) ||
      email !== normalizedEmail(email)
    ) {
      fail("current_email_not_canonical");
    }
    const names = rows.map(({ private_media_name }) => private_media_name);
    if (
      names.some((name) =>
        !name || name !== normalizedPrivateName(name) ||
        privateMediaPathSegment(name) === ""
      ) ||
      new Set(names.map((name) => name.toLowerCase())).size !== names.length
    ) {
      fail("private_media_name_invalid");
    }
    const userHash = await sha256(userId);
    if (await deletionTombstone(database, userHash)) {
      fail("current_account_deletion_pending");
    }
    profileMap.set(userId, rows);
    databaseRecords.push({ rows, userHash });
  }

  const fenceGroups = new Map<
    string,
    { generationHash: string; requestedAt: number }
  >();
  let markerCount = 0;
  let slotCount = 0;
  for (const fence of fences) {
    if (fence.customMetadata?.state !== "account-deleting") {
      fail("source_non_audio_state_invalid");
    }
    const userId = fence.key.startsWith(SOURCE_PREFIX)
      ? fence.key.slice(SOURCE_PREFIX.length).split("/", 1)[0]
      : "";
    const generation =
      /^account-deletion-v1:([a-f0-9]{64}):(\d+)$/.exec(
        fence.customMetadata.generation ?? "",
      );
    if (!userId || !generation) fail("source_fence_generation_invalid");
    const requestedAt = Number(generation[2]);
    if (!Number.isSafeInteger(requestedAt)) fail("source_fence_generation_invalid");
    const previous = fenceGroups.get(userId);
    if (
      previous &&
      (previous.generationHash !== generation[1] ||
        previous.requestedAt !== requestedAt)
    ) {
      fail("source_fence_generation_conflict");
    }
    fenceGroups.set(userId, {
      generationHash: generation[1],
      requestedAt,
    });
    if (fence.key.endsWith("/.dub-generation")) markerCount += 1;
    else if (fence.key.endsWith(".audio")) slotCount += 1;
    else fail("source_fence_key_invalid");
  }
  exactCount(markerCount, expected.fenceMarkerObjects, "source_fence_markers_changed");
  exactCount(slotCount, expected.fenceSlotObjects, "source_fence_slots_changed");
  exactCount(
    fenceGroups.size,
    expected.deletedAccounts,
    "deleted_account_count_changed",
  );

  for (const [userId, generation] of fenceGroups) {
    if (profileMap.has(userId) || await currentUserExists(database, userId)) {
      fail("deleted_account_is_current");
    }
    if (await sha256(userId) !== generation.generationHash) {
      fail("deleted_account_hash_mismatch");
    }
    const tombstone = await deletionTombstone(
      database,
      generation.generationHash,
    );
    if (
      !tombstone ||
      tombstone.requested_at !== generation.requestedAt ||
      tombstone.r2_prefix !== `${SOURCE_PREFIX}${userId}/`
    ) {
      fail("deleted_account_tombstone_mismatch");
    }
    databaseRecords.push({ generation, tombstone });
  }

  const owners = new Map<string, Owner>();
  for (const item of audio) {
    const rows = profileMap.get(item.userId);
    if (!rows) fail("current_account_mapping_missing");
    const row = item.learnerId
      ? rows.find(({ learner_id }) => learner_id === item.learnerId)
      : rows.find(({ legacy_storage_owner }) => legacy_storage_owner === 1);
    if (
      !row || row.learner_deleting === 1 ||
      (!item.learnerId &&
        rows.filter(({ legacy_storage_owner }) => legacy_storage_owner === 1)
          .length !== 1)
    ) {
      fail("learner_mapping_invalid");
    }
    owners.set(`${item.userId}\0${item.learnerId ?? "legacy"}`, {
      email: row.email,
      learnerId: row.learner_id,
      privateMediaName: row.private_media_name,
      row,
      userId: item.userId,
    });
  }
  exactCount(
    new Set([...owners.values()].map(({ learnerId }) => learnerId)).size,
    expected.mappedLearners,
    "mapped_learner_count_changed",
  );
  return {
    fingerprint: await sha256(canonicalJson(databaseRecords)),
    owners,
  };
}

function ownerFor(item: ParsedAudio, owners: Map<string, Owner>) {
  const owner = owners.get(`${item.userId}\0${item.learnerId ?? "legacy"}`);
  if (!owner) fail("learner_mapping_missing");
  return owner;
}

function exactMetadata(left: unknown, right: unknown) {
  return canonicalJson(left) === canonicalJson(right);
}

function validMediaSignature(contentType: string | undefined, value: Uint8Array) {
  if (contentType === "audio/webm") {
    return value[0] === 0x1a && value[1] === 0x45 &&
      value[2] === 0xdf && value[3] === 0xa3;
  }
  if (contentType === "audio/mp4") {
    return value.byteLength >= 8 &&
      new TextDecoder().decode(value.slice(4, 8)) === "ftyp";
  }
  return false;
}

async function sourceBody(bucket: R2Bucket, item: ParsedAudio) {
  const stored = await bucket.get(item.object.key, {
    onlyIf: { etagMatches: item.object.etag },
  });
  if (!stored || !("body" in stored)) fail("source_object_changed");
  const body = await stored.bytes();
  if (
    body.byteLength !== item.object.size ||
    stored.version !== item.object.version ||
    stored.uploaded.getTime() !== item.object.uploaded.getTime() ||
    !exactMetadata(stored.customMetadata, item.object.customMetadata) ||
    !exactMetadata(stored.httpMetadata, item.object.httpMetadata)
  ) {
    fail("source_object_changed");
  }
  return body;
}

function validateAudioBody(item: ParsedAudio, body: Uint8Array) {
  const metadata = item.object.customMetadata ?? {};
  const offset = Number(metadata.payloadOffset);
  if (
    !Number.isSafeInteger(offset) || offset <= 0 ||
    body.byteLength <= offset || body.byteLength - offset > MAX_AUDIO_BYTES
  ) {
    fail("source_audio_payload_invalid");
  }
  let envelope: unknown;
  try {
    envelope = JSON.parse(new TextDecoder().decode(body.slice(0, offset)));
  } catch {
    fail("source_audio_envelope_invalid");
  }
  const expectedEnvelope = item.kind === "dub"
    ? [DUB_AUDIO_FORMAT, metadata.generation, metadata.uploadNonce]
    : [LESSON_AUDIO_FORMAT, metadata.uploadNonce];
  if (!exactMetadata(envelope, expectedEnvelope)) {
    fail("source_audio_envelope_invalid");
  }
  if (!validMediaSignature(item.object.httpMetadata?.contentType, body.slice(offset))) {
    fail("source_audio_signature_invalid");
  }
}

function plannedTarget(
  item: ParsedAudio,
  owner: Owner,
  metadata: Record<string, string>,
) {
  const identity = {
    privateMediaName: owner.privateMediaName,
    userEmail: owner.email,
  };
  if (item.kind === "dub") {
    if (
      metadata.generation !== "legacy" ||
      metadata.lineId !== item.lineId ||
      metadata.state !== "audio" ||
      !metadata.uploadNonce
    ) {
      fail("source_dub_metadata_invalid");
    }
    if (metadata.peakBars && !parseDubPeakBars(metadata.peakBars)) {
      fail("source_dub_peak_bars_invalid");
    }
    if (item.retired) {
      if (
        metadata.guardianConsentVersion !== "guardian-voice-r2-v1" ||
        metadata.guardianConsentGeneration
      ) {
        fail("retired_dub_metadata_invalid");
      }
      return {
        metadata,
        targetKey:
          `${learnerRecordingsPrefix(identity)}retired/nursery-rhymes/${item.dubId}/${item.lineId}.audio`,
        upgraded: false,
      };
    }
    if (
      owner.row.dub_consent_state !== "granted" ||
      owner.row.dub_consent_version !== CURRENT_DUB_CONSENT_VERSION ||
      !owner.row.dub_grant_generation
    ) {
      fail("current_dub_consent_invalid");
    }
    let upgraded = false;
    if (metadata.guardianConsentVersion === "guardian-voice-r2-v1") {
      if (metadata.guardianConsentGeneration) fail("source_dub_metadata_invalid");
      metadata = {
        ...metadata,
        guardianConsentGeneration: owner.row.dub_grant_generation,
        guardianConsentVersion: CURRENT_DUB_CONSENT_VERSION,
      };
      upgraded = true;
    } else if (
      metadata.guardianConsentVersion !== CURRENT_DUB_CONSENT_VERSION ||
      metadata.guardianConsentGeneration !== owner.row.dub_grant_generation
    ) {
      fail("source_dub_consent_mismatch");
    }
    return {
      metadata,
      targetKey: createDubStorageKeys(identity, item.dubId!).objectKey(item.lineId!),
      upgraded,
    };
  }

  const slot = {
    lessonId: item.lessonId!,
    sceneIndex: item.sceneIndex!,
    stepIndex: item.stepIndex!,
  };
  const target = resolveLessonRecordingTarget(slot);
  if (
    !target || target.targetText !== metadata.targetText ||
    metadata.consentVersion !== LESSON_RECORDING_CONSENT_VERSION ||
    metadata.consentGeneration !== String(owner.row.lesson_recording_generation) ||
    owner.row.lesson_recording_consent_version !==
      LESSON_RECORDING_CONSENT_VERSION ||
    owner.row.lesson_recording_cleanup_before_generation !== null ||
    metadata.lessonId !== item.lessonId ||
    metadata.sceneIndex !== String(item.sceneIndex) ||
    metadata.stepIndex !== String(item.stepIndex) ||
    metadata.source !== "parrot" || metadata.state !== "audio"
  ) {
    fail("source_lesson_metadata_invalid");
  }
  return {
    metadata,
    targetKey: lessonRecordingObjectKey(identity, slot),
    upgraded: false,
  };
}

async function buildPlan(
  env: PrivateMediaMigrationEnv,
  expected: MigrationExpectations,
) {
  const sourceObjects = await listAll(env.SOURCE_BUCKET);
  const sourceFingerprint = await privateMediaSourceFingerprint(sourceObjects);
  if (sourceFingerprint !== expected.sourceSnapshotSha256) {
    fail("source_snapshot_changed");
  }
  const { audio, fences } = validateSourceShape(sourceObjects, expected);
  exactCount(
    audio.filter(({ retired }) => retired).length,
    expected.retiredAudioObjects,
    "retired_audio_count_changed",
  );
  exactCount(
    audio.filter(({ retired }) => !retired).length,
    expected.activeAudioObjects,
    "active_audio_count_changed",
  );
  const resolution = await resolveOwners(env.DB, audio, fences, expected);
  const objects: PlannedObject[] = [];
  let upgrades = 0;
  let peaks = 0;

  for (const item of audio) {
    const body = await sourceBody(env.SOURCE_BUCKET, item);
    validateAudioBody(item, body);
    const metadata = { ...(item.object.customMetadata ?? {}) };
    const target = plannedTarget(item, ownerFor(item, resolution.owners), metadata);
    if (target.upgraded) upgrades += 1;
    if (metadata.peakBars) peaks += 1;
    objects.push({
      body,
      bodySha256: await sha256(body),
      httpMetadata: { ...(item.object.httpMetadata ?? {}) },
      metadata: target.metadata,
      source: item.object,
      targetKey: target.targetKey,
    });
  }
  exactCount(upgrades, expected.upgradedConsentObjects, "consent_upgrade_count_changed");
  exactCount(peaks, expected.peakBarObjects, "peak_bar_count_changed");
  if (new Set(objects.map(({ targetKey }) => targetKey)).size !== objects.length) {
    fail("destination_key_collision");
  }

  const markerBody = fenceBody("marker", "legacy", "ready");
  const markerKeys = [...new Set(
    audio
      .filter((item) => item.kind === "dub" && !item.retired)
      .map((item) => {
        const owner = ownerFor(item, resolution.owners);
        return createDubStorageKeys(
          { privateMediaName: owner.privateMediaName, userEmail: owner.email },
          item.dubId!,
        ).markerKey;
      }),
  )].sort();
  exactCount(markerKeys.length, expected.markerObjects, "marker_count_changed");
  const markers = markerKeys.map((targetKey) => ({
    body: markerBody,
    targetKey,
  }));
  return {
    databaseFingerprint: resolution.fingerprint,
    markers,
    objects,
    sourceFingerprint,
  } satisfies MigrationPlan;
}

async function getBody(bucket: R2Bucket, key: string) {
  const object = await bucket.get(key);
  return object && "body" in object ? object : null;
}

async function verifyObject(
  bucket: R2Bucket,
  expected: Pick<PlannedObject, "bodySha256" | "httpMetadata" | "metadata">,
  key: string,
) {
  const object = await getBody(bucket, key);
  if (!object) return false;
  const body = await object.bytes();
  if (
    await sha256(body) !== expected.bodySha256 ||
    !exactMetadata(object.customMetadata ?? {}, expected.metadata) ||
    !exactMetadata(object.httpMetadata ?? {}, expected.httpMetadata)
  ) {
    fail("destination_object_conflict");
  }
  return true;
}

async function verifyMarker(bucket: R2Bucket, marker: PlannedMarker) {
  const object = await getBody(bucket, marker.targetKey);
  if (!object) return false;
  if (
    !equalBytes(await object.bytes(), marker.body) ||
    !exactMetadata(object.customMetadata ?? {}, {
      generation: "legacy",
      state: "ready",
    }) ||
    !exactMetadata(object.httpMetadata ?? {}, {})
  ) {
    fail("destination_marker_conflict");
  }
  return true;
}

async function validateDestination(env: PrivateMediaMigrationEnv, plan: MigrationPlan) {
  const listed = await listAll(env.DESTINATION_BUCKET);
  const allowed = new Set([
    ...plan.objects.map(({ targetKey }) => targetKey),
    ...plan.markers.map(({ targetKey }) => targetKey),
  ]);
  if (listed.some(({ key }) => !allowed.has(key))) {
    fail("destination_contains_unexpected_object");
  }
  let existingObjects = 0;
  for (const object of plan.objects) {
    if (await verifyObject(env.DESTINATION_BUCKET, object, object.targetKey)) {
      existingObjects += 1;
    }
  }
  let existingMarkers = 0;
  for (const marker of plan.markers) {
    if (await verifyMarker(env.DESTINATION_BUCKET, marker)) existingMarkers += 1;
  }
  if (existingMarkers > 0 && existingObjects !== plan.objects.length) {
    fail("destination_marker_precedes_audio");
  }
  return { existingMarkers, existingObjects };
}

async function putObject(
  bucket: R2Bucket,
  object: PlannedObject,
) {
  const stored = await bucket.put(object.targetKey, object.body, {
    customMetadata: object.metadata,
    httpMetadata: object.httpMetadata,
    onlyIf: { etagDoesNotMatch: "*" },
  });
  if (!stored && !await verifyObject(bucket, object, object.targetKey)) {
    fail("destination_write_conflict");
  }
  if (!await verifyObject(bucket, object, object.targetKey)) {
    fail("destination_verification_failed");
  }
}

async function putMarker(bucket: R2Bucket, marker: PlannedMarker) {
  const stored = await bucket.put(marker.targetKey, marker.body, {
    customMetadata: { generation: "legacy", state: "ready" },
    onlyIf: { etagDoesNotMatch: "*" },
  });
  if (!stored && !await verifyMarker(bucket, marker)) {
    fail("destination_marker_write_conflict");
  }
  if (!await verifyMarker(bucket, marker)) {
    fail("destination_marker_verification_failed");
  }
}

async function assertSourceStable(
  bucket: R2Bucket,
  fingerprint: string,
) {
  if (await privateMediaSourceFingerprint(await listAll(bucket)) !== fingerprint) {
    fail("source_changed_during_migration");
  }
}

async function assertDatabaseStable(
  env: PrivateMediaMigrationEnv,
  expected: MigrationExpectations,
  plan: MigrationPlan,
) {
  const source = validateSourceShape(await listAll(env.SOURCE_BUCKET), expected);
  const current = await resolveOwners(env.DB, source.audio, source.fences, expected);
  if (current.fingerprint !== plan.databaseFingerprint) {
    fail("database_changed_during_migration");
  }
}

export async function runPrivateMediaMigration(
  env: PrivateMediaMigrationEnv,
  {
    apply = false,
    expected = PRODUCTION_EXPECTATIONS,
  }: {
    apply?: boolean;
    expected?: MigrationExpectations;
  } = {},
): Promise<PrivateMediaMigrationSummary> {
  const plan = await buildPlan(env, expected);
  const initial = await validateDestination(env, plan);
  let copiedObjects = 0;

  if (apply) {
    for (const object of plan.objects) {
      if (!await verifyObject(env.DESTINATION_BUCKET, object, object.targetKey)) {
        await putObject(env.DESTINATION_BUCKET, object);
        copiedObjects += 1;
      }
    }
    await assertSourceStable(env.SOURCE_BUCKET, plan.sourceFingerprint);
    await assertDatabaseStable(env, expected, plan);
    const markerGate = await validateDestination(env, plan);
    exactCount(
      markerGate.existingObjects,
      expected.audioObjects,
      "destination_audio_not_ready",
    );
    for (const marker of plan.markers) {
      if (!await verifyMarker(env.DESTINATION_BUCKET, marker)) {
        await putMarker(env.DESTINATION_BUCKET, marker);
      }
    }
    await assertSourceStable(env.SOURCE_BUCKET, plan.sourceFingerprint);
    await assertDatabaseStable(env, expected, plan);
  }

  const final = await validateDestination(env, plan);
  const destination = await listAll(env.DESTINATION_BUCKET);
  const destinationBytes = destination.reduce(
    (total, object) => total + object.size,
    0,
  );
  if (apply) {
    exactCount(
      destination.length,
      expected.destinationObjects,
      "destination_object_count_invalid",
    );
    exactCount(
      destinationBytes,
      expected.destinationBytes,
      "destination_byte_count_invalid",
    );
    exactCount(
      final.existingObjects,
      expected.audioObjects,
      "destination_audio_count_invalid",
    );
    exactCount(
      final.existingMarkers,
      expected.markerObjects,
      "destination_marker_count_invalid",
    );
  }

  return {
    activeAudioObjects: expected.activeAudioObjects,
    alreadyCopiedObjects: initial.existingObjects,
    copiedObjects,
    destinationBytes,
    destinationObjects: destination.length,
    markerObjects: final.existingMarkers,
    mode: apply ? "copy" : "plan",
    retiredAudioObjects: expected.retiredAudioObjects,
    sourceObjects: expected.sourceObjects,
    sourceSnapshotSha256: plan.sourceFingerprint,
    verifiedObjects: final.existingObjects,
  };
}

function response(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request: Request, env: PrivateMediaMigrationEnv) {
    try {
      const url = new URL(request.url);
      if (request.method !== "POST") {
        return response({ error: "method_not_allowed" }, 405);
      }
      if (url.pathname === "/plan") {
        return response(await runPrivateMediaMigration(env));
      }
      if (url.pathname === "/copy") {
        if (
          request.headers.get("X-Parrot-Private-Media-Migration") !==
            COPY_CONFIRMATION
        ) {
          return response({ error: "confirmation_required" }, 403);
        }
        return response(await runPrivateMediaMigration(env, { apply: true }));
      }
      return response({ error: "not_found" }, 404);
    } catch (error) {
      const code = error instanceof PrivateMediaMigrationError
        ? error.code
        : "internal_error";
      console.error("private-media-migration", code);
      return response({ error: code }, 409);
    }
  },
};
