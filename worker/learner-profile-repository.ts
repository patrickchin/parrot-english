import { and, eq, sql } from "drizzle-orm";
import { learnerProfile, learnerSessionBypass } from "../src/db/schema.ts";
import { LESSON_RECORDING_CONSENT_VERSION } from "../lib/lesson-recording-consent.js";
import type { Database } from "./database.ts";
import {
  learnerNameKey,
  normalizeLearnerName,
  type LearnerIdentity,
} from "./request-identity.ts";

type RepositoryOptions = {
  now?: () => Date;
};

export function createLearnerProfileRepository(
  database: Database,
  { now = () => new Date() }: RepositoryOptions = {},
) {
  async function findProfile(identity: LearnerIdentity) {
    const [profile] = await database
      .select()
      .from(learnerProfile)
      .where(
        and(
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

  function nameFields(name: string | null | undefined) {
    const normalizedName = normalizeLearnerName(name);
    return {
      name: normalizedName,
      nameKey: learnerNameKey(normalizedName),
    };
  }

  async function hasSessionBypass(identity: LearnerIdentity) {
    const [row] = await database
      .select({ sessionId: learnerSessionBypass.sessionId })
      .from(learnerSessionBypass)
      .where(
        and(
          eq(learnerSessionBypass.sessionId, identity.sessionId),
          eq(learnerSessionBypass.learnerProfileId, identity.learnerProfileId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async function canBypass(identity: LearnerIdentity) {
    const profile = await findProfile(identity);
    return (
      profile?.profileStatus === "completed" ||
      (await hasSessionBypass(identity))
    );
  }

  async function skipSession(identity: LearnerIdentity) {
    const skippedAt = now();
    await loadProfile(identity);
    await database.$client
      .prepare(
        `INSERT INTO onboarding_learner_session_bypass
        (session_id, learner_profile_id, skipped_at)
       SELECT ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM learner_profile_deletion_tombstone
         WHERE learner_profile_id = ?
       )
       ON CONFLICT(session_id, learner_profile_id) DO UPDATE SET
         skipped_at = excluded.skipped_at
       WHERE NOT EXISTS (
         SELECT 1 FROM learner_profile_deletion_tombstone
         WHERE learner_profile_id = ?
       )`,
      )
      .bind(
        identity.sessionId,
        identity.learnerProfileId,
        skippedAt.getTime(),
        identity.learnerProfileId,
        identity.learnerProfileId,
      )
      .run();
    const result = await database.$client
      .prepare(
        `SELECT
           EXISTS (
             SELECT 1 FROM learner_profile_deletion_tombstone
             WHERE learner_profile_id = ?
           ) AS deletion_pending,
           EXISTS (
             SELECT 1 FROM onboarding_learner_session_bypass
             WHERE session_id = ? AND learner_profile_id = ?
           ) AS learner_bypass_stored`,
      )
      .bind(
        identity.learnerProfileId,
        identity.sessionId,
        identity.learnerProfileId,
      )
      .first<{ deletion_pending: number; learner_bypass_stored: number }>();
    if (result?.deletion_pending) throw new Error("learner_deletion_pending");
    if (!result?.learner_bypass_stored) {
      throw new Error("Learner onboarding bypass could not be persisted.");
    }
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
    },
  ) {
    const normalizedNameFields = Object.hasOwn(values, "name")
      ? nameFields(values.name)
      : {};
    await database
      .update(learnerProfile)
      .set({ ...values, ...normalizedNameFields, updatedAt: now() })
      .where(
        and(
          eq(learnerProfile.id, identity.learnerProfileId),
          eq(learnerProfile.authUserId, identity.userId),
        ),
      );
  }

  async function readLessonRecordingConsent(identity: LearnerIdentity) {
    return (await readLessonRecordingConsentState(identity)).enabled;
  }

  async function readLessonRecordingConsentState(identity: LearnerIdentity) {
    const profile = await loadProfile(identity);
    return {
      cleanupBeforeGeneration: profile.lessonRecordingCleanupBeforeGeneration,
      enabled:
        profile.lessonRecordingConsentVersion ===
        LESSON_RECORDING_CONSENT_VERSION,
      generation: profile.lessonRecordingGeneration,
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
    },
  ) {
    const timestamp = now();
    const normalizedNameFields = nameFields(values.name);
    await database
      .update(learnerProfile)
      .set({
        age: values.age,
        answersJson: values.answersJson,
        completedAt: values.completed ? timestamp : null,
        currentQuestionKey: values.currentQuestionKey,
        ...normalizedNameFields,
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

  return {
    canBypass,
    findProfile,
    hasSessionBypass,
    loadProfile,
    nameFields,
    clearLessonRecordingCleanup,
    readLessonRecordingConsent,
    readLessonRecordingConsentState,
    saveAnswer,
    saveLessonRecordingConsent,
    saveTransition,
    skipSession,
  };
}
