import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { learnerLesson } from "../src/db/schema.ts";
import type { Database } from "./database.ts";
import type { LearnerIdentity } from "./request-identity.ts";

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

export async function lessonJsonRevision(lessonJson: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(lessonJson),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function createMyLessonRepository(
  database: Database,
  {
    createId = () => crypto.randomUUID(),
    now = () => new Date(),
  }: RepositoryOptions = {},
) {
  async function create(
    identity: LearnerIdentity,
    source: "generated" | "uploaded",
    lesson: unknown,
  ) {
    const timestamp = now();
    const id = createId();
    await database.insert(learnerLesson).values({
      authUserId: identity.userId,
      createdAt: timestamp,
      id,
      learnerProfileId: identity.learnerProfileId,
      lessonJson: JSON.stringify(lesson),
      source,
      updatedAt: timestamp,
    });
    return findOwned(id, identity);
  }

  function readableLearnerOwnership(identity: LearnerIdentity) {
    const selected = eq(
      learnerLesson.learnerProfileId,
      identity.learnerProfileId,
    );
    return identity.legacyStorageOwner
      ? or(selected, isNull(learnerLesson.learnerProfileId))!
      : selected;
  }

  async function findOwned(id: string, identity: LearnerIdentity) {
    const [row] = await database
      .select()
      .from(learnerLesson)
      .where(
        and(
          eq(learnerLesson.id, id),
          eq(learnerLesson.authUserId, identity.userId),
          readableLearnerOwnership(identity),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function updateOwned(
    id: string,
    identity: LearnerIdentity,
    lesson: unknown,
  ) {
    const [row] = await database
      .update(learnerLesson)
      .set({
        lessonJson: JSON.stringify(lesson),
        recordingCleanupBeforeGeneration:
          sql`${learnerLesson.recordingGeneration} + 1`,
        recordingGeneration: sql`${learnerLesson.recordingGeneration} + 1`,
        updatedAt: now(),
      })
      .where(
        and(
          eq(learnerLesson.id, id),
          eq(learnerLesson.authUserId, identity.userId),
          eq(learnerLesson.learnerProfileId, identity.learnerProfileId),
        ),
      )
      .returning();
    return row ?? null;
  }

  async function clearRecordingCleanup(
    id: string,
    identity: LearnerIdentity,
    cleanupBeforeGeneration: number,
  ) {
    const cleared = await database
      .update(learnerLesson)
      .set({ recordingCleanupBeforeGeneration: null, updatedAt: now() })
      .where(
        and(
          eq(learnerLesson.id, id),
          eq(learnerLesson.authUserId, identity.userId),
          eq(learnerLesson.learnerProfileId, identity.learnerProfileId),
          eq(
            learnerLesson.recordingCleanupBeforeGeneration,
            cleanupBeforeGeneration,
          ),
        ),
      )
      .returning({ id: learnerLesson.id });
    return cleared.length > 0;
  }

  async function listOwned(identity: LearnerIdentity) {
    return database
      .select()
      .from(learnerLesson)
      .where(
        and(
          eq(learnerLesson.authUserId, identity.userId),
          readableLearnerOwnership(identity),
        ),
      )
      .orderBy(desc(learnerLesson.updatedAt));
  }

  return {
    clearRecordingCleanup,
    create,
    findOwned,
    listOwned,
    updateOwned,
  };
}
