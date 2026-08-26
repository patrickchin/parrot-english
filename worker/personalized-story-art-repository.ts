import { and, eq, isNull } from "drizzle-orm";
import { personalizedStoryArt } from "../src/db/schema.ts";
import type { Database } from "./database.ts";
import type { LearnerIdentity } from "./request-identity.ts";

type RepositoryOptions = {
  now?: () => Date;
};

export function createPersonalizedStoryArtRepository(
  database: Database,
  { now = () => new Date() }: RepositoryOptions = {},
) {
  async function findExactStory(identity: LearnerIdentity, storyId: string) {
    const [row] = await database
      .select()
      .from(personalizedStoryArt)
      .where(
        and(
          eq(personalizedStoryArt.authUserId, identity.userId),
          eq(
            personalizedStoryArt.learnerProfileId,
            identity.learnerProfileId,
          ),
          eq(personalizedStoryArt.storyId, storyId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function findLegacyStory(identity: LearnerIdentity, storyId: string) {
    if (!identity.legacyStorageOwner) return null;
    const [row] = await database
      .select()
      .from(personalizedStoryArt)
      .where(
        and(
          eq(personalizedStoryArt.authUserId, identity.userId),
          isNull(personalizedStoryArt.learnerProfileId),
          eq(personalizedStoryArt.storyId, storyId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function findOwnedStory(identity: LearnerIdentity, storyId: string) {
    return (
      (await findExactStory(identity, storyId)) ??
      (await findLegacyStory(identity, storyId))
    );
  }

  async function attachLegacyStory(
    identity: LearnerIdentity,
    storyId: string,
  ) {
    const exact = await findExactStory(identity, storyId);
    if (exact) return exact;
    const legacy = await findLegacyStory(identity, storyId);
    if (!legacy) return null;

    await database
      .update(personalizedStoryArt)
      .set({ learnerProfileId: identity.learnerProfileId })
      .where(
        and(
          eq(personalizedStoryArt.id, legacy.id),
          eq(personalizedStoryArt.authUserId, identity.userId),
          isNull(personalizedStoryArt.learnerProfileId),
          eq(personalizedStoryArt.storyId, storyId),
        ),
      );
    return findExactStory(identity, storyId);
  }

  async function markDeleting(identity: LearnerIdentity, storyId: string) {
    const row = await attachLegacyStory(identity, storyId);
    if (!row) return null;
    if (row.status !== "deleting") {
      await database
        .update(personalizedStoryArt)
        .set({ status: "deleting", updatedAt: now() })
        .where(
          and(
            eq(personalizedStoryArt.id, row.id),
            eq(personalizedStoryArt.authUserId, identity.userId),
            eq(
              personalizedStoryArt.learnerProfileId,
              identity.learnerProfileId,
            ),
            eq(personalizedStoryArt.storyId, storyId),
          ),
        );
    }
    return findExactStory(identity, storyId);
  }

  async function deleteByIdIfDeleting(
    identity: LearnerIdentity,
    storyId: string,
    id: string,
  ) {
    await database
      .delete(personalizedStoryArt)
      .where(
        and(
          eq(personalizedStoryArt.id, id),
          eq(personalizedStoryArt.authUserId, identity.userId),
          eq(
            personalizedStoryArt.learnerProfileId,
            identity.learnerProfileId,
          ),
          eq(personalizedStoryArt.storyId, storyId),
          eq(personalizedStoryArt.status, "deleting"),
        ),
      );
  }

  return {
    attachLegacyStory,
    deleteByIdIfDeleting,
    findOwnedStory,
    markDeleting,
  };
}
