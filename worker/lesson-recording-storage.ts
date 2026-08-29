import {
  isR2WriteRateError,
  MAX_R2_WRITE_ATTEMPTS,
  retryDelay,
} from "./dub-storage.ts";
import type { LearnerIdentity } from "./request-identity.ts";

type LessonRecordingBucket = Pick<R2Bucket, "head" | "list" | "put">;
type LessonRecordingWriteBucket = Pick<R2Bucket, "head" | "put">;
type Wait = (delay: number) => Promise<void>;

const AUDIO_FORMAT = "parrot-lesson-recording-audio-v1";
const FENCE_FORMAT = "parrot-lesson-recording-fence-v1";
const PURGE_FORMAT = "parrot-lesson-recording-purge-v1";
const MAX_WRITE_CONFLICTS = 16;

async function retryRateLimited<T>(operation: () => Promise<T>, wait: Wait) {
  for (let attempt = 0; attempt < MAX_R2_WRITE_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (
        !isR2WriteRateError(error) ||
        attempt === MAX_R2_WRITE_ATTEMPTS - 1
      ) {
        throw error;
      }
      await wait(retryDelay(attempt));
    }
  }
  throw new Error("R2 retry limit exceeded.");
}

export type LessonRecordingSlot = {
  lessonId: string;
  sceneIndex: number;
  source: "my" | "parrot";
  stepIndex: number;
};

export type LessonRecordingOwner = Pick<
  LearnerIdentity,
  "learnerProfileId" | "legacyStorageOwner" | "userId"
>;

export function lessonRecordingOwnerPrefix(identity: LessonRecordingOwner) {
  const accountPrefix = `personalized-story-art/${encodeURIComponent(identity.userId)}/`;
  return identity.legacyStorageOwner
    ? `${accountPrefix}lesson-recordings/`
    : `${accountPrefix}learners/${encodeURIComponent(identity.learnerProfileId)}/lesson-recordings/`;
}

export function lessonRecordingObjectKey(
  identity: LessonRecordingOwner,
  slot: LessonRecordingSlot,
) {
  return `${lessonRecordingOwnerPrefix(identity)}${slot.source}/${encodeURIComponent(slot.lessonId)}/scene-${slot.sceneIndex}/step-${slot.stepIndex}.audio`;
}

export function lessonRecordingAudioBody(
  audio: Uint8Array,
  uploadNonce: string,
) {
  const prefix = new TextEncoder().encode(
    JSON.stringify([AUDIO_FORMAT, uploadNonce]),
  );
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

export async function reserveLessonRecordingUpload(
  bucket: LessonRecordingWriteBucket,
  key: string,
  uploadNonce: string,
  generations: {
    consentGeneration: number;
    lessonGeneration: number | null;
  },
  wait: Wait,
) {
  for (let conflict = 0; conflict < MAX_WRITE_CONFLICTS; conflict += 1) {
    const current = await retryRateLimited(() => bucket.head(key), wait);
    if (current) return current;
    for (let attempt = 0; attempt < MAX_R2_WRITE_ATTEMPTS; attempt += 1) {
      try {
        const reserved = await bucket.put(
          key,
          new TextEncoder().encode(
            JSON.stringify([FENCE_FORMAT, uploadNonce, "uploading"]),
          ),
          {
            customMetadata: {
              consentGeneration: String(generations.consentGeneration),
              ...(generations.lessonGeneration === null
                ? {}
                : { lessonGeneration: String(generations.lessonGeneration) }),
              state: "uploading",
              uploadNonce,
            },
            onlyIf: conditionalWrite(null),
          },
        );
        if (reserved) return reserved;
        break;
      } catch (error) {
        if (
          !isR2WriteRateError(error) ||
          attempt === MAX_R2_WRITE_ATTEMPTS - 1
        ) {
          throw error;
        }
        await wait(retryDelay(attempt));
      }
    }
  }
  throw new Error("Lesson recording reservation contention exceeded.");
}

export async function putLessonRecordingAudio(
  bucket: LessonRecordingWriteBucket,
  key: string,
  body: Uint8Array,
  options: R2PutOptions,
  observed: R2Object,
  wait: Wait,
) {
  for (let attempt = 0; attempt < MAX_R2_WRITE_ATTEMPTS; attempt += 1) {
    try {
      return await bucket.put(key, body, {
        ...options,
        onlyIf: conditionalWrite(observed),
      });
    } catch (error) {
      if (!isR2WriteRateError(error)) throw error;
      const current = await retryRateLimited(() => bucket.head(key), wait);
      if (!sameObject(current, observed)) return null;
      if (attempt === MAX_R2_WRITE_ATTEMPTS - 1) throw error;
      await wait(retryDelay(attempt));
    }
  }
  throw new Error("Lesson recording write retry limit exceeded.");
}

export async function fenceLessonRecordingUpload(
  bucket: LessonRecordingWriteBucket,
  key: string,
  stored: R2Object,
  uploadNonce: string,
  state:
    | "account-deleting"
    | "consent-revoked"
    | "learner-deleting"
    | "lesson-changed"
    | "state-unknown",
  wait: Wait,
) {
  for (let attempt = 0; attempt < MAX_R2_WRITE_ATTEMPTS; attempt += 1) {
    const current = await retryRateLimited(() => bucket.head(key), wait);
    if (
      !current ||
      current.etag !== stored.etag ||
      current.version !== stored.version ||
      (current.customMetadata?.state !== "audio" &&
        current.customMetadata?.state !== "uploading") ||
      current.customMetadata.uploadNonce !== uploadNonce
    ) {
      return;
    }
    try {
      await bucket.put(
        key,
        new TextEncoder().encode(
          JSON.stringify([FENCE_FORMAT, uploadNonce, state]),
        ),
        {
          customMetadata: { invalidatedUploadNonce: uploadNonce, state },
          onlyIf: { etagMatches: stored.etag },
        },
      );
      return;
    } catch (error) {
      if (
        !isR2WriteRateError(error) ||
        attempt === MAX_R2_WRITE_ATTEMPTS - 1
      ) {
        throw error;
      }
      await wait(retryDelay(attempt));
    }
  }
}

function isOlderGeneration(
  object: R2Object,
  metadataKey: "consentGeneration" | "lessonGeneration",
  boundary: number,
) {
  if (
    object.customMetadata?.state === "account-deleting" ||
    object.customMetadata?.state === "learner-deleting"
  ) {
    return false;
  }
  const generation = Number(object.customMetadata?.[metadataKey]);
  return !Number.isSafeInteger(generation) || generation < boundary;
}

async function purgeOlderObject(
  bucket: LessonRecordingBucket,
  listed: R2Object,
  metadataKey: "consentGeneration" | "lessonGeneration",
  boundary: number,
  wait: Wait,
) {
  let current: R2Object | null = listed;
  for (let conflict = 0; conflict < MAX_WRITE_CONFLICTS; conflict += 1) {
    if (!isOlderGeneration(current, metadataKey, boundary)) return;
    const purged = await retryRateLimited(
      () => bucket.put(
        current!.key,
        new TextEncoder().encode(
          JSON.stringify([PURGE_FORMAT, current!.version]),
        ),
        {
          customMetadata: {
            invalidatedVersion: current!.version,
            state: "purged",
          },
          onlyIf: { etagMatches: current!.etag },
        },
      ),
      wait,
    );
    if (purged !== null) return;
    current = await retryRateLimited(() => bucket.head(listed.key), wait);
    if (!current) return;
  }
  throw new Error("Lesson recording purge contention exceeded.");
}

async function purgePrefix(
  bucket: LessonRecordingBucket,
  prefix: string,
  metadataKey: "consentGeneration" | "lessonGeneration",
  boundary: number,
  wait: Wait,
) {
  let cursor: string | undefined;
  const seenCursors = new Set<string>();

  while (true) {
    const page = await retryRateLimited(
      () => bucket.list({
        include: ["customMetadata"],
        prefix,
        ...(cursor === undefined ? {} : { cursor }),
      }),
      wait,
    );
    const keys = page.objects.map(({ key }) => key);
    if (keys.some((key) => !key.startsWith(prefix))) {
      throw new Error("R2 returned an object outside the lesson recording prefix.");
    }
    if (page.truncated) {
      if (!page.cursor || page.cursor === cursor || seenCursors.has(page.cursor)) {
        throw new Error("R2 lesson recording listing did not advance its cursor.");
      }
      seenCursors.add(page.cursor);
    }
    for (const object of page.objects) {
      await purgeOlderObject(bucket, object, metadataKey, boundary, wait);
    }
    if (!page.truncated) return;
    cursor = page.cursor;
  }
}

export function deleteAllLessonRecordings(
  bucket: LessonRecordingBucket,
  identity: LessonRecordingOwner,
  consentGenerationBoundary: number,
  wait: Wait,
) {
  return purgePrefix(
    bucket,
    lessonRecordingOwnerPrefix(identity),
    "consentGeneration",
    consentGenerationBoundary,
    wait,
  );
}

export function deleteLessonRecordingsForLesson(
  bucket: LessonRecordingBucket,
  identity: LessonRecordingOwner,
  lessonId: string,
  lessonGenerationBoundary: number,
  wait: Wait,
) {
  return purgePrefix(
    bucket,
    `${lessonRecordingOwnerPrefix(identity)}my/${encodeURIComponent(lessonId)}/`,
    "lessonGeneration",
    lessonGenerationBoundary,
    wait,
  );
}
