import { DUB_DEFINITIONS, type DubDefinition } from "../src/dubbing/rhyme-catalog.ts";
import { isAccountDeletionPending } from "./account-deletion.ts";
import type { Database } from "./database.ts";
import {
  createDubConsentRepository,
  CURRENT_DUB_CONSENT_VERSION,
} from "./dub-consent.ts";
import {
  createDubStorageKeys,
  type DubStorageKeys,
  fenceBody,
  hasState,
  isR2WriteRateError,
  LEGACY_DUB_LINE_IDS,
  MAX_R2_WRITE_ATTEMPTS,
  R2_WRITE_INTERVAL_MS,
  retryDelay,
} from "./dub-storage.ts";
import { parseDubRoute } from "./dub-route.ts";
import type { LearnerProfileIdentity } from "./learner-profile.ts";
import { isLearnerDeletionPending } from "./request-identity.ts";
import {
  readBoundedBytes,
  readBoundedText,
  RequestBodyTooLargeError,
} from "./request-body.ts";

const MAX_CLIP_BYTES = 512 * 1024;
const MAX_CONSENT_BODY_BYTES = 8 * 1024;
const LEGACY_CONSENT_VERSION = "guardian-voice-r2-v1";
const LEGACY_GENERATION = "legacy";
const AUDIO_FORMAT = "parrot-dub-audio-v1";
const AUDIO_FORMAT_V2 = "parrot-dub-audio-v2";
const MAX_CAS_CONFLICTS = 16;
const MIME_SIGNATURES = {
  "audio/webm": (bytes: Uint8Array) =>
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3,
  "audio/mp4": (bytes: Uint8Array) =>
    bytes.length >= 8 &&
    new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp",
  "audio/ogg": (bytes: Uint8Array) =>
    new TextDecoder().decode(bytes.slice(0, 4)) === "OggS",
} as const;

export interface DubEnv {
  PERSONALIZED_STORY_ART_BUCKET: R2Bucket;
}

export interface DubRequestInput {
  database: Database;
  env: DubEnv;
  identity: LearnerProfileIdentity;
  request: Request;
}

type DubHandlerOverrides = {
  consentRepository?: ReturnType<typeof createDubConsentRepository>;
  createGeneration?: () => string;
  createUploadNonce?: () => string;
  isDeletionPending?: typeof isAccountDeletionPending;
  isLearnerDeletionPending?: typeof isLearnerDeletionPending;
  now?: () => Date;
  wait?: (delay: number) => Promise<void>;
};

type Wait = NonNullable<DubHandlerOverrides["wait"]>;

type DubMarker =
  | { kind: "absent" }
  | { etag: string; kind: "malformed"; object: R2Object }
  | {
      etag: string;
      generation: string;
      kind: "valid";
      object: R2Object;
      state:
        | "account-deleting"
        | "deleting"
        | "learner-deleting"
        | "ready";
    };

type AudioStorage =
  | { kind: "legacy" }
  | {
      generation: string;
      kind: "enveloped";
      prefix: Uint8Array;
      uploadNonce: string | undefined;
    };

type AudioByteRange = {
  end: number;
  length: number;
  start: number;
};

type AudioPayload = {
  object: R2ObjectBody;
  range: AudioByteRange | null;
  totalLength: number;
};

class DubApiError extends Error {
  readonly code: string;
  readonly headers?: HeadersInit;
  readonly status: number;

  constructor(
    status: number,
    code: string,
    message = code,
    headers?: HeadersInit,
  ) {
    super(message);
    this.code = code;
    this.headers = headers;
    this.status = status;
  }
}

function json(payload: unknown, init: ResponseInit = {}) {
  return Response.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...init.headers },
  });
}

async function readMarker(
  bucket: R2Bucket,
  storage: DubStorageKeys,
): Promise<DubMarker> {
  const marker = await bucket.head(storage.markerKey);
  if (!marker) return { kind: "absent" };
  const generation = marker.customMetadata?.generation;
  const state = marker.customMetadata?.state;
  if (
    !generation ||
    (
      state !== "account-deleting" &&
      state !== "deleting" &&
      state !== "learner-deleting" &&
      state !== "ready"
    )
  ) {
    return { etag: marker.etag, kind: "malformed", object: marker };
  }
  return {
    etag: marker.etag,
    generation,
    kind: "valid",
    object: marker,
    state,
  };
}

async function readyGeneration(bucket: R2Bucket, storage: DubStorageKeys) {
  const marker = await readMarker(bucket, storage);
  if (marker.kind === "absent") return null;
  if (marker.kind === "valid" && marker.state === "account-deleting") {
    throw new DubApiError(409, "account_deletion_pending");
  }
  if (marker.kind === "valid" && marker.state === "learner-deleting") {
    throw new DubApiError(409, "learner_deletion_pending");
  }
  if (marker.kind !== "valid" || marker.state !== "ready") {
    throw new DubApiError(409, "dub_reset_in_progress");
  }
  return marker.generation;
}

async function beginReset(
  bucket: R2Bucket,
  storage: DubStorageKeys,
  generation: string,
  wait: Wait,
) {
  const current = await readMarker(bucket, storage);
  if (current.kind === "valid" && current.state === "account-deleting") {
    throw new DubApiError(409, "account_deletion_pending");
  }
  if (current.kind === "valid" && current.state === "learner-deleting") {
    throw new DubApiError(409, "learner_deletion_pending");
  }
  const marker = await conditionalPut(
    bucket,
    storage.markerKey,
    fenceBody("marker", generation, "deleting"),
    {
      customMetadata: { generation, state: "deleting" },
    },
    current.kind === "absent" ? null : current.object,
    wait,
    (object) => hasState(object, generation, "deleting"),
  );
  if (!marker) throw new DubApiError(409, "dub_reset_in_progress");
  return marker;
}

function encoded(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value));
}

function audioPrefix(generation: string, uploadNonce?: string) {
  return uploadNonce === undefined
    ? encoded([AUDIO_FORMAT, generation])
    : encoded([AUDIO_FORMAT_V2, generation, uploadNonce]);
}

function audioBody(generation: string, uploadNonce: string, audio: Uint8Array) {
  const prefix = audioPrefix(generation, uploadNonce);
  const body = new Uint8Array(prefix.byteLength + audio.byteLength);
  body.set(prefix);
  body.set(audio, prefix.byteLength);
  return { body, payloadOffset: prefix.byteLength };
}

function conditionalWrite(object: R2Object | null) {
  return object
    ? { etagMatches: object.etag }
    : { etagDoesNotMatch: "*" };
}

function sameObject(left: R2Object | null, right: R2Object | null) {
  return left === null || right === null
    ? left === right
    : left.etag === right.etag && left.version === right.version;
}

async function conditionalPut(
  bucket: R2Bucket,
  key: string,
  value: Uint8Array,
  options: R2PutOptions,
  observed: R2Object | null,
  wait: Wait,
  isDesired?: (object: R2Object) => boolean,
) {
  for (let attempt = 0; attempt < MAX_R2_WRITE_ATTEMPTS; attempt += 1) {
    try {
      return await bucket.put(key, value, {
        ...options,
        onlyIf: conditionalWrite(observed),
      });
    } catch (error) {
      if (!isR2WriteRateError(error)) throw error;
      const current = await bucket.head(key);
      if (current && isDesired?.(current)) return current;
      if (!sameObject(current, observed)) return null;
      if (attempt === MAX_R2_WRITE_ATTEMPTS - 1) throw error;
      await wait(retryDelay(attempt));
    }
  }
  throw new Error("R2 conditional write retry limit exceeded.");
}

function audioStorage(
  object: R2Object,
  ready: string | null,
  consentGeneration: string,
): AudioStorage | null {
  const metadata = object.customMetadata;
  const consentVersion = metadata?.guardianConsentVersion;
  if (
    (consentVersion === CURRENT_DUB_CONSENT_VERSION &&
      metadata?.guardianConsentGeneration !== consentGeneration) ||
    (consentVersion !== undefined &&
      consentVersion !== LEGACY_CONSENT_VERSION &&
      consentVersion !== CURRENT_DUB_CONSENT_VERSION)
  ) {
    return null;
  }
  if (
    ready === null &&
    metadata?.generation === undefined &&
    metadata?.state === undefined &&
    metadata?.payloadOffset === undefined &&
    metadata?.uploadNonce === undefined
  ) {
    return object.size > 0 ? { kind: "legacy" } : null;
  }

  const generation = ready ?? LEGACY_GENERATION;
  const uploadNonce = metadata?.uploadNonce;
  if (uploadNonce === "") return null;
  const prefix = audioPrefix(generation, uploadNonce);
  if (
    metadata?.generation !== generation ||
    metadata.state !== "audio" ||
    metadata.payloadOffset !== String(prefix.byteLength) ||
    object.size <= prefix.byteLength ||
    object.size > prefix.byteLength + MAX_CLIP_BYTES
  ) {
    return null;
  }
  return { generation, kind: "enveloped", prefix, uploadNonce };
}

function hasBody(object: R2Object | R2ObjectBody | null): object is R2ObjectBody {
  return object !== null && "body" in object;
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index]);
}

function rangeNotSatisfiable(totalLength: number): never {
  throw new DubApiError(
    416,
    "range_not_satisfiable",
    undefined,
    {
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes */${totalLength}`,
      "X-Content-Type-Options": "nosniff",
    },
  );
}

function parseAudioRange(
  value: string | null,
  totalLength: number,
): AudioByteRange | null {
  if (value === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value);
  if (!match || (match[1] === "" && match[2] === "")) {
    return rangeNotSatisfiable(totalLength);
  }

  const parsePosition = (position: string) => {
    const parsed = Number(position);
    return Number.isSafeInteger(parsed) ? parsed : null;
  };

  if (match[1] === "") {
    const suffixLength = parsePosition(match[2]);
    if (suffixLength === null || suffixLength <= 0) {
      return rangeNotSatisfiable(totalLength);
    }
    const length = Math.min(suffixLength, totalLength);
    const start = totalLength - length;
    return { end: totalLength - 1, length, start };
  }

  const start = parsePosition(match[1]);
  const requestedEnd = match[2] === ""
    ? totalLength - 1
    : parsePosition(match[2]);
  if (
    start === null ||
    requestedEnd === null ||
    start >= totalLength ||
    requestedEnd < start
  ) {
    return rangeNotSatisfiable(totalLength);
  }
  const end = Math.min(requestedEnd, totalLength - 1);
  return { end, length: end - start + 1, start };
}

async function validateAudioPrefix(
  bucket: R2Bucket,
  key: string,
  object: R2Object,
  storage: AudioStorage,
) {
  if (storage.kind === "legacy") return object;
  const prefixObject = await bucket.get(key, {
    onlyIf: { etagMatches: object.etag },
    range: { length: storage.prefix.byteLength, offset: 0 },
  });
  if (
    !hasBody(prefixObject) ||
    !hasState(prefixObject, storage.generation, "audio") ||
    prefixObject.customMetadata?.payloadOffset !==
      String(storage.prefix.byteLength) ||
    prefixObject.customMetadata?.uploadNonce !== storage.uploadNonce
  ) {
    return null;
  }
  const bytes = await prefixObject.bytes();
  return equalBytes(bytes, storage.prefix) ? prefixObject : null;
}

async function getAudioPayload(
  bucket: R2Bucket,
  key: string,
  object: R2Object,
  ready: string | null,
  consentGeneration: string,
  rangeHeader: string | null,
): Promise<AudioPayload | null> {
  const storage = audioStorage(object, ready, consentGeneration);
  if (!storage) return null;
  if (storage.kind === "legacy") {
    const range = parseAudioRange(rangeHeader, object.size);
    const legacy = await bucket.get(key, {
      onlyIf: { etagMatches: object.etag },
      ...(range
        ? { range: { length: range.length, offset: range.start } }
        : {}),
    });
    return hasBody(legacy) &&
        audioStorage(legacy, ready, consentGeneration)?.kind === "legacy"
      ? { object: legacy, range, totalLength: object.size }
      : null;
  }
  if (!await validateAudioPrefix(bucket, key, object, storage)) return null;
  const totalLength = object.size - storage.prefix.byteLength;
  const range = parseAudioRange(rangeHeader, totalLength);
  const payload = await bucket.get(key, {
    onlyIf: { etagMatches: object.etag },
    range: range
      ? {
          length: range.length,
          offset: storage.prefix.byteLength + range.start,
        }
      : { offset: storage.prefix.byteLength },
  });
  if (
    !hasBody(payload) ||
    !hasState(payload, storage.generation, "audio") ||
    payload.customMetadata?.payloadOffset !==
      String(storage.prefix.byteLength) ||
    payload.customMetadata?.uploadNonce !== storage.uploadNonce
  ) {
    return null;
  }
  return { object: payload, range, totalLength };
}

async function assertResetOwner(
  bucket: R2Bucket,
  storage: DubStorageKeys,
  generation: string,
  etag: string,
) {
  const marker = await readMarker(bucket, storage);
  if (
    marker.kind !== "valid" ||
    marker.state !== "deleting" ||
    marker.generation !== generation ||
    marker.etag !== etag
  ) {
    throw new DubApiError(409, "dub_reset_in_progress");
  }
}

async function fenceResetOwnedKey(
  bucket: R2Bucket,
  storage: DubStorageKeys,
  key: string,
  kind: "marker" | "slot",
  generation: string,
  state: string,
  markerEtag: string,
  wait: Wait,
) {
  for (let attempt = 0; attempt < MAX_CAS_CONFLICTS; attempt += 1) {
    await assertResetOwner(bucket, storage, generation, markerEtag);
    const current = await bucket.head(key);
    await assertResetOwner(bucket, storage, generation, markerEtag);
    const fence = await conditionalPut(
      bucket,
      key,
      fenceBody(kind, generation, state),
      {
        customMetadata: { generation, state },
      },
      current,
      wait,
      (object) => hasState(object, generation, state),
    );
    if (fence) return;
  }
  throw new DubApiError(409, "dub_reset_in_progress");
}

function tombstoneSlot(
  bucket: R2Bucket,
  storage: DubStorageKeys,
  lineId: string,
  generation: string,
  markerEtag: string,
  wait: Wait,
) {
  return fenceResetOwnedKey(
    bucket,
    storage,
    storage.objectKey(lineId),
    "slot",
    generation,
    "tombstone",
    markerEtag,
    wait,
  );
}

async function deleteWithRetry(bucket: R2Bucket, keys: string[], wait: Wait) {
  for (let attempt = 0; attempt < MAX_R2_WRITE_ATTEMPTS; attempt += 1) {
    try {
      await bucket.delete(keys);
      return;
    } catch (error) {
      if (!isR2WriteRateError(error) || attempt === MAX_R2_WRITE_ATTEMPTS - 1) {
        throw error;
      }
      await wait(retryDelay(attempt));
    }
  }
}

async function retireLegacyDub(
  bucket: R2Bucket,
  storage: DubStorageKeys,
  generation: string,
  markerEtag: string,
  wait: Wait,
) {
  const marker = storage.retiredLegacyMarkerKey;
  if (!marker) return;
  const prefix = marker.slice(0, -".dub-generation".length);
  const slots = LEGACY_DUB_LINE_IDS.map((lineId) =>
    storage.retiredLegacyObjectKey(lineId)
  ).filter((key): key is string => key !== null);
  const retirementKeys = new Set([marker, ...slots]);

  await fenceResetOwnedKey(
    bucket,
    storage,
    marker,
    "marker",
    generation,
    "account-deleting",
    markerEtag,
    wait,
  );
  for (const key of slots) {
    await fenceResetOwnedKey(
      bucket,
      storage,
      key,
      "slot",
      generation,
      "account-deleting",
      markerEtag,
      wait,
    );
  }

  let cursor: string | undefined;
  let hasMore = true;
  const seenCursors = new Set<string>();

  while (hasMore) {
    await assertResetOwner(bucket, storage, generation, markerEtag);
    const page = await bucket.list({
      ...(cursor === undefined ? {} : { cursor }),
      prefix,
    });
    const listedKeys = page.objects.map(({ key }) => key);
    if (listedKeys.some((key) => !key.startsWith(prefix))) {
      throw new Error("R2 returned an object outside the legacy dub prefix.");
    }
    const keys = listedKeys.filter((key) => !retirementKeys.has(key));
    await assertResetOwner(bucket, storage, generation, markerEtag);
    if (keys.length > 0) await deleteWithRetry(bucket, keys, wait);

    hasMore = page.truncated;
    if (page.truncated) {
      if (!page.cursor || seenCursors.has(page.cursor)) {
        throw new Error("R2 legacy dub listing did not advance its cursor.");
      }
      seenCursors.add(page.cursor);
      cursor = page.cursor;
    }
  }
}

function isDemonstrablyNonAudio(object: R2Object) {
  const state = object.customMetadata?.state;
  return state !== undefined && state !== "audio";
}

async function fenceDeletingSlot(
  bucket: R2Bucket,
  key: string,
  stored: R2Object,
  token: string,
  state: "account-deleting" | "learner-deleting",
  wait: Wait,
) {
  let current: R2Object | null = stored;
  let writeFailures = 0;
  for (let attempt = 0; attempt < MAX_CAS_CONFLICTS; attempt += 1) {
    if (!current || isDemonstrablyNonAudio(current)) return;
    let tombstone: R2Object | null;
    try {
      tombstone = await conditionalPut(
        bucket,
        key,
        fenceBody("slot", token, state),
        { customMetadata: { generation: token, state } },
        current,
        wait,
        (object) => hasState(object, token, state),
      );
    } catch (error) {
      current = await bucket.head(key);
      if (!current || isDemonstrablyNonAudio(current)) return;
      writeFailures += 1;
      if (writeFailures >= MAX_R2_WRITE_ATTEMPTS) throw error;
      await wait(retryDelay(writeFailures));
      continue;
    }
    if (tombstone) return;
    current = await bucket.head(key);
  }
  throw new Error("Dub account-deletion cleanup contention exceeded.");
}

async function fenceUncertainDeletionSlot(
  bucket: R2Bucket,
  key: string,
  stored: R2Object,
  token: string,
  wait: Wait,
) {
  for (let attempt = 0; attempt < MAX_R2_WRITE_ATTEMPTS; attempt += 1) {
    try {
      await bucket.put(
        key,
        fenceBody("slot", token, "account-deleting"),
        {
          customMetadata: { generation: token, state: "account-deleting" },
          onlyIf: { etagMatches: stored.etag },
        },
      );
      return;
    } catch (error) {
      if (!isR2WriteRateError(error)) return;
      let current: R2Object | null;
      try {
        current = await bucket.head(key);
      } catch {
        return;
      }
      if (!sameObject(current, stored)) return;
      if (attempt === MAX_R2_WRITE_ATTEMPTS - 1) return;
      try {
        await wait(retryDelay(attempt));
      } catch {
        return;
      }
    }
  }
}

function normalizeContentType(request: Request) {
  return request.headers
    .get("Content-Type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase() ?? "";
}

function validSignature(contentType: string, bytes: Uint8Array) {
  return MIME_SIGNATURES[contentType as keyof typeof MIME_SIGNATURES]?.(bytes) === true;
}

function safeRecordedAt(object: R2Object) {
  const metadataValue = object.customMetadata?.recordedAt;
  if (metadataValue && !Number.isNaN(Date.parse(metadataValue))) {
    return new Date(metadataValue).toISOString();
  }
  return Number.isNaN(object.uploaded.getTime()) ? null : object.uploaded.toISOString();
}

function emptyStatus(
  definition: DubDefinition,
  consentState: "not_granted" | "revoking",
) {
  return {
    complete: false,
    consentState,
    dubId: definition.id,
    guardianConsentVersion: CURRENT_DUB_CONSENT_VERSION,
    lines: definition.lines.map(({ id }) => ({ id, recordedAt: null, saved: false })),
    recordingEnabled: false,
  };
}

function isCurrentGrant(
  status: Awaited<ReturnType<ReturnType<typeof createDubConsentRepository>["status"]>>,
): status is Extract<typeof status, { state: "granted" }> {
  return status.state === "granted" &&
    status.consentVersion === CURRENT_DUB_CONSENT_VERSION;
}

function consentError(status: { state: string }): never {
  throw status.state === "revoking"
    ? new DubApiError(409, "dub_consent_revoking")
    : new DubApiError(403, "dubbing_not_enabled");
}

async function readConsentBody(request: Request) {
  let value: unknown;
  try {
    value = JSON.parse(await readBoundedText(request, MAX_CONSENT_BODY_BYTES));
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw new DubApiError(413, "payload_too_large");
    }
    throw new DubApiError(400, "invalid_request");
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new DubApiError(400, "invalid_request");
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).length !== 2 ||
    body.accepted !== true ||
    body.consentVersion !== CURRENT_DUB_CONSENT_VERSION
  ) {
    throw new DubApiError(400, "invalid_request");
  }
}

async function fenceRevokedConsentSlot(
  bucket: R2Bucket,
  key: string,
  stored: R2Object,
  consentGeneration: string,
  wait: Wait,
) {
  await conditionalPut(
    bucket,
    key,
    fenceBody("slot", consentGeneration, "consent-revoked"),
    {
      customMetadata: {
        guardianConsentGeneration: consentGeneration,
        state: "consent-revoked",
      },
    },
    stored,
    wait,
    (object) =>
      object.customMetadata?.guardianConsentGeneration === consentGeneration &&
      object.customMetadata?.state === "consent-revoked",
  );
}

export async function handleDubRequest(
  input: DubRequestInput,
  overrides: DubHandlerOverrides = {},
) {
  const createGeneration =
    overrides.createGeneration ?? (() => crypto.randomUUID());
  const createUploadNonce =
    overrides.createUploadNonce ?? (() => crypto.randomUUID());
  const isDeletionPending =
    overrides.isDeletionPending ?? isAccountDeletionPending;
  const learnerDeletionPending =
    overrides.isLearnerDeletionPending ??
    (overrides.isDeletionPending
      ? async () => false
      : isLearnerDeletionPending);
  const now = overrides.now ?? (() => new Date());
  const wait = overrides.wait ?? ((delay: number) => scheduler.wait(delay));
  const consentRepository = overrides.consentRepository ??
    createDubConsentRepository(input.database);
  const route = parseDubRoute(new URL(input.request.url).pathname);

  try {
    if (!route) throw new DubApiError(404, "not_found");
    const bucket = input.env.PERSONALIZED_STORY_ART_BUCKET;
    const userId = input.identity.userId;
    const definition = route.definition;
    const storage = createDubStorageKeys(input.identity, route.dubId);
    const deletionState = async () => ({
      account: await isDeletionPending(input.database, userId),
      learner: await learnerDeletionPending(
        input.database,
        input.identity.learnerProfileId,
      ),
    });
    const assertDeletionNotPending = async () => {
      const pending = await deletionState();
      if (pending.account) {
        throw new DubApiError(409, "account_deletion_pending");
      }
      if (pending.learner) {
        throw new DubApiError(409, "learner_deletion_pending");
      }
    };

    if (route.consent) {
      if (input.request.method !== "PUT") {
        throw new DubApiError(405, "method_not_allowed", undefined, {
          Allow: "PUT",
        });
      }
      await readConsentBody(input.request);
      await assertDeletionNotPending();
      try {
        await consentRepository.grant(input.identity);
      } catch (error) {
        if (error instanceof Error && error.message === "dub_consent_revoking") {
          throw new DubApiError(409, "dub_consent_revoking");
        }
        throw error;
      }
      await assertDeletionNotPending();
      return new Response(null, {
        headers: { "Cache-Control": "private, no-store" },
        status: 204,
      });
    }

    if (!route.lineId && !route.audio) {
      if (input.request.method === "GET") {
        await assertDeletionNotPending();
        const consent = await consentRepository.status(input.identity);
        if (!isCurrentGrant(consent)) {
          await assertDeletionNotPending();
          return json(emptyStatus(
            definition,
            consent.state === "revoking" ? "revoking" : "not_granted",
          ));
        }
        const generation = await readyGeneration(bucket, storage);
        const page = await bucket.list({
          include: ["customMetadata"],
          prefix: storage.objectPrefix,
        });
        const objects = new Map(
          page.objects.map((object) => [object.key, object]),
        );
        const lines = await Promise.all(definition.lines.map(async ({ id }) => {
          const object = objects.get(storage.objectKey(id));
          const audio = object &&
            audioStorage(object, generation, consent.grantGeneration);
          const current = object && audio
            ? await validateAudioPrefix(
                bucket,
                storage.objectKey(id),
                object,
                audio,
              )
            : null;
          const saved = current !== null;
          return {
            id,
            recordedAt: saved ? safeRecordedAt(current) : null,
            saved,
          };
        }));
        if (await readyGeneration(bucket, storage) !== generation) {
          throw new DubApiError(409, "dub_reset_in_progress");
        }
        if (!await consentRepository.requireCurrentGrant(
          input.identity,
          consent.grantGeneration,
        )) {
          const current = await consentRepository.status(input.identity);
          await assertDeletionNotPending();
          return json(emptyStatus(
            definition,
            current.state === "revoking" ? "revoking" : "not_granted",
          ));
        }
        await assertDeletionNotPending();
        return json({
          complete: lines.every(({ saved }) => saved),
          consentState: "granted",
          dubId: definition.id,
          guardianConsentVersion: CURRENT_DUB_CONSENT_VERSION,
          lines,
          recordingEnabled: true,
        });
      }

      if (input.request.method === "DELETE") {
        await assertDeletionNotPending();
        const resetTargets = DUB_DEFINITIONS.map((currentDefinition) => ({
          definition: currentDefinition,
          storage: createDubStorageKeys(input.identity, currentDefinition.id),
        }));
        const resetStates = await Promise.all(
          resetTargets.map(({ storage: targetStorage }) =>
            readMarker(bucket, targetStorage)
          ),
        );
        if (resetStates.some((marker) =>
          marker.kind === "valid" && marker.state === "account-deleting"
        )) {
          throw new DubApiError(409, "account_deletion_pending");
        }
        const revocation = await consentRepository.beginRevocation(input.identity);
        if (revocation.state === "not_granted") consentError(revocation);
        const consentGeneration = revocation.grantGeneration;
        const generation = createGeneration();
        if (!generation) throw new Error("Dub reset generation is required.");
        const deletingMarkers = await Promise.all(
          resetTargets.map(async (target) => ({
            deletingMarker: await beginReset(
              bucket,
              target.storage,
              generation,
              wait,
            ),
            ...target,
          })),
        );
        await assertDeletionNotPending();
        for (const target of deletingMarkers) {
          for (const { id } of target.definition.lines) {
            await tombstoneSlot(
              bucket,
              target.storage,
              id,
              generation,
              target.deletingMarker.etag,
              wait,
            );
          }
        }
        await assertDeletionNotPending();
        const duckReset = deletingMarkers.find(({ definition: currentDefinition }) =>
          currentDefinition.id === "five-little-ducks-v2"
        );
        if (!duckReset) throw new Error("Duck dub reset target is required.");
        await retireLegacyDub(
          bucket,
          duckReset.storage,
          generation,
          duckReset.deletingMarker.etag,
          wait,
        );
        await assertDeletionNotPending();
        await wait(R2_WRITE_INTERVAL_MS);
        for (const { deletingMarker, storage: targetStorage } of deletingMarkers) {
          const readyMarker = await conditionalPut(
            bucket,
            targetStorage.markerKey,
            fenceBody("marker", generation, "ready"),
            {
              customMetadata: { generation, state: "ready" },
            },
            deletingMarker,
            wait,
            (object) => hasState(object, generation, "ready"),
          );
          if (!readyMarker) {
            throw new DubApiError(409, "dub_reset_in_progress");
          }
        }
        await assertDeletionNotPending();
        await consentRepository.finishRevocation(
          input.identity,
          consentGeneration,
        );
        return new Response(null, {
          headers: { "Cache-Control": "private, no-store" },
          status: 204,
        });
      }

      throw new DubApiError(
        405,
        "method_not_allowed",
        undefined,
        { Allow: "GET, DELETE" },
      );
    }

    if (route.audio) {
      if (input.request.method !== "GET") {
        throw new DubApiError(
          405,
          "method_not_allowed",
          undefined,
          { Allow: "GET" },
        );
      }
      await assertDeletionNotPending();
      const consent = await consentRepository.status(input.identity);
      if (!isCurrentGrant(consent)) consentError(consent);
      const generation = await readyGeneration(bucket, storage);
      const key = storage.objectKey(route.lineId!);
      const head = await bucket.head(key);
      const payload = head
        ? await getAudioPayload(
            bucket,
            key,
            head,
            generation,
            consent.grantGeneration,
            input.request.headers.get("Range"),
          )
        : null;
      if (!payload) throw new DubApiError(404, "not_found");
      if (await readyGeneration(bucket, storage) !== generation) {
        throw new DubApiError(404, "not_found");
      }
      if (!await consentRepository.requireCurrentGrant(
        input.identity,
        consent.grantGeneration,
      )) {
        throw new DubApiError(403, "dubbing_not_enabled");
      }
      await assertDeletionNotPending();
      const headers = new Headers();
      payload.object.writeHttpMetadata(headers);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "private, no-store");
      headers.set(
        "Content-Length",
        String(payload.range?.length ?? payload.totalLength),
      );
      if (payload.range) {
        headers.set(
          "Content-Range",
          `bytes ${payload.range.start}-${payload.range.end}/${payload.totalLength}`,
        );
      }
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(payload.object.body, {
        headers,
        status: payload.range ? 206 : 200,
      });
    }

    if (input.request.method !== "PUT") {
      throw new DubApiError(
        405,
        "method_not_allowed",
        undefined,
        { Allow: "PUT" },
      );
    }
    await assertDeletionNotPending();
    const consent = await consentRepository.status(input.identity);
    if (!isCurrentGrant(consent)) consentError(consent);
    const ready = await readyGeneration(bucket, storage);
    const generation = ready ?? LEGACY_GENERATION;
    const contentType = normalizeContentType(input.request);
    let bytes: Uint8Array;
    try {
      bytes = await readBoundedBytes(input.request, MAX_CLIP_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        throw new DubApiError(413, "payload_too_large");
      }
      throw error;
    }
    if (bytes.byteLength === 0) throw new DubApiError(400, "audio_required");
    if (!validSignature(contentType, bytes)) {
      throw new DubApiError(415, "unsupported_audio");
    }

    const key = storage.objectKey(route.lineId!);
    const previous = await bucket.head(key);
    if (await readyGeneration(bucket, storage) !== ready) {
      throw new DubApiError(409, "dub_reset_in_progress");
    }
    if (!await consentRepository.requireCurrentGrant(
      input.identity,
      consent.grantGeneration,
    )) {
      throw new DubApiError(403, "dubbing_not_enabled");
    }
    const recordedAt = now();
    const uploadNonce = createUploadNonce();
    if (!uploadNonce) throw new Error("Dub upload nonce is required.");
    const encodedAudio = audioBody(generation, uploadNonce, bytes);
    const stored = await conditionalPut(
      bucket,
      key,
      encodedAudio.body,
      {
        httpMetadata: { contentType },
        customMetadata: {
          generation,
          guardianConsentGeneration: consent.grantGeneration,
          guardianConsentVersion: CURRENT_DUB_CONSENT_VERSION,
          lineId: route.lineId!,
          payloadOffset: String(encodedAudio.payloadOffset),
          recordedAt: recordedAt.toISOString(),
          state: "audio",
          uploadNonce,
        },
      },
      previous,
      wait,
    );
    if (!stored) throw new DubApiError(409, "dub_reset_in_progress");
    const throwIfDeletionPending = async () => {
      let pending: Awaited<ReturnType<typeof deletionState>>;
      try {
        pending = await deletionState();
      } catch (error) {
        try {
          const token = createGeneration();
          if (token) {
            await fenceUncertainDeletionSlot(bucket, key, stored, token, wait);
          }
        } catch {
          // Preserve the D1 failure after best-effort exact-write fencing.
        }
        throw error;
      }
      if (!pending.account && !pending.learner) return;
      const token = createGeneration();
      if (!token) throw new Error("Dub cleanup generation is required.");
      const state = pending.account ? "account-deleting" : "learner-deleting";
      await fenceDeletingSlot(bucket, key, stored, token, state, wait);
      throw new DubApiError(
        409,
        pending.account
          ? "account_deletion_pending"
          : "learner_deletion_pending",
      );
    };
    await throwIfDeletionPending();
    let consentChanged = false;
    try {
      consentChanged = !await consentRepository.requireCurrentGrant(
        input.identity,
        consent.grantGeneration,
      );
    } catch {
      consentChanged = true;
    }
    if (consentChanged) {
      await fenceRevokedConsentSlot(
        bucket,
        key,
        stored,
        consent.grantGeneration,
        wait,
      );
      throw new DubApiError(403, "dubbing_not_enabled");
    }
    let markerConflict: unknown;
    try {
      if (await readyGeneration(bucket, storage) !== ready) {
        markerConflict = new DubApiError(409, "dub_reset_in_progress");
      }
    } catch (error) {
      markerConflict = error;
    }
    if (markerConflict !== undefined) {
      await throwIfDeletionPending();
      throw markerConflict;
    }
    await throwIfDeletionPending();
    return json(
      { lineId: route.lineId, recordedAt: recordedAt.toISOString() },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DubApiError) {
      return json(
        { error: error.code, message: error.message },
        { headers: error.headers, status: error.status },
      );
    }
    throw error;
  }
}
