INSERT INTO learner_profile (id, auth_user_id, name, onboarding_status, legacy_storage_owner)
SELECT 'legacy-' || lower(hex(randomblob(16))), user.id, NULL, 'not_started', 1
FROM user
WHERE NOT EXISTS (
  SELECT 1 FROM learner_profile WHERE learner_profile.auth_user_id = user.id
);
--> statement-breakpoint
UPDATE learner_lesson
SET learner_profile_id = (
  SELECT learner_profile.id
  FROM learner_profile
  WHERE learner_profile.auth_user_id = learner_lesson.auth_user_id
    AND learner_profile.legacy_storage_owner = 1
)
WHERE learner_profile_id IS NULL;
--> statement-breakpoint
UPDATE conversation_session
SET learner_profile_id = (
  SELECT learner_profile.id
  FROM learner_profile
  WHERE learner_profile.auth_user_id = conversation_session.auth_user_id
    AND learner_profile.legacy_storage_owner = 1
)
WHERE learner_profile_id IS NULL;
--> statement-breakpoint
UPDATE personalized_story_art
SET learner_profile_id = (
  SELECT learner_profile.id
  FROM learner_profile
  WHERE learner_profile.auth_user_id = personalized_story_art.auth_user_id
    AND learner_profile.legacy_storage_owner = 1
)
WHERE learner_profile_id IS NULL;
--> statement-breakpoint
INSERT INTO session_learner_selection (
  session_id,
  auth_user_id,
  learner_profile_id,
  created_at,
  updated_at
)
SELECT session.id, session.user_id, learner_profile.id, session.created_at, session.updated_at
FROM session
INNER JOIN learner_profile ON learner_profile.auth_user_id = session.user_id
WHERE NOT EXISTS (
    SELECT 1 FROM session_learner_selection
    WHERE session_learner_selection.session_id = session.id
  )
  AND 1 = (
    SELECT count(*) FROM learner_profile AS owned_profile
    WHERE owned_profile.auth_user_id = session.user_id
  );
--> statement-breakpoint
INSERT INTO onboarding_learner_session_bypass (session_id, learner_profile_id, skipped_at)
SELECT bypass.session_id, learner_profile.id, bypass.skipped_at
FROM onboarding_session_bypass AS bypass
INNER JOIN learner_profile
  ON learner_profile.auth_user_id = bypass.auth_user_id
  AND learner_profile.legacy_storage_owner = 1
WHERE true
ON CONFLICT(session_id, learner_profile_id) DO UPDATE SET
  skipped_at = excluded.skipped_at;
--> statement-breakpoint
DELETE FROM learner_dub_consent
WHERE EXISTS (
    SELECT 1
    FROM learner_profile
    WHERE learner_profile.id = learner_dub_consent.learner_profile_id
      AND learner_profile.auth_user_id = learner_dub_consent.auth_user_id
      AND learner_profile.legacy_storage_owner = 1
  )
  AND NOT EXISTS (
    SELECT 1
    FROM guardian_dub_consent
    WHERE guardian_dub_consent.auth_user_id = learner_dub_consent.auth_user_id
  );
--> statement-breakpoint
INSERT INTO learner_dub_consent (
  learner_profile_id,
  auth_user_id,
  consent_version,
  grant_generation,
  state,
  granted_at,
  updated_at
)
SELECT
  learner_profile.id,
  consent.auth_user_id,
  consent.consent_version,
  consent.grant_generation,
  consent.state,
  consent.granted_at,
  consent.updated_at
FROM guardian_dub_consent AS consent
INNER JOIN learner_profile
  ON learner_profile.auth_user_id = consent.auth_user_id
  AND learner_profile.legacy_storage_owner = 1
WHERE true
ON CONFLICT(learner_profile_id, auth_user_id) DO UPDATE SET
  consent_version = excluded.consent_version,
  grant_generation = excluded.grant_generation,
  state = excluded.state,
  granted_at = excluded.granted_at,
  updated_at = excluded.updated_at;
--> statement-breakpoint
DELETE FROM learner_story_art_generation_lease
WHERE EXISTS (
    SELECT 1
    FROM learner_profile
    WHERE learner_profile.id = learner_story_art_generation_lease.learner_profile_id
      AND learner_profile.auth_user_id = learner_story_art_generation_lease.auth_user_id
      AND learner_profile.legacy_storage_owner = 1
  )
  AND NOT EXISTS (
    SELECT 1
    FROM personalized_story_art_generation_lease
    WHERE personalized_story_art_generation_lease.auth_user_id = learner_story_art_generation_lease.auth_user_id
      AND personalized_story_art_generation_lease.story_id = learner_story_art_generation_lease.story_id
  );
--> statement-breakpoint
INSERT INTO learner_story_art_generation_lease (
  learner_profile_id,
  auth_user_id,
  story_id,
  generation_token,
  candidate_r2_object_key,
  previous_r2_object_key,
  lease_expires_at,
  created_at,
  updated_at
)
SELECT
  learner_profile.id,
  lease.auth_user_id,
  lease.story_id,
  lease.generation_token,
  lease.candidate_r2_object_key,
  lease.previous_r2_object_key,
  lease.lease_expires_at,
  lease.created_at,
  lease.updated_at
FROM personalized_story_art_generation_lease AS lease
INNER JOIN learner_profile
  ON learner_profile.auth_user_id = lease.auth_user_id
  AND learner_profile.legacy_storage_owner = 1
WHERE true
ON CONFLICT(learner_profile_id, story_id) DO UPDATE SET
  auth_user_id = excluded.auth_user_id,
  generation_token = excluded.generation_token,
  candidate_r2_object_key = excluded.candidate_r2_object_key,
  previous_r2_object_key = excluded.previous_r2_object_key,
  lease_expires_at = excluded.lease_expires_at,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;
--> statement-breakpoint
CREATE TABLE multi_learner_backfill_assertion (
  failures integer NOT NULL CHECK (failures = 0)
);
--> statement-breakpoint
INSERT INTO multi_learner_backfill_assertion
SELECT
  (SELECT count(*) FROM learner_lesson WHERE learner_profile_id IS NULL) +
  (SELECT count(*) FROM conversation_session WHERE learner_profile_id IS NULL) +
  (SELECT count(*) FROM personalized_story_art WHERE learner_profile_id IS NULL) +
  (SELECT count(*)
   FROM session
   WHERE NOT EXISTS (
       SELECT 1 FROM session_learner_selection
       WHERE session_learner_selection.session_id = session.id
     )
     AND 1 = (
       SELECT count(*) FROM learner_profile
       WHERE learner_profile.auth_user_id = session.user_id
     ));
--> statement-breakpoint
DROP TABLE multi_learner_backfill_assertion;
--> statement-breakpoint
DROP INDEX `learner_profile_auth_user_id_unique`;
--> statement-breakpoint
DROP INDEX `personalized_story_art_user_story_unique`;
--> statement-breakpoint
CREATE INDEX `learner_profile_auth_user_id_idx` ON `learner_profile` (`auth_user_id`);
--> statement-breakpoint
CREATE INDEX `personalized_story_art_user_story_idx` ON `personalized_story_art` (`auth_user_id`,`story_id`);
--> statement-breakpoint
CREATE INDEX `session_learner_selection_auth_profile_idx` ON `session_learner_selection` (`auth_user_id`,`learner_profile_id`);
