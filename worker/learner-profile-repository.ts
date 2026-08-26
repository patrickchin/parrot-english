import { and, eq, sql } from "drizzle-orm";
import {
  learnerProfile,
  learnerSessionBypass,
  profileSessionBypass,
} from "../src/db/schema.ts";
import type { LearnerStoryLevelId } from "../lib/story-level.ts";
import { LESSON_RECORDING_CONSENT_VERSION } from "../lib/lesson-recording-consent.js";
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
        .onConflictDoNothing();
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

  async function readLessonRecordingConsent(identity: LearnerIdentity) {
    return (await readLessonRecordingConsentState(identity)).enabled;
  }

  async function readLessonRecordingConsentState(identity: LearnerIdentity) {
    const profile = await findProfile(identity);
    return {
      cleanupBeforeGeneration:
        profile?.lessonRecordingCleanupBeforeGeneration ?? null,
      enabled:
        profile?.lessonRecordingConsentVersion ===
        LESSON_RECORDING_CONSENT_VERSION,
      generation: profile?.lessonRecordingGeneration ?? 0,
    };
  }

  async function saveLessonRecordingConsent(
    identity: LearnerIdentity,
    enabled: boolean,
  ) {
    const timestamp = now();
    const [saved] = await database
      .update(learnerProfile)
      .set({
        lessonRecordingCleanupBeforeGeneration: enabled
          ? learnerProfile.lessonRecordingCleanupBeforeGeneration
          : sql`case
              when ${learnerProfile.lessonRecordingConsentVersion} = ${LESSON_RECORDING_CONSENT_VERSION}
                then ${learnerProfile.lessonRecordingGeneration} + 1
              else ${learnerProfile.lessonRecordingCleanupBeforeGeneration}
            end`,
        lessonRecordingConsentVersion: enabled
          ? LESSON_RECORDING_CONSENT_VERSION
          : null,
        lessonRecordingConsentAt: enabled ? timestamp : null,
        lessonRecordingGeneration: enabled
          ? sql`case
              when ${learnerProfile.lessonRecordingConsentVersion} = ${LESSON_RECORDING_CONSENT_VERSION}
                then ${learnerProfile.lessonRecordingGeneration}
              else ${learnerProfile.lessonRecordingGeneration} + 1
            end`
          : sql`case
              when ${learnerProfile.lessonRecordingConsentVersion} = ${LESSON_RECORDING_CONSENT_VERSION}
                then ${learnerProfile.lessonRecordingGeneration} + 1
              else ${learnerProfile.lessonRecordingGeneration}
            end`,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(learnerProfile.id, identity.learnerProfileId),
          eq(learnerProfile.authUserId, identity.userId),
        ),
      )
      .returning({ id: learnerProfile.id });
    if (!saved) {
      throw new Error("Learner recording consent could not be updated.");
    }
    return readLessonRecordingConsentState(identity);
  }

  async function clearLessonRecordingCleanup(
    identity: LearnerIdentity,
    cleanupBeforeGeneration: number,
  ) {
    const cleared = await database
      .update(learnerProfile)
      .set({ lessonRecordingCleanupBeforeGeneration: null, updatedAt: now() })
      .where(
        and(
          eq(learnerProfile.id, identity.learnerProfileId),
          eq(learnerProfile.authUserId, identity.userId),
          eq(
            learnerProfile.lessonRecordingCleanupBeforeGeneration,
            cleanupBeforeGeneration,
          ),
        ),
      )
      .returning({ id: learnerProfile.id });
    return cleared.length > 0;
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
    clearLessonRecordingCleanup,
    readLessonRecordingConsent,
    readLessonRecordingConsentState,
    saveAnswer,
    saveLessonRecordingConsent,
    saveStoryLevel,
    saveTransition,
    skip,
    skipSession,
  };
}
