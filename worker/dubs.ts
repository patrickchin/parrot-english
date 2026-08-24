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
  isDeletionPending?: typeof isAccountDeletionPending;
  now?: () => Date;
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
          return {
            id,
            recordedAt: object ? safeRecordedAt(object) : null,
            saved: object !== undefined,
          };
        });
        return json({
          complete: lines.every(({ saved }) => saved),
          dubId: DUB_ID,
          guardianConsentVersion: CONSENT_VERSION,
          lines,
        });
      }

      if (input.request.method === "DELETE") {
        await bucket.delete(
          DUB_LINES.map(({ id }) => objectKey(userId, id)),
        );
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
      const object = await bucket.get(objectKey(userId, route.lineId!));
      if (!object) throw new DubApiError(404, "not_found");
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
    const recordedAt = now();
    await bucket.put(key, bytes, {
      httpMetadata: { contentType },
      customMetadata: {
        guardianConsentVersion: CONSENT_VERSION,
        lineId: route.lineId!,
        recordedAt: recordedAt.toISOString(),
      },
    });
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
