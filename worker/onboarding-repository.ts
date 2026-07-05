import { and, asc, eq } from "drizzle-orm";
import {
  learnerProfile,
  onboardingSessionBypass,
  questionnaire,
  questionnaireQuestion,
} from "../src/db/schema.ts";
import { assignQuestionnaireVersion } from "../lib/onboarding.js";
import type { Database } from "./database.ts";
import type { OnboardingIdentity } from "./onboarding.ts";

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

export function createOnboardingRepository(
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

  async function findActiveQuestionnaire() {
    const [active] = await database
      .select()
      .from(questionnaire)
      .where(eq(questionnaire.status, "active"))
      .orderBy(asc(questionnaire.version))
      .limit(1);
    return active ?? null;
  }

  async function ensureProfile(identity: OnboardingIdentity) {
    let profile = await findProfile(identity.userId);
    const active = await findActiveQuestionnaire();

    if (!profile) {
      if (!active) throw new Error("Active questionnaire is unavailable.");
      const timestamp = now();
      await database
        .insert(learnerProfile)
        .values({
          id: createId(),
          authUserId: identity.userId,
          name: identity.userName,
          questionnaireVersion: active.version,
          onboardingStatus: "not_started",
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoNothing({ target: learnerProfile.authUserId });
      profile = await findProfile(identity.userId);
    }

    if (!profile) throw new Error("Learner profile could not be created.");
    if (profile.questionnaireVersion == null && active) {
      const assignedVersion = assignQuestionnaireVersion(profile, active.version);
      if (assignedVersion != null) {
        await database
          .update(learnerProfile)
          .set({ questionnaireVersion: assignedVersion, updatedAt: now() })
          .where(eq(learnerProfile.id, profile.id));
        profile = await findProfile(identity.userId);
      }
    }

    if (!profile?.questionnaireVersion) {
      throw new Error("Assigned questionnaire is unavailable.");
    }
    return profile;
  }

  async function loadState(identity: OnboardingIdentity) {
    const profile = await ensureProfile(identity);
    const [assignedQuestionnaire] = await database
      .select()
      .from(questionnaire)
      .where(eq(questionnaire.version, profile.questionnaireVersion!))
      .limit(1);
    if (!assignedQuestionnaire) {
      throw new Error("Assigned questionnaire is unavailable.");
    }

    const questions = await database
      .select()
      .from(questionnaireQuestion)
      .where(eq(questionnaireQuestion.questionnaireId, assignedQuestionnaire.id))
      .orderBy(asc(questionnaireQuestion.position));
    if (questions.length === 0) {
      throw new Error("Assigned questionnaire has no questions.");
    }
    return { profile, questionnaire: assignedQuestionnaire, questions };
  }

  async function hasSessionBypass(identity: OnboardingIdentity) {
    const [row] = await database
      .select({ sessionId: onboardingSessionBypass.sessionId })
      .from(onboardingSessionBypass)
      .where(
        and(
          eq(onboardingSessionBypass.sessionId, identity.sessionId),
          eq(onboardingSessionBypass.authUserId, identity.userId)
        )
      )
      .limit(1);
    return Boolean(row);
  }

  async function canBypass(identity: OnboardingIdentity) {
    const profile = await findProfile(identity.userId);
    return (
      profile?.onboardingStatus === "completed" ||
      profile?.lastSkippedSessionId === identity.sessionId ||
      (await hasSessionBypass(identity))
    );
  }

  async function skipSession(identity: OnboardingIdentity) {
    const skippedAt = now();
    await database
      .insert(onboardingSessionBypass)
      .values({
        authUserId: identity.userId,
        sessionId: identity.sessionId,
        skippedAt,
      })
      .onConflictDoUpdate({
        target: onboardingSessionBypass.sessionId,
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
      onboardingStatus?: string;
      skippedQuestionKeysJson?: string;
    }
  ) {
    await database
      .update(learnerProfile)
      .set({ ...values, updatedAt: now() })
      .where(eq(learnerProfile.id, profileId));
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
        onboardingStatus: values.completed ? "completed" : "in_progress",
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
        onboardingStatus: "completed",
        updatedAt: timestamp,
      })
      .where(eq(learnerProfile.id, profileId));
  }

  async function findQuestion(questionnaireId: string, answerKey: string) {
    const [entry] = await database
      .select()
      .from(questionnaireQuestion)
      .where(
        and(
          eq(questionnaireQuestion.questionnaireId, questionnaireId),
          eq(questionnaireQuestion.answerKey, answerKey)
        )
      )
      .limit(1);
    return entry ?? null;
  }

  return {
    canBypass,
    complete,
    findQuestion,
    loadState,
    saveAnswer,
    saveTransition,
    skip,
    skipSession,
  };
}
