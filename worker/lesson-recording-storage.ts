type LessonRecordingBucket = Pick<R2Bucket, "delete" | "list">;

function ownerPrefix(userId: string) {
  return `personalized-story-art/${encodeURIComponent(userId)}/lesson-recordings/`;
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
