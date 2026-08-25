import { and, eq } from "drizzle-orm";
import {
  learnerProfile,
  learnerSessionBypass,
  profileSessionBypass,
} from "../src/db/schema.ts";
import type { LearnerStoryLevelId } from "../lib/story-level.ts";
import type { Database } from "./database.ts";
import type { LearnerIdentity } from "./request-identity.ts";

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

type LegacyLearnerIdentity = Pick<
  LearnerIdentity,
  "sessionId" | "userId" | "userName"
>;

function isResolvedLearnerIdentity(
  identity: LegacyLearnerIdentity | LearnerIdentity,
): identity is LearnerIdentity {
  return typeof (identity as LearnerIdentity).learnerProfileId === "string";
}

export function createLearnerProfileRepository(
  database: Database,
  {
    createId = () => crypto.randomUUID(),
    now = () => new Date(),
  }: RepositoryOptions = {}
) {
  function findProfile(
    identity: LearnerIdentity,
  ): Promise<typeof learnerProfile.$inferSelect | null>;
  function findProfile(
    userId: string,
  ): Promise<typeof learnerProfile.$inferSelect | null>;
  async function findProfile(identity: LearnerIdentity | string) {
    const [profile] = await database
      .select()
      .from(learnerProfile)
      .where(
        typeof identity === "string"
          ? eq(learnerProfile.authUserId, identity)
          : and(
              eq(learnerProfile.id, identity.learnerProfileId),
              eq(learnerProfile.authUserId, identity.userId),
            ),
      )
      .limit(1);
    return profile ?? null;
  }

  async function loadProfile(identity: LearnerIdentity) {
    const profile = await findProfile(identity);
    if (!profile) throw new Error("Learner profile could not be loaded.");
    return profile;
  }

  async function ensureProfile(
    identity: LegacyLearnerIdentity | LearnerIdentity,
  ) {
    if (isResolvedLearnerIdentity(identity)) return loadProfile(identity);

    let profile = await findProfile(identity.userId);
    if (!profile) {
      const timestamp = now();
      await database
        .insert(learnerProfile)
        .values({
          id: createId(),
          authUserId: identity.userId,
          name: identity.userName,
          profileStatus: "not_started",
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoNothing({ target: learnerProfile.authUserId });
      profile = await findProfile(identity.userId);
    }
    if (!profile) throw new Error("Learner profile could not be created.");
    return profile;
  }

  async function hasSessionBypass(
    identity: LegacyLearnerIdentity | LearnerIdentity,
  ) {
    if (isResolvedLearnerIdentity(identity)) {
      const profile = await findProfile(identity);
      if (!profile) return false;
      const [learnerRow] = await database
        .select({ sessionId: learnerSessionBypass.sessionId })
        .from(learnerSessionBypass)
        .where(
          and(
            eq(learnerSessionBypass.sessionId, identity.sessionId),
            eq(learnerSessionBypass.learnerProfileId, identity.learnerProfileId),
          ),
      )
      .limit(1);
      if (learnerRow) return true;
      if (!profile.legacyStorageOwner) return false;
    }

    const [row] = await database
      .select({ sessionId: profileSessionBypass.sessionId })
      .from(profileSessionBypass)
      .where(
        and(
          eq(profileSessionBypass.sessionId, identity.sessionId),
          eq(profileSessionBypass.authUserId, identity.userId)
        )
      )
      .limit(1);
    return Boolean(row);
  }

  async function canBypass(identity: LearnerIdentity) {
    const profile = await findProfile(identity);
    return (
      profile?.profileStatus === "completed" ||
      profile?.lastSkippedSessionId === identity.sessionId ||
      (await hasSessionBypass(identity))
    );
  }

  async function skipSession(
    identity: LegacyLearnerIdentity | LearnerIdentity,
  ) {
    const skippedAt = now();
    if (isResolvedLearnerIdentity(identity)) {
      const profile = await loadProfile(identity);
      await database
        .insert(learnerSessionBypass)
        .values({
          learnerProfileId: identity.learnerProfileId,
          sessionId: identity.sessionId,
          skippedAt,
        })
        .onConflictDoUpdate({
          target: [
            learnerSessionBypass.sessionId,
            learnerSessionBypass.learnerProfileId,
          ],
          set: { skippedAt },
        });
      if (!profile.legacyStorageOwner) return;
    }

    await database
      .insert(profileSessionBypass)
      .values({
        authUserId: identity.userId,
        sessionId: identity.sessionId,
        skippedAt,
      })
      .onConflictDoUpdate({
        target: profileSessionBypass.sessionId,
        set: { authUserId: identity.userId, skippedAt },
      });
  }

  async function saveAnswer(
    identity: LearnerIdentity,
    values: {
      age?: number | null;
      answersJson: string;
      currentQuestionKey?: string | null;
      name?: string | null;
      profileStatus?: string;
      skippedQuestionKeysJson?: string;
    }
  ) {
    await database
      .update(learnerProfile)
      .set({ ...values, updatedAt: now() })
      .where(
        and(
          eq(learnerProfile.id, identity.learnerProfileId),
          eq(learnerProfile.authUserId, identity.userId),
        ),
      );
  }

  async function saveStoryLevel(
    identity: LearnerIdentity,
    storyLevel: LearnerStoryLevelId,
  ) {
    await database
      .update(learnerProfile)
      .set({ storyLevel, updatedAt: now() })
      .where(
        and(
          eq(learnerProfile.id, identity.learnerProfileId),
          eq(learnerProfile.authUserId, identity.userId),
        ),
      );
    return loadProfile(identity);
  }

  async function saveTransition(
    identity: LearnerIdentity,
    values: {
      age?: number | null;
      answersJson: string;
      completed: boolean;
      currentQuestionKey: string | null;
      name?: string | null;
      skippedQuestionKeysJson: string;
    }
  ) {
    const timestamp = now();
    await database
      .update(learnerProfile)
      .set({
        age: values.age,
        answersJson: values.answersJson,
        completedAt: values.completed ? timestamp : null,
        currentQuestionKey: values.currentQuestionKey,
        name: values.name,
        profileStatus: values.completed ? "completed" : "in_progress",
        skippedQuestionKeysJson: values.skippedQuestionKeysJson,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(learnerProfile.id, identity.learnerProfileId),
          eq(learnerProfile.authUserId, identity.userId),
        ),
      );
  }

  async function skip(identity: LearnerIdentity) {
    const timestamp = now();
    await database
      .update(learnerProfile)
      .set({
        lastSkippedAt: timestamp,
        lastSkippedSessionId: identity.sessionId,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(learnerProfile.id, identity.learnerProfileId),
          eq(learnerProfile.authUserId, identity.userId),
        ),
      );
  }

  async function complete(identity: LearnerIdentity) {
    const timestamp = now();
    await database
      .update(learnerProfile)
      .set({
        completedAt: timestamp,
        currentQuestionKey: null,
        profileStatus: "completed",
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(learnerProfile.id, identity.learnerProfileId),
          eq(learnerProfile.authUserId, identity.userId),
        ),
      );
  }

  return {
    canBypass,
    complete,
    ensureProfile,
    findProfile,
    hasSessionBypass,
    loadProfile,
    saveAnswer,
    saveStoryLevel,
    saveTransition,
    skip,
    skipSession,
  };
}
