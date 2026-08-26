import { and, eq, sql } from "drizzle-orm";
import {
  learnerProfile,
  profileSessionBypass,
} from "../src/db/schema.ts";
import type { LearnerStoryLevelId } from "../lib/story-level.ts";
import type { Database } from "./database.ts";
import type { LearnerProfileIdentity } from "./learner-profile.ts";
import { LESSON_RECORDING_CONSENT_VERSION } from "../lib/lesson-recording-consent.js";

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

export function createLearnerProfileRepository(
  database: Database,
  {
    createId = () => crypto.randomUUID(),
    now = () => new Date(),
  }: RepositoryOptions = {}
) {
  async function findProfile(userId: string) {
    const [profile] = await database
      .select()
      .from(learnerProfile)
      .where(eq(learnerProfile.authUserId, userId))
      .limit(1);
    return profile ?? null;
  }

  async function ensureProfile(identity: LearnerProfileIdentity) {
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

  const loadProfile = ensureProfile;

  async function hasSessionBypass(identity: LearnerProfileIdentity) {
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

  async function canBypass(identity: LearnerProfileIdentity) {
    const profile = await findProfile(identity.userId);
    return (
      profile?.profileStatus === "completed" ||
      profile?.lastSkippedSessionId === identity.sessionId ||
      (await hasSessionBypass(identity))
    );
  }

  async function skipSession(identity: LearnerProfileIdentity) {
    const skippedAt = now();
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
    profileId: string,
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
      .where(eq(learnerProfile.id, profileId));
  }

  async function saveStoryLevel(
    userId: string,
    storyLevel: LearnerStoryLevelId,
  ) {
    await database
      .update(learnerProfile)
      .set({ storyLevel, updatedAt: now() })
      .where(eq(learnerProfile.authUserId, userId));
    const profile = await findProfile(userId);
    if (!profile) throw new Error("Learner profile could not be updated.");
    return profile;
  }

  async function readLessonRecordingConsent(userId: string) {
    return (await readLessonRecordingConsentState(userId)).enabled;
  }

  async function readLessonRecordingConsentState(userId: string) {
    const profile = await findProfile(userId);
    return {
      cleanupBeforeGeneration:
        profile?.lessonRecordingCleanupBeforeGeneration ?? null,
      enabled:
        profile?.lessonRecordingConsentVersion ===
        LESSON_RECORDING_CONSENT_VERSION,
      generation: profile?.lessonRecordingGeneration ?? 0,
    };
  }

  async function saveLessonRecordingConsent(userId: string, enabled: boolean) {
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
      .where(eq(learnerProfile.authUserId, userId))
      .returning({ id: learnerProfile.id });
    if (!saved) {
      throw new Error("Learner recording consent could not be updated.");
    }
    return readLessonRecordingConsentState(userId);
  }

  async function clearLessonRecordingCleanup(
    userId: string,
    cleanupBeforeGeneration: number,
  ) {
    const cleared = await database
      .update(learnerProfile)
      .set({ lessonRecordingCleanupBeforeGeneration: null, updatedAt: now() })
      .where(
        and(
          eq(learnerProfile.authUserId, userId),
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
    profileId: string,
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
      .where(eq(learnerProfile.id, profileId));
  }

  async function skip(profileId: string, sessionId: string) {
    const timestamp = now();
    await database
      .update(learnerProfile)
      .set({
        lastSkippedAt: timestamp,
        lastSkippedSessionId: sessionId,
        updatedAt: timestamp,
      })
      .where(eq(learnerProfile.id, profileId));
  }

  async function complete(profileId: string) {
    const timestamp = now();
    await database
      .update(learnerProfile)
      .set({
        completedAt: timestamp,
        currentQuestionKey: null,
        profileStatus: "completed",
        updatedAt: timestamp,
      })
      .where(eq(learnerProfile.id, profileId));
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
