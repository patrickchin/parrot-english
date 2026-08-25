import { and, desc, eq, isNull, or } from "drizzle-orm";
import { learnerLesson } from "../src/db/schema.ts";
import type { Database } from "./database.ts";
import type { LearnerIdentity } from "./request-identity.ts";

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

  function learnerOwnership(identity: LearnerIdentity) {
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
          learnerOwnership(identity),
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
    await database
      .update(learnerLesson)
      .set({
        lessonJson: JSON.stringify(lesson),
        updatedAt: now(),
      })
      .where(
        and(
          eq(learnerLesson.id, id),
          eq(learnerLesson.authUserId, identity.userId),
          learnerOwnership(identity),
        ),
      );
    return findOwned(id, identity);
  }

  async function listOwned(identity: LearnerIdentity) {
    return database
      .select()
      .from(learnerLesson)
      .where(
        and(
          eq(learnerLesson.authUserId, identity.userId),
          learnerOwnership(identity),
        ),
      )
      .orderBy(desc(learnerLesson.updatedAt));
  }

  return { create, findOwned, listOwned, updateOwned };
}
