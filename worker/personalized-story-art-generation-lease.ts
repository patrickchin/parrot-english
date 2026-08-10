export const PERSONALIZED_STORY_ART_LEASE_DURATION_MS = 5 * 60 * 1000;

export type PersonalizedStoryArtGenerationLease = {
  authUserId: string;
  candidateR2ObjectKey: string | null;
  generationToken: string;
  leaseExpiresAt: number;
  previousR2ObjectKey: string | null;
  storyId: string;
};

type ReadyArtInput = {
  accountDeletionTombstoneKey: string;
  contentType: string;
  guardianConsentAt: number;
  guardianConsentVersion: string;
  id: string;
  promptVersion: string;
  provider: string;
  r2ObjectKey: string;
  updatedAt: number;
};

type ExistingReadyArt = {
  id: string;
  r2ObjectKey: string;
};

type RawLease = {
  auth_user_id: string;
  candidate_r2_object_key: string | null;
  generation_token: string;
  lease_expires_at: number;
  previous_r2_object_key: string | null;
  story_id: string;
};

function changed(result: D1Result<unknown>) {
  return Number(result.meta.changes ?? 0) === 1;
}

function mapLease(row: RawLease): PersonalizedStoryArtGenerationLease {
  return {
    authUserId: row.auth_user_id,
    candidateR2ObjectKey: row.candidate_r2_object_key,
    generationToken: row.generation_token,
    leaseExpiresAt: row.lease_expires_at,
    previousR2ObjectKey: row.previous_r2_object_key,
    storyId: row.story_id,
  };
}

export function createPersonalizedStoryArtGenerationLeaseRepository(
  database: D1Database,
) {
  async function findOwnedLease(
    userId: string,
    storyId: string,
    token: string,
  ) {
    const row = await database
      .prepare(
        `SELECT auth_user_id, story_id, generation_token,
          candidate_r2_object_key, previous_r2_object_key, lease_expires_at
        FROM personalized_story_art_generation_lease
        WHERE auth_user_id = ? AND story_id = ? AND generation_token = ?`,
      )
      .bind(userId, storyId, token)
      .first<RawLease>();
    return row ? mapLease(row) : null;
  }

  async function claimExpired(
    userId: string,
    storyId: string,
    token: string,
    now: number,
  ) {
    const result = await database
      .prepare(
        `UPDATE personalized_story_art_generation_lease
        SET generation_token = ?, lease_expires_at = ?, updated_at = ?
        WHERE auth_user_id = ? AND story_id = ? AND lease_expires_at <= ?`,
      )
      .bind(
        token,
        now + PERSONALIZED_STORY_ART_LEASE_DURATION_MS,
        now,
        userId,
        storyId,
        now,
      )
      .run();
    if (!changed(result)) return null;

    const lease = await findOwnedLease(userId, storyId, token);
    if (!lease) {
      throw new Error("Claimed personalized story art lease could not be read.");
    }
    return lease;
  }

  async function acquire(
    userId: string,
    storyId: string,
    token: string,
    now: number,
  ) {
    const result = await database
      .prepare(
        `INSERT INTO personalized_story_art_generation_lease (
          auth_user_id, story_id, generation_token,
          candidate_r2_object_key, previous_r2_object_key,
          lease_expires_at, created_at, updated_at
        ) VALUES (
          ?, ?, ?, NULL,
          (SELECT r2_object_key FROM personalized_story_art
            WHERE auth_user_id = ? AND story_id = ? LIMIT 1),
          ?, ?, ?
        )
        ON CONFLICT(auth_user_id, story_id) DO NOTHING`,
      )
      .bind(
        userId,
        storyId,
        token,
        userId,
        storyId,
        now + PERSONALIZED_STORY_ART_LEASE_DURATION_MS,
        now,
        now,
      )
      .run();
    return changed(result);
  }

  async function trackCandidate(
    userId: string,
    storyId: string,
    token: string,
    candidateR2ObjectKey: string,
    now: number,
  ) {
    const result = await database
      .prepare(
        `UPDATE personalized_story_art_generation_lease
        SET candidate_r2_object_key = ?, lease_expires_at = ?, updated_at = ?
        WHERE auth_user_id = ? AND story_id = ? AND generation_token = ?
          AND candidate_r2_object_key IS NULL AND lease_expires_at > ?`,
      )
      .bind(
        candidateR2ObjectKey,
        now + PERSONALIZED_STORY_ART_LEASE_DURATION_MS,
        now,
        userId,
        storyId,
        token,
        now,
      )
      .run();
    return changed(result);
  }

  async function release(userId: string, storyId: string, token: string) {
    const result = await database
      .prepare(
        `DELETE FROM personalized_story_art_generation_lease
        WHERE auth_user_id = ? AND story_id = ? AND generation_token = ?`,
      )
      .bind(userId, storyId, token)
      .run();
    return changed(result);
  }

  async function finalizeReady(
    userId: string,
    storyId: string,
    token: string,
    existing: ExistingReadyArt | null,
    input: ReadyArtInput,
  ) {
    if (!existing) {
      const result = await database
        .prepare(
          `INSERT INTO personalized_story_art (
            id, auth_user_id, story_id, status, r2_object_key, content_type,
            guardian_consent_version, guardian_consent_at, provider,
            prompt_version, created_at, updated_at
          )
          SELECT ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM personalized_story_art_generation_lease
            WHERE auth_user_id = ? AND story_id = ? AND generation_token = ?
              AND candidate_r2_object_key = ? AND lease_expires_at > ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM account_deletion_tombstone WHERE user_id_hash = ?
          )
          ON CONFLICT(auth_user_id, story_id) DO NOTHING`,
        )
        .bind(
          input.id,
          userId,
          storyId,
          input.r2ObjectKey,
          input.contentType,
          input.guardianConsentVersion,
          input.guardianConsentAt,
          input.provider,
          input.promptVersion,
          input.updatedAt,
          input.updatedAt,
          userId,
          storyId,
          token,
          input.r2ObjectKey,
          input.updatedAt,
          input.accountDeletionTombstoneKey,
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
        WHERE id = ? AND auth_user_id = ? AND story_id = ?
          AND status = 'ready' AND r2_object_key = ?
          AND EXISTS (
            SELECT 1 FROM personalized_story_art_generation_lease
            WHERE auth_user_id = ? AND story_id = ? AND generation_token = ?
              AND candidate_r2_object_key = ? AND lease_expires_at > ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM account_deletion_tombstone WHERE user_id_hash = ?
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
        existing.id,
        userId,
        storyId,
        existing.r2ObjectKey,
        userId,
        storyId,
        token,
        input.r2ObjectKey,
        input.updatedAt,
        input.accountDeletionTombstoneKey,
      )
      .run();
    return changed(result);
  }

  return {
    acquire,
    claimExpired,
    finalizeReady,
    release,
    trackCandidate,
  };
}
