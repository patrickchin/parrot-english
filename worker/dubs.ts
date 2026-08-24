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
};

type DubMarker =
  | { kind: "absent" }
  | { etag: string; kind: "malformed" }
  | {
      etag: string;
      generation: string;
      kind: "valid";
      state: "deleting" | "ready";
    };

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
    return { etag: marker.etag, kind: "malformed" };
  }
  return { etag: marker.etag, generation, kind: "valid", state };
}

async function readyGeneration(bucket: R2Bucket, userId: string) {
  const marker = await readMarker(bucket, userId);
  if (marker.kind === "absent") return LEGACY_GENERATION;
  if (marker.kind !== "valid" || marker.state !== "ready") {
    throw new DubApiError(409, "dub_reset_in_progress");
  }
  return marker.generation;
}

async function beginReset(
  bucket: R2Bucket,
  userId: string,
  generation: string,
) {
  const current = await readMarker(bucket, userId);
  const marker = await bucket.put(
    markerKey(userId),
    fenceBody("marker", generation, "deleting"),
    {
      customMetadata: { generation, state: "deleting" },
      onlyIf: current.kind === "absent"
        ? { etagDoesNotMatch: "*" }
        : { etagMatches: current.etag },
    },
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

function audioBody(generation: string, audio: Uint8Array) {
  const prefix = encoded([AUDIO_FORMAT, generation]);
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

function isCurrentAudio(object: R2Object, generation: string) {
  const metadata = object.customMetadata;
  if (generation === LEGACY_GENERATION) {
    return (
      (metadata?.generation === LEGACY_GENERATION && metadata.state === "audio") ||
      (metadata?.generation === undefined && metadata?.state === undefined)
    );
  }
  return metadata?.generation === generation && metadata.state === "audio";
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
) {
  const key = objectKey(userId, lineId);
  while (true) {
    await assertResetOwner(bucket, userId, generation, markerEtag);
    const current = await bucket.head(key);
    await assertResetOwner(bucket, userId, generation, markerEtag);
    const tombstone = await bucket.put(
      key,
      fenceBody("slot", generation, "tombstone"),
      {
        customMetadata: { generation, state: "tombstone" },
        onlyIf: conditionalWrite(current),
      },
    );
    if (tombstone) return;
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

function payloadOffset(object: R2Object) {
  const value = object.customMetadata?.payloadOffset;
  if (value === undefined) return 0;
  if (!/^[1-9]\d*$/.test(value)) return null;
  const offset = Number(value);
  return Number.isSafeInteger(offset) && offset < object.size ? offset : null;
}

function streamAfter(body: ReadableStream, offset: number) {
  if (offset === 0) return body;
  let remaining = offset;
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (remaining >= chunk.byteLength) {
        remaining -= chunk.byteLength;
        return;
      }
      controller.enqueue(chunk.subarray(remaining));
      remaining = 0;
    },
  }));
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
        const lines = DUB_LINES.map(({ id }) => {
          const object = objects.get(objectKey(userId, id));
          const saved = object !== undefined && isCurrentAudio(object, generation);
          return {
            id,
            recordedAt: saved ? safeRecordedAt(object) : null,
            saved,
          };
        });
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
        const deletingMarker = await beginReset(bucket, userId, generation);
        if (await isDeletionPending(input.database, userId)) {
          await bucket.delete(markerKey(userId));
          throw new DubApiError(409, "account_deletion_pending");
        }
        for (const { id } of DUB_LINES) {
          await tombstoneSlot(
            bucket,
            userId,
            id,
            generation,
            deletingMarker.etag,
          );
        }
        if (await isDeletionPending(input.database, userId)) {
          await bucket.delete(markerKey(userId));
          throw new DubApiError(409, "account_deletion_pending");
        }
        const readyMarker = await bucket.put(
          markerKey(userId),
          fenceBody("marker", generation, "ready"),
          {
            customMetadata: { generation, state: "ready" },
            onlyIf: { etagMatches: deletingMarker.etag },
          },
        );
        if (!readyMarker) {
          throw new DubApiError(409, "dub_reset_in_progress");
        }
        if (await isDeletionPending(input.database, userId)) {
          await bucket.delete(markerKey(userId));
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
      const object = await bucket.get(objectKey(userId, route.lineId!));
      if (!object || !isCurrentAudio(object, generation)) {
        throw new DubApiError(404, "not_found");
      }
      const offset = payloadOffset(object);
      if (offset === null) throw new DubApiError(404, "not_found");
      if (await readyGeneration(bucket, userId) !== generation) {
        throw new DubApiError(404, "not_found");
      }
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(streamAfter(object.body, offset), { headers });
    }

    if (input.request.method !== "PUT") {
      throw new DubApiError(405, "method_not_allowed");
    }
    if (await isDeletionPending(input.database, userId)) {
      throw new DubApiError(409, "account_deletion_pending");
    }
    const generation = await readyGeneration(bucket, userId);
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
    if (await readyGeneration(bucket, userId) !== generation) {
      throw new DubApiError(409, "dub_reset_in_progress");
    }
    const recordedAt = now();
    const encodedAudio = audioBody(generation, bytes);
    const stored = await bucket.put(key, encodedAudio.body, {
      httpMetadata: { contentType },
      customMetadata: {
        generation,
        guardianConsentVersion: CONSENT_VERSION,
        lineId: route.lineId!,
        payloadOffset: String(encodedAudio.payloadOffset),
        recordedAt: recordedAt.toISOString(),
        state: "audio",
      },
      onlyIf: conditionalWrite(previous),
    });
    if (!stored) throw new DubApiError(409, "dub_reset_in_progress");
    if (await readyGeneration(bucket, userId) !== generation) {
      throw new DubApiError(409, "dub_reset_in_progress");
    }
    if (await isDeletionPending(input.database, userId)) {
      await bucket.delete(key);
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
