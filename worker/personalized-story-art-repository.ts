import { and, eq } from "drizzle-orm";
import { personalizedStoryArt } from "../src/db/schema.ts";
import type { Database } from "./database.ts";

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

export function createPersonalizedStoryArtRepository(
  database: Database,
  {
    createId = () => crypto.randomUUID(),
    now = () => new Date(),
  }: RepositoryOptions = {},
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

  async function saveReady(
    userId: string,
    storyId: string,
    input: {
      contentType: string;
      guardianConsentAt: Date;
      guardianConsentVersion: string;
      provider: string;
      promptVersion: string;
      r2ObjectKey: string;
    },
  ) {
    const timestamp = now();
    await database
      .insert(personalizedStoryArt)
      .values({
        authUserId: userId,
        contentType: input.contentType,
        createdAt: timestamp,
        guardianConsentAt: input.guardianConsentAt,
        guardianConsentVersion: input.guardianConsentVersion,
        id: createId(),
        promptVersion: input.promptVersion,
        provider: input.provider,
        r2ObjectKey: input.r2ObjectKey,
        status: "ready",
        storyId,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: [
          personalizedStoryArt.authUserId,
          personalizedStoryArt.storyId,
        ],
        set: {
          contentType: input.contentType,
          guardianConsentAt: input.guardianConsentAt,
          guardianConsentVersion: input.guardianConsentVersion,
          promptVersion: input.promptVersion,
          provider: input.provider,
          r2ObjectKey: input.r2ObjectKey,
          status: "ready",
          updatedAt: timestamp,
        },
      });
    return findOwnedStory(userId, storyId);
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
    saveReady,
  };
}
