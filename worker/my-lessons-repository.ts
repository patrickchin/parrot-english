import { and, desc, eq } from "drizzle-orm";
import { learnerLesson, learnerProfile } from "../src/db/schema.ts";
import type { Database } from "./database.ts";

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

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

  return { create, findOwned, learnerName, listOwned };
}
