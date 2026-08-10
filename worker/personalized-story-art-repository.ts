import { and, eq } from "drizzle-orm";
import { personalizedStoryArt } from "../src/db/schema.ts";
import type { Database } from "./database.ts";

type RepositoryOptions = {
  now?: () => Date;
};

export function createPersonalizedStoryArtRepository(
  database: Database,
  { now = () => new Date() }: RepositoryOptions = {},
) {
  async function findOwnedStory(userId: string, storyId: string) {
    const [row] = await database
      .select()
      .from(personalizedStoryArt)
      .where(
        and(
          eq(personalizedStoryArt.authUserId, userId),
          eq(personalizedStoryArt.storyId, storyId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function markDeleting(userId: string, storyId: string) {
    const row = await findOwnedStory(userId, storyId);
    if (!row) return null;
    if (row.status !== "deleting") {
      await database
        .update(personalizedStoryArt)
        .set({ status: "deleting", updatedAt: now() })
        .where(eq(personalizedStoryArt.id, row.id));
    }
    return findOwnedStory(userId, storyId);
  }

  async function deleteByIdIfDeleting(id: string) {
    await database
      .delete(personalizedStoryArt)
      .where(
        and(
          eq(personalizedStoryArt.id, id),
          eq(personalizedStoryArt.status, "deleting"),
        ),
      );
  }

  return {
    deleteByIdIfDeleting,
    findOwnedStory,
    markDeleting,
  };
}
