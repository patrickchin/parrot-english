type LessonRecordingBucket = Pick<R2Bucket, "delete" | "list">;
type LessonRecordingWriteBucket = Pick<R2Bucket, "head" | "put">;

const AUDIO_FORMAT = "parrot-lesson-recording-audio-v1";
const FENCE_FORMAT = "parrot-lesson-recording-fence-v1";

export type LessonRecordingSlot = {
  lessonId: string;
  sceneIndex: number;
  source: "my" | "parrot";
  stepIndex: number;
};

function ownerPrefix(userId: string) {
  return `personalized-story-art/${encodeURIComponent(userId)}/lesson-recordings/`;
}

export function lessonRecordingObjectKey(
  userId: string,
  slot: LessonRecordingSlot,
) {
  return `${ownerPrefix(userId)}${slot.source}/${encodeURIComponent(slot.lessonId)}/scene-${slot.sceneIndex}/step-${slot.stepIndex}.audio`;
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

export async function fenceLessonRecordingUpload(
  bucket: LessonRecordingWriteBucket,
  key: string,
  stored: R2Object,
  uploadNonce: string,
  state: "account-deleting" | "consent-revoked" | "state-unknown",
) {
  const current = await bucket.head(key);
  if (
    !current ||
    current.etag !== stored.etag ||
    current.version !== stored.version ||
    current.customMetadata?.state !== "audio" ||
    current.customMetadata.uploadNonce !== uploadNonce
  ) {
    return;
  }
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
}

async function deletePrefix(bucket: LessonRecordingBucket, prefix: string) {
  let cursor: string | undefined;
  const seenCursors = new Set<string>();

  while (true) {
    const page = await bucket.list({
      prefix,
      ...(cursor === undefined ? {} : { cursor }),
    });
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
    if (keys.length > 0) await bucket.delete(keys);
    if (!page.truncated) return;
    cursor = page.cursor;
  }
}

export function deleteAllLessonRecordings(
  bucket: LessonRecordingBucket,
  userId: string,
) {
  return deletePrefix(bucket, ownerPrefix(userId));
}

export function deleteLessonRecordingsForLesson(
  bucket: LessonRecordingBucket,
  userId: string,
  lessonId: string,
) {
  return deletePrefix(
    bucket,
    `${ownerPrefix(userId)}my/${encodeURIComponent(lessonId)}/`,
  );
}
