import { DUB_ID, DUB_LINES } from "../src/dubbing/dub-script.ts";
import { isAccountDeletionPending } from "./account-deletion.ts";
import type { Database } from "./database.ts";
import type { LearnerProfileIdentity } from "./learner-profile.ts";
import {
  readBoundedBytes,
  RequestBodyTooLargeError,
} from "./request-body.ts";

const CONSENT_VERSION = "guardian-voice-r2-v1";
const MAX_CLIP_BYTES = 512 * 1024;
const GENERATION_MARKER = ".dub-generation";
const LEGACY_GENERATION = "legacy";
const FENCE_FORMAT = "parrot-dub-fence-v1";
const AUDIO_FORMAT = "parrot-dub-audio-v1";
const R2_WRITE_INTERVAL_MS = 1_050;
const MAX_R2_WRITE_ATTEMPTS = 3;
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
  createGeneration?: () => string;
  isDeletionPending?: typeof isAccountDeletionPending;
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
      state: "deleting" | "ready";
    };

type AudioStorage =
  | { kind: "legacy" }
  | { generation: string; kind: "enveloped"; prefix: Uint8Array };

class DubApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message = code) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function json(payload: unknown, init: ResponseInit = {}) {
  return Response.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...init.headers },
  });
}

function parseDubRoute(pathname: string) {
  const match = /^\/api\/dubs\/([^/]+)(?:\/lines\/([^/]+)(?:\/(audio))?)?$/.exec(
    pathname,
  );
  if (!match) return null;
  try {
    const dubId = decodeURIComponent(match[1]);
    const lineId = match[2] ? decodeURIComponent(match[2]) : null;
    if (
      dubId !== DUB_ID ||
      (lineId && !DUB_LINES.some((line) => line.id === lineId))
    ) {
      return null;
    }
    return { audio: match[3] === "audio", dubId, lineId };
  } catch {
    return null;
  }
}

function objectPrefix(userId: string) {
  // ponytail: shared private bucket; split when voice and art retention policies differ.
  return `personalized-story-art/${encodeURIComponent(userId)}/learner-dubs/${DUB_ID}/`;
}

function objectKey(userId: string, lineId: string) {
  return `${objectPrefix(userId)}${lineId}.audio`;
}

function markerKey(userId: string) {
  return `${objectPrefix(userId)}${GENERATION_MARKER}`;
}

async function readMarker(bucket: R2Bucket, userId: string): Promise<DubMarker> {
  const marker = await bucket.head(markerKey(userId));
  if (!marker) return { kind: "absent" };
  const generation = marker.customMetadata?.generation;
  const state = marker.customMetadata?.state;
  if (
    !generation ||
    (state !== "deleting" && state !== "ready")
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

async function readyGeneration(bucket: R2Bucket, userId: string) {
  const marker = await readMarker(bucket, userId);
  if (marker.kind === "absent") return null;
  if (marker.kind !== "valid" || marker.state !== "ready") {
    throw new DubApiError(409, "dub_reset_in_progress");
  }
  return marker.generation;
}

async function beginReset(
  bucket: R2Bucket,
  userId: string,
  generation: string,
  wait: Wait,
) {
  const current = await readMarker(bucket, userId);
  const marker = await conditionalPut(
    bucket,
    markerKey(userId),
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

function fenceBody(kind: "marker" | "slot", generation: string, state: string) {
  return encoded([FENCE_FORMAT, kind, generation, state]);
}

function audioPrefix(generation: string) {
  return encoded([AUDIO_FORMAT, generation]);
}

function audioBody(generation: string, audio: Uint8Array) {
  const prefix = audioPrefix(generation);
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

function hasState(object: R2Object, generation: string, state: string) {
  const metadata = object.customMetadata;
  return metadata?.generation === generation && metadata.state === state;
}

function isR2WriteRateError(error: unknown) {
  return error instanceof Error && /\(10058\)\s*$/.test(error.message);
}

function retryDelay(attempt: number) {
  return R2_WRITE_INTERVAL_MS + attempt * 100 + Math.floor(Math.random() * 100);
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
): AudioStorage | null {
  const metadata = object.customMetadata;
  if (
    ready === null &&
    metadata?.generation === undefined &&
    metadata?.state === undefined &&
    metadata?.payloadOffset === undefined
  ) {
    return object.size > 0 ? { kind: "legacy" } : null;
  }

  const generation = ready ?? LEGACY_GENERATION;
  const prefix = audioPrefix(generation);
  if (
    metadata?.generation !== generation ||
    metadata.state !== "audio" ||
    metadata.payloadOffset !== String(prefix.byteLength) ||
    object.size <= prefix.byteLength
  ) {
    return null;
  }
  return { generation, kind: "enveloped", prefix };
}

function hasBody(object: R2Object | R2ObjectBody | null): object is R2ObjectBody {
  return object !== null && "body" in object;
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index]);
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
      String(storage.prefix.byteLength)
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
) {
  const storage = audioStorage(object, ready);
  if (!storage) return null;
  if (storage.kind === "legacy") {
    const legacy = await bucket.get(key, {
      onlyIf: { etagMatches: object.etag },
    });
    return hasBody(legacy) && audioStorage(legacy, ready)?.kind === "legacy"
      ? legacy
      : null;
  }
  if (!await validateAudioPrefix(bucket, key, object, storage)) return null;
  const payload = await bucket.get(key, {
    onlyIf: { etagMatches: object.etag },
    range: { offset: storage.prefix.byteLength },
  });
  if (
    !hasBody(payload) ||
    !hasState(payload, storage.generation, "audio") ||
    payload.customMetadata?.payloadOffset !==
      String(storage.prefix.byteLength)
  ) {
    return null;
  }
  return payload;
}

async function assertResetOwner(
  bucket: R2Bucket,
  userId: string,
  generation: string,
  etag: string,
) {
  const marker = await readMarker(bucket, userId);
  if (
    marker.kind !== "valid" ||
    marker.state !== "deleting" ||
    marker.generation !== generation ||
    marker.etag !== etag
  ) {
    throw new DubApiError(409, "dub_reset_in_progress");
  }
}

async function tombstoneSlot(
  bucket: R2Bucket,
  userId: string,
  lineId: string,
  generation: string,
  markerEtag: string,
  wait: Wait,
) {
  const key = objectKey(userId, lineId);
  for (let attempt = 0; attempt < MAX_CAS_CONFLICTS; attempt += 1) {
    await assertResetOwner(bucket, userId, generation, markerEtag);
    const current = await bucket.head(key);
    await assertResetOwner(bucket, userId, generation, markerEtag);
    const tombstone = await conditionalPut(
      bucket,
      key,
      fenceBody("slot", generation, "tombstone"),
      {
        customMetadata: { generation, state: "tombstone" },
      },
      current,
      wait,
      (object) => hasState(object, generation, "tombstone"),
    );
    if (tombstone) return;
  }
  throw new DubApiError(409, "dub_reset_in_progress");
}

function isDemonstrablyNonAudio(object: R2Object) {
  const state = object.customMetadata?.state;
  return state !== undefined && state !== "audio";
}

async function fenceAccountDeletingSlot(
  bucket: R2Bucket,
  key: string,
  stored: R2Object,
  token: string,
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
        fenceBody("slot", token, "account-deleting"),
        { customMetadata: { generation: token, state: "account-deleting" } },
        current,
        wait,
        (object) => hasState(object, token, "account-deleting"),
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

export async function handleDubRequest(
  input: DubRequestInput,
  overrides: DubHandlerOverrides = {},
) {
  const createGeneration =
    overrides.createGeneration ?? (() => crypto.randomUUID());
  const isDeletionPending =
    overrides.isDeletionPending ?? isAccountDeletionPending;
  const now = overrides.now ?? (() => new Date());
  const wait = overrides.wait ?? ((delay: number) => scheduler.wait(delay));
  const route = parseDubRoute(new URL(input.request.url).pathname);

  try {
    if (!route) throw new DubApiError(404, "not_found");
    const bucket = input.env.PERSONALIZED_STORY_ART_BUCKET;
    const userId = input.identity.userId;

    if (!route.lineId && !route.audio) {
      if (input.request.method === "GET") {
        const generation = await readyGeneration(bucket, userId);
        const prefix = objectPrefix(userId);
        const page = await bucket.list({
          include: ["customMetadata"],
          prefix,
        });
        const objects = new Map(
          page.objects.map((object) => [object.key, object]),
        );
        const lines = await Promise.all(DUB_LINES.map(async ({ id }) => {
          const object = objects.get(objectKey(userId, id));
          const storage = object && audioStorage(object, generation);
          const current = object && storage
            ? await validateAudioPrefix(
                bucket,
                objectKey(userId, id),
                object,
                storage,
              )
            : null;
          const saved = current !== null;
          return {
            id,
            recordedAt: saved ? safeRecordedAt(current) : null,
            saved,
          };
        }));
        if (await readyGeneration(bucket, userId) !== generation) {
          throw new DubApiError(409, "dub_reset_in_progress");
        }
        return json({
          complete: lines.every(({ saved }) => saved),
          dubId: DUB_ID,
          guardianConsentVersion: CONSENT_VERSION,
          lines,
        });
      }

      if (input.request.method === "DELETE") {
        if (await isDeletionPending(input.database, userId)) {
          throw new DubApiError(409, "account_deletion_pending");
        }
        const generation = createGeneration();
        if (!generation) throw new Error("Dub reset generation is required.");
        const deletingMarker = await beginReset(
          bucket,
          userId,
          generation,
          wait,
        );
        if (await isDeletionPending(input.database, userId)) {
          throw new DubApiError(409, "account_deletion_pending");
        }
        for (const { id } of DUB_LINES) {
          await tombstoneSlot(
            bucket,
            userId,
            id,
            generation,
            deletingMarker.etag,
            wait,
          );
        }
        if (await isDeletionPending(input.database, userId)) {
          throw new DubApiError(409, "account_deletion_pending");
        }
        await wait(R2_WRITE_INTERVAL_MS);
        const readyMarker = await conditionalPut(
          bucket,
          markerKey(userId),
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
        if (await isDeletionPending(input.database, userId)) {
          throw new DubApiError(409, "account_deletion_pending");
        }
        return new Response(null, {
          headers: { "Cache-Control": "private, no-store" },
          status: 204,
        });
      }

      throw new DubApiError(405, "method_not_allowed");
    }

    if (route.audio) {
      if (input.request.method !== "GET") {
        throw new DubApiError(405, "method_not_allowed");
      }
      const generation = await readyGeneration(bucket, userId);
      const key = objectKey(userId, route.lineId!);
      const head = await bucket.head(key);
      const object = head
        ? await getAudioPayload(bucket, key, head, generation)
        : null;
      if (!object) throw new DubApiError(404, "not_found");
      if (await readyGeneration(bucket, userId) !== generation) {
        throw new DubApiError(404, "not_found");
      }
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(object.body, { headers });
    }

    if (input.request.method !== "PUT") {
      throw new DubApiError(405, "method_not_allowed");
    }
    if (await isDeletionPending(input.database, userId)) {
      throw new DubApiError(409, "account_deletion_pending");
    }
    const ready = await readyGeneration(bucket, userId);
    const generation = ready ?? LEGACY_GENERATION;
    if (
      input.request.headers.get("X-Parrot-Guardian-Consent-Version") !==
      CONSENT_VERSION
    ) {
      throw new DubApiError(400, "guardian_consent_required");
    }
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

    const key = objectKey(userId, route.lineId!);
    const previous = await bucket.head(key);
    if (await readyGeneration(bucket, userId) !== ready) {
      throw new DubApiError(409, "dub_reset_in_progress");
    }
    const recordedAt = now();
    const encodedAudio = audioBody(generation, bytes);
    const stored = await conditionalPut(
      bucket,
      key,
      encodedAudio.body,
      {
        httpMetadata: { contentType },
        customMetadata: {
          generation,
          guardianConsentVersion: CONSENT_VERSION,
          lineId: route.lineId!,
          payloadOffset: String(encodedAudio.payloadOffset),
          recordedAt: recordedAt.toISOString(),
          state: "audio",
        },
      },
      previous,
      wait,
    );
    if (!stored) throw new DubApiError(409, "dub_reset_in_progress");
    if (await readyGeneration(bucket, userId) !== ready) {
      throw new DubApiError(409, "dub_reset_in_progress");
    }
    if (await isDeletionPending(input.database, userId)) {
      const token = createGeneration();
      if (!token) throw new Error("Dub cleanup generation is required.");
      await fenceAccountDeletingSlot(bucket, key, stored, token, wait);
      throw new DubApiError(409, "account_deletion_pending");
    }
    return json(
      { lineId: route.lineId, recordedAt: recordedAt.toISOString() },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DubApiError) {
      return json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
}
