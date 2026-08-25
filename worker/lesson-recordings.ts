import { LESSON_RECORDING_CONSENT_VERSION } from "../lib/lesson-recording-consent.js";
import { isSafeRouteId } from "../lib/route-id.ts";
import { isAccountDeletionPending } from "./account-deletion.ts";
import type { Database } from "./database.ts";
import type { LearnerProfileIdentity } from "./learner-profile.ts";
import { createLearnerProfileRepository } from "./learner-profile-repository.ts";
import { resolveLessonRecordingTarget } from "./lesson-recording-catalog.ts";
import {
  fenceLessonRecordingUpload,
  lessonRecordingAudioBody,
  lessonRecordingObjectKey,
  type LessonRecordingSlot,
} from "./lesson-recording-storage.ts";
import {
  readBoundedBytes,
  RequestBodyTooLargeError,
} from "./request-body.ts";

const MAX_CLIP_BYTES = 512 * 1024;
const MIME_SIGNATURES = {
  "audio/mp4": (bytes: Uint8Array) =>
    bytes.length >= 8 &&
    new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp",
  "audio/ogg": (bytes: Uint8Array) =>
    new TextDecoder().decode(bytes.slice(0, 4)) === "OggS",
  "audio/webm": (bytes: Uint8Array) =>
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3,
} as const;

export interface LessonRecordingEnv {
  DB: D1Database;
  PERSONALIZED_STORY_ART_BUCKET: R2Bucket;
}

export interface LessonRecordingRequestInput {
  database: Database;
  env: LessonRecordingEnv;
  identity: LearnerProfileIdentity;
  request: Request;
}

type HandlerOverrides = {
  createUploadNonce?: () => string;
  isDeletionPending?: typeof isAccountDeletionPending;
  now?: () => Date;
};

class LessonRecordingApiError extends Error {
  readonly code: string;
  readonly headers?: HeadersInit;
  readonly status: number;

  constructor(status: number, code: string, headers?: HeadersInit) {
    super(code);
    this.code = code;
    this.headers = headers;
    this.status = status;
  }
}

function json(payload: unknown, init: ResponseInit = {}) {
  return Response.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init.headers ?? {}),
    },
  });
}

function parseIndex(value: string) {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const index = Number(value);
  return Number.isSafeInteger(index) ? index : null;
}

function parseRoute(pathname: string): "consent" | LessonRecordingSlot | null {
  if (pathname === "/api/lesson-recordings/consent") return "consent";
  const match =
    /^\/api\/lesson-recordings\/([^/]+)\/([^/]+)\/scenes\/([^/]+)\/steps\/([^/]+)$/.exec(
      pathname,
    );
  if (!match || (match[1] !== "parrot" && match[1] !== "my")) return null;
  try {
    const lessonId = decodeURIComponent(match[2]);
    const sceneIndex = parseIndex(match[3]);
    const stepIndex = parseIndex(match[4]);
    if (!isSafeRouteId(lessonId) || sceneIndex === null || stepIndex === null) {
      return null;
    }
    return { lessonId, sceneIndex, source: match[1], stepIndex };
  } catch {
    return null;
  }
}

function contentType(request: Request) {
  return request.headers
    .get("Content-Type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase() ?? "";
}

function validSignature(type: string, bytes: Uint8Array) {
  return MIME_SIGNATURES[type as keyof typeof MIME_SIGNATURES]?.(bytes) === true;
}

export async function handleLessonRecordingRequest(
  input: LessonRecordingRequestInput,
  overrides: HandlerOverrides = {},
) {
  const createUploadNonce =
    overrides.createUploadNonce ?? (() => crypto.randomUUID());
  const isDeletionPending =
    overrides.isDeletionPending ?? isAccountDeletionPending;
  const now = overrides.now ?? (() => new Date());
  const route = parseRoute(new URL(input.request.url).pathname);

  try {
    if (!route) throw new LessonRecordingApiError(404, "not_found");
    const repository = createLearnerProfileRepository(input.database);
    if (route === "consent") {
      if (input.request.method !== "GET") {
        throw new LessonRecordingApiError(405, "method_not_allowed", {
          Allow: "GET",
        });
      }
      return json({
        enabled: await repository.readLessonRecordingConsent(
          input.identity.userId,
        ),
      });
    }
    if (input.request.method !== "PUT") {
      throw new LessonRecordingApiError(405, "method_not_allowed", {
        Allow: "PUT",
      });
    }

    const accessState = async () => ({
      consent: await repository.readLessonRecordingConsent(input.identity.userId),
      deletion: await isDeletionPending(input.database, input.identity.userId),
    });
    const requireAccess = (state: Awaited<ReturnType<typeof accessState>>) => {
      if (state.deletion) {
        throw new LessonRecordingApiError(409, "account_deletion_pending");
      }
      if (!state.consent) {
        throw new LessonRecordingApiError(403, "guardian_consent_required");
      }
    };
    requireAccess(await accessState());

    const targetText = await resolveLessonRecordingTarget(
      input.database,
      input.identity.userId,
      route,
    );
    if (!targetText) throw new LessonRecordingApiError(404, "not_found");

    const normalizedContentType = contentType(input.request);
    let bytes: Uint8Array;
    try {
      bytes = await readBoundedBytes(input.request, MAX_CLIP_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        throw new LessonRecordingApiError(413, "payload_too_large");
      }
      throw error;
    }
    if (bytes.byteLength === 0) {
      throw new LessonRecordingApiError(400, "audio_required");
    }
    if (!validSignature(normalizedContentType, bytes)) {
      throw new LessonRecordingApiError(415, "unsupported_audio");
    }

    const uploadNonce = createUploadNonce();
    if (!uploadNonce || uploadNonce.length > 128) {
      throw new Error("Lesson recording upload nonce is invalid.");
    }
    const recordedAt = now().toISOString();
    const key = lessonRecordingObjectKey(input.identity.userId, route);
    const encoded = lessonRecordingAudioBody(bytes, uploadNonce);
    const bucket = input.env.PERSONALIZED_STORY_ART_BUCKET;
    const stored = await bucket.put(key, encoded.body, {
      customMetadata: {
        consentVersion: LESSON_RECORDING_CONSENT_VERSION,
        lessonId: route.lessonId,
        payloadOffset: String(encoded.payloadOffset),
        recordedAt,
        sceneIndex: String(route.sceneIndex),
        source: route.source,
        state: "audio",
        stepIndex: String(route.stepIndex),
        targetText,
        uploadNonce,
      },
      httpMetadata: {
        cacheControl: "private, no-store",
        contentType: normalizedContentType,
      },
    });
    if (!stored) throw new Error("Lesson recording could not be stored.");

    let after: Awaited<ReturnType<typeof accessState>>;
    try {
      after = await accessState();
    } catch (error) {
      await fenceLessonRecordingUpload(
        bucket,
        key,
        stored,
        uploadNonce,
        "state-unknown",
      );
      throw error;
    }
    if (after.deletion || !after.consent) {
      await fenceLessonRecordingUpload(
        bucket,
        key,
        stored,
        uploadNonce,
        after.deletion ? "account-deleting" : "consent-revoked",
      );
      requireAccess(after);
    }
    return json({ recordedAt }, { status: 201 });
  } catch (error) {
    if (error instanceof LessonRecordingApiError) {
      return json(
        { error: error.code },
        { headers: error.headers, status: error.status },
      );
    }
    return json({ error: "internal_error" }, { status: 500 });
  }
}
