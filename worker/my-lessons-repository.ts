import { and, desc, eq, sql } from "drizzle-orm";
import { learnerLesson, learnerProfile } from "../src/db/schema.ts";
import type { Database } from "./database.ts";

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
    userId: string,
    source: "generated" | "uploaded",
    lesson: unknown,
  ) {
    const timestamp = now();
    const id = createId();
    await database.insert(learnerLesson).values({
      authUserId: userId,
      createdAt: timestamp,
      id,
      lessonJson: JSON.stringify(lesson),
      source,
      updatedAt: timestamp,
    });
    return findOwned(id, userId);
  }

  async function findOwned(id: string, userId: string) {
    const [row] = await database
      .select()
      .from(learnerLesson)
      .where(
        and(
          eq(learnerLesson.id, id),
          eq(learnerLesson.authUserId, userId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function updateOwned(id: string, userId: string, lesson: unknown) {
    const [updated] = await database
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
          eq(learnerLesson.authUserId, userId),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async function clearRecordingCleanup(
    id: string,
    userId: string,
    cleanupBeforeGeneration: number,
  ) {
    const cleared = await database
      .update(learnerLesson)
      .set({ recordingCleanupBeforeGeneration: null, updatedAt: now() })
      .where(
        and(
          eq(learnerLesson.id, id),
          eq(learnerLesson.authUserId, userId),
          eq(
            learnerLesson.recordingCleanupBeforeGeneration,
            cleanupBeforeGeneration,
          ),
        ),
      )
      .returning({ id: learnerLesson.id });
    return cleared.length > 0;
  }

  async function listOwned(userId: string) {
    return database
      .select()
      .from(learnerLesson)
      .where(eq(learnerLesson.authUserId, userId))
      .orderBy(desc(learnerLesson.updatedAt));
  }

  async function learnerName(userId: string) {
    const [profile] = await database
      .select({ name: learnerProfile.name })
      .from(learnerProfile)
      .where(eq(learnerProfile.authUserId, userId))
      .limit(1);
    return profile?.name?.trim() || null;
  }

  return {
    clearRecordingCleanup,
    create,
    findOwned,
    learnerName,
    listOwned,
    updateOwned,
  };
}
