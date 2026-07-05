import { and, eq } from "drizzle-orm";
import {
  learnerProfile,
  onboardingSessionBypass,
} from "../src/db/schema.ts";
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

  async function ensureProfile(identity: OnboardingIdentity) {
    let profile = await findProfile(identity.userId);

    if (!profile) {
      const timestamp = now();
      await database
        .insert(learnerProfile)
        .values({
          id: createId(),
          authUserId: identity.userId,
          name: identity.userName,
          onboardingStatus: "not_started",
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

  return {
    canBypass,
    complete,
    ensureProfile,
    findProfile,
    loadProfile,
    saveAnswer,
    saveTransition,
    skip,
    skipSession,
  };
}
