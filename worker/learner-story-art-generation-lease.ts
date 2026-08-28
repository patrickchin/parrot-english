import type { LearnerIdentity } from "./request-identity.ts";

export const LEARNER_STORY_ART_LEASE_DURATION_MS = 5 * 60 * 1000;

export type LearnerStoryArtGenerationLease = {
  authUserId: string;
  candidateR2ObjectKey: string | null;
  generationToken: string;
  learnerProfileId: string;
  leaseExpiresAt: number;
  previousR2ObjectKey: string | null;
  storyId: string;
};

type ExistingReadyArt = {
  id: string;
  r2ObjectKey: string;
};

type ReadyArtInput = {
  accountDeletionTombstoneKey: string;
  contentType: string;
  existing: ExistingReadyArt | null;
  guardianConsentAt: number;
  guardianConsentVersion: string;
  id: string;
  promptVersion: string;
  provider: string;
  r2ObjectKey: string;
  updatedAt: number;
};

type RawLease = {
  auth_user_id: string;
  candidate_r2_object_key: string | null;
  generation_token: string;
  learner_profile_id: string;
  lease_expires_at: number;
  previous_r2_object_key: string | null;
  story_id: string;
};

type RepositoryOptions = {
  now?: () => Date;
};

function changed(result: D1Result<unknown>) {
  return Number(result.meta.changes ?? 0) === 1;
}

function mapLease(row: RawLease): LearnerStoryArtGenerationLease {
  return {
    authUserId: row.auth_user_id,
    candidateR2ObjectKey: row.candidate_r2_object_key,
    generationToken: row.generation_token,
    learnerProfileId: row.learner_profile_id,
    leaseExpiresAt: row.lease_expires_at,
    previousR2ObjectKey: row.previous_r2_object_key,
    storyId: row.story_id,
  };
}

export function createLearnerStoryArtGenerationLeaseRepository(
  database: D1Database,
  { now = () => new Date() }: RepositoryOptions = {},
) {
  async function findOwnedLease(
    identity: LearnerIdentity,
    storyId: string,
    token: string,
  ) {
    const row = await database
      .prepare(
        `SELECT learner_profile_id, auth_user_id, story_id, generation_token,
          candidate_r2_object_key, previous_r2_object_key, lease_expires_at
        FROM learner_story_art_generation_lease
        WHERE learner_profile_id = ? AND auth_user_id = ? AND story_id = ?
          AND generation_token = ?`,
      )
      .bind(
        identity.learnerProfileId,
        identity.userId,
        storyId,
        token,
      )
      .first<RawLease>();
    return row ? mapLease(row) : null;
  }

  async function acquire(
    identity: LearnerIdentity,
    storyId: string,
    token: string,
    leaseExpiresAt: number,
  ) {
    const acquiredAt = now().getTime();
    const result = await database
      .prepare(
        `INSERT INTO learner_story_art_generation_lease (
          learner_profile_id, auth_user_id, story_id, generation_token,
          candidate_r2_object_key, previous_r2_object_key,
          lease_expires_at, created_at, updated_at
        ) SELECT
          ?, ?, ?, ?, NULL,
          (SELECT r2_object_key FROM personalized_story_art
            WHERE learner_profile_id = ? AND auth_user_id = ? AND story_id = ?
            LIMIT 1),
          ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM learner_profile_deletion_tombstone
          WHERE learner_profile_id = ?
        )
        ON CONFLICT(learner_profile_id, story_id) DO NOTHING`,
      )
      .bind(
        identity.learnerProfileId,
        identity.userId,
        storyId,
        token,
        identity.learnerProfileId,
        identity.userId,
        storyId,
        leaseExpiresAt,
        acquiredAt,
        acquiredAt,
        identity.learnerProfileId,
      )
      .run();
    return changed(result);
  }

  async function trackCandidate(
    identity: LearnerIdentity,
    storyId: string,
    token: string,
    candidateR2ObjectKey: string,
    accountDeletionTombstoneKey: string,
  ) {
    const updatedAt = now().getTime();
    const result = await database
      .prepare(
        `UPDATE learner_story_art_generation_lease
        SET candidate_r2_object_key = ?, lease_expires_at = ?, updated_at = ?
        WHERE learner_profile_id = ? AND auth_user_id = ? AND story_id = ?
          AND generation_token = ? AND candidate_r2_object_key IS NULL
          AND lease_expires_at > ?
          AND NOT EXISTS (
            SELECT 1 FROM account_deletion_tombstone WHERE user_id_hash = ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM learner_profile_deletion_tombstone
            WHERE learner_profile_id = ?
          )`,
      )
      .bind(
        candidateR2ObjectKey,
        updatedAt + LEARNER_STORY_ART_LEASE_DURATION_MS,
        updatedAt,
        identity.learnerProfileId,
        identity.userId,
        storyId,
        token,
        updatedAt,
        accountDeletionTombstoneKey,
        identity.learnerProfileId,
      )
      .run();
    return changed(result);
  }

  async function finalize(
    identity: LearnerIdentity,
    storyId: string,
    token: string,
    input: ReadyArtInput,
  ) {
    if (!input.existing) {
      const result = await database
        .prepare(
          `INSERT INTO personalized_story_art (
            id, auth_user_id, learner_profile_id, story_id, status,
            r2_object_key, content_type, guardian_consent_version,
            guardian_consent_at, provider, prompt_version, created_at, updated_at
          )
          SELECT ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM learner_story_art_generation_lease
            WHERE learner_profile_id = ? AND auth_user_id = ? AND story_id = ?
              AND generation_token = ? AND candidate_r2_object_key = ?
              AND lease_expires_at > ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM account_deletion_tombstone WHERE user_id_hash = ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM learner_profile_deletion_tombstone
            WHERE learner_profile_id = ?
          )
          ON CONFLICT(learner_profile_id, auth_user_id, story_id) DO NOTHING`,
        )
        .bind(
          input.id,
          identity.userId,
          identity.learnerProfileId,
          storyId,
          input.r2ObjectKey,
          input.contentType,
          input.guardianConsentVersion,
          input.guardianConsentAt,
          input.provider,
          input.promptVersion,
          input.updatedAt,
          input.updatedAt,
          identity.learnerProfileId,
          identity.userId,
          storyId,
          token,
          input.r2ObjectKey,
          input.updatedAt,
          input.accountDeletionTombstoneKey,
          identity.learnerProfileId,
        )
        .run();
      return changed(result);
    }

    const result = await database
      .prepare(
        `UPDATE personalized_story_art
        SET status = 'ready', r2_object_key = ?, content_type = ?,
          guardian_consent_version = ?, guardian_consent_at = ?,
          provider = ?, prompt_version = ?, updated_at = ?
        WHERE id = ? AND learner_profile_id = ? AND auth_user_id = ?
          AND story_id = ? AND status = 'ready' AND r2_object_key = ?
          AND EXISTS (
            SELECT 1 FROM learner_story_art_generation_lease
            WHERE learner_profile_id = ? AND auth_user_id = ? AND story_id = ?
              AND generation_token = ? AND candidate_r2_object_key = ?
              AND lease_expires_at > ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM account_deletion_tombstone WHERE user_id_hash = ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM learner_profile_deletion_tombstone
            WHERE learner_profile_id = ?
          )`,
      )
      .bind(
        input.r2ObjectKey,
        input.contentType,
        input.guardianConsentVersion,
        input.guardianConsentAt,
        input.provider,
        input.promptVersion,
        input.updatedAt,
        input.existing.id,
        identity.learnerProfileId,
        identity.userId,
        storyId,
        input.existing.r2ObjectKey,
        identity.learnerProfileId,
        identity.userId,
        storyId,
        token,
        input.r2ObjectKey,
        input.updatedAt,
        input.accountDeletionTombstoneKey,
        identity.learnerProfileId,
      )
      .run();
    return changed(result);
  }

  async function release(
    identity: LearnerIdentity,
    storyId: string,
    token: string,
  ) {
    const result = await database
      .prepare(
        `DELETE FROM learner_story_art_generation_lease
        WHERE learner_profile_id = ? AND auth_user_id = ? AND story_id = ?
          AND generation_token = ?`,
      )
      .bind(
        identity.learnerProfileId,
        identity.userId,
        storyId,
        token,
      )
      .run();
    return changed(result);
  }

  async function recoverExpired(
    identity: LearnerIdentity,
    storyId: string,
    recoveredAt: number,
  ) {
    const token = crypto.randomUUID();
    const result = await database
      .prepare(
        `UPDATE learner_story_art_generation_lease
        SET generation_token = ?, lease_expires_at = ?, updated_at = ?
        WHERE learner_profile_id = ? AND auth_user_id = ? AND story_id = ?
          AND lease_expires_at <= ?
          AND NOT EXISTS (
            SELECT 1 FROM learner_profile_deletion_tombstone
            WHERE learner_profile_id = ?
          )`,
      )
      .bind(
        token,
        recoveredAt + LEARNER_STORY_ART_LEASE_DURATION_MS,
        recoveredAt,
        identity.learnerProfileId,
        identity.userId,
        storyId,
        recoveredAt,
        identity.learnerProfileId,
      )
      .run();
    if (!changed(result)) return null;

    const lease = await findOwnedLease(identity, storyId, token);
    if (!lease) {
      throw new Error("Recovered learner story art lease could not be read.");
    }
    return lease;
  }

  return {
    acquire,
    finalize,
    recoverExpired,
    release,
    trackCandidate,
  };
}
