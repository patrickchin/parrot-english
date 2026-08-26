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
  putLessonRecordingAudio,
  reserveLessonRecordingUpload,
  type LessonRecordingSlot,
} from "./lesson-recording-storage.ts";
import {
  readBoundedBytes,
  RequestBodyTooLargeError,
} from "./request-body.ts";

const MAX_CLIP_BYTES = 512 * 1024;
const MAX_TARGET_TEXT_BYTES = 4096;
const MAX_EXPECTED_LEARNER_PROFILE_BYTES = 128;
const EXPECTED_LEARNER_PROFILE_HEADER =
  "X-Parrot-Expected-Learner-Profile";
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
  wait?: (delay: number) => Promise<void>;
};

const MAX_WRITE_CONFLICTS = 16;

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
  const wait = overrides.wait ?? ((delay: number) => scheduler.wait(delay));
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
      const consent = await repository.readLessonRecordingConsentState(
        input.identity,
      );
      return json({
        cleanupPending: consent.cleanupBeforeGeneration !== null,
        enabled: consent.enabled,
      });
    }
    if (input.request.method !== "PUT") {
      throw new LessonRecordingApiError(405, "method_not_allowed", {
        Allow: "PUT",
      });
    }
    const expectedLearnerProfileId = input.request.headers.get(
      EXPECTED_LEARNER_PROFILE_HEADER,
    );
    if (
      expectedLearnerProfileId !== input.identity.learnerProfileId ||
      new TextEncoder().encode(expectedLearnerProfileId ?? "").byteLength >
        MAX_EXPECTED_LEARNER_PROFILE_BYTES
    ) {
      throw new LessonRecordingApiError(409, "learner_selection_changed");
    }

    const accessState = async () => ({
      consent: await repository.readLessonRecordingConsentState(
        input.identity,
      ),
      deletion: await isDeletionPending(input.database, input.identity.userId),
    });
    const requireAccess = (
      state: Awaited<ReturnType<typeof accessState>>,
      consentGeneration?: number,
    ) => {
      if (state.deletion) {
        throw new LessonRecordingApiError(409, "account_deletion_pending");
      }
      if (
        !state.consent.enabled ||
        (consentGeneration !== undefined &&
          state.consent.generation !== consentGeneration)
      ) {
        throw new LessonRecordingApiError(403, "guardian_consent_required");
      }
    };
    const initialAccess = await accessState();
    requireAccess(initialAccess);
    const consentGeneration = initialAccess.consent.generation;

    const target = await resolveLessonRecordingTarget(
      input.database,
      input.identity,
      route,
    );
    if (!target) throw new LessonRecordingApiError(404, "not_found");
    const lessonGeneration = target.lessonGeneration;
    if (
      route.source === "my" &&
      input.request.headers.get("X-Parrot-Lesson-Revision") !== target.revision
    ) {
      throw new LessonRecordingApiError(409, "lesson_changed");
    }
    if (
      new TextEncoder().encode(target.targetText).byteLength >
      MAX_TARGET_TEXT_BYTES
    ) {
      throw new LessonRecordingApiError(422, "target_too_large");
    }

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
    const key = lessonRecordingObjectKey(input.identity, route);
    const encoded = lessonRecordingAudioBody(bytes, uploadNonce);
    const bucket = input.env.PERSONALIZED_STORY_ART_BUCKET;
    const putOptions: R2PutOptions = {
      customMetadata: {
        consentGeneration: String(consentGeneration),
        consentVersion: LESSON_RECORDING_CONSENT_VERSION,
        lessonId: route.lessonId,
        ...(lessonGeneration === null
          ? {}
          : { lessonGeneration: String(lessonGeneration) }),
        ...(target.revision === null
          ? {}
          : { lessonRevision: target.revision }),
        payloadOffset: String(encoded.payloadOffset),
        recordedAt,
        sceneIndex: String(route.sceneIndex),
        source: route.source,
        state: "audio",
        stepIndex: String(route.stepIndex),
        targetText: target.targetText,
        uploadNonce,
      },
      httpMetadata: {
        cacheControl: "private, no-store",
        contentType: normalizedContentType,
      },
    };
    let stored: R2Object | null = null;
    for (let conflict = 0; conflict < MAX_WRITE_CONFLICTS; conflict += 1) {
      const observed = await reserveLessonRecordingUpload(
        bucket,
        key,
        uploadNonce,
        { consentGeneration, lessonGeneration },
        wait,
      );
      requireAccess(await accessState(), consentGeneration);
      if (route.source === "my") {
        const currentTarget = await resolveLessonRecordingTarget(
          input.database,
          input.identity,
          route,
        );
        if (
          !currentTarget ||
          currentTarget.revision !== target.revision ||
          currentTarget.lessonGeneration !== lessonGeneration
        ) {
          throw new LessonRecordingApiError(409, "lesson_changed");
        }
      }
      stored = await putLessonRecordingAudio(
        bucket,
        key,
        encoded.body,
        putOptions,
        observed,
        wait,
      );
      if (stored) break;
      requireAccess(await accessState(), consentGeneration);
      if (route.source === "my") {
        const currentTarget = await resolveLessonRecordingTarget(
          input.database,
          input.identity,
          route,
        );
        if (
          !currentTarget ||
          currentTarget.revision !== target.revision ||
          currentTarget.lessonGeneration !== lessonGeneration
        ) {
          throw new LessonRecordingApiError(409, "lesson_changed");
        }
      }
    }
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
        wait,
      );
      throw error;
    }
    if (
      after.deletion ||
      !after.consent.enabled ||
      after.consent.generation !== consentGeneration
    ) {
      await fenceLessonRecordingUpload(
        bucket,
        key,
        stored,
        uploadNonce,
        after.deletion ? "account-deleting" : "consent-revoked",
        wait,
      );
      requireAccess(after, consentGeneration);
    }
    if (route.source === "my") {
      let currentTarget: Awaited<ReturnType<typeof resolveLessonRecordingTarget>>;
      try {
        currentTarget = await resolveLessonRecordingTarget(
          input.database,
          input.identity,
          route,
        );
      } catch (error) {
        await fenceLessonRecordingUpload(
          bucket,
          key,
          stored,
          uploadNonce,
          "state-unknown",
          wait,
        );
        throw error;
      }
      if (
        !currentTarget ||
        currentTarget.revision !== target.revision ||
        currentTarget.lessonGeneration !== lessonGeneration
      ) {
        await fenceLessonRecordingUpload(
          bucket,
          key,
          stored,
          uploadNonce,
          "lesson-changed",
          wait,
        );
        throw new LessonRecordingApiError(409, "lesson_changed");
      }
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
