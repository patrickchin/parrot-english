ALTER TABLE learner_profile ADD COLUMN legacy_storage_owner integer NOT NULL DEFAULT 1 CHECK (legacy_storage_owner IN (0, 1));
--> statement-breakpoint
CREATE UNIQUE INDEX learner_profile_id_user_unique ON learner_profile(id, auth_user_id);
--> statement-breakpoint
CREATE UNIQUE INDEX learner_profile_legacy_storage_owner_unique ON learner_profile(auth_user_id) WHERE legacy_storage_owner = 1;
--> statement-breakpoint
INSERT INTO learner_profile (id, auth_user_id, name, onboarding_status, legacy_storage_owner)
SELECT 'legacy-' || lower(hex(randomblob(16))), user.id, NULL, 'not_started', 1
FROM user
WHERE NOT EXISTS (SELECT 1 FROM learner_profile WHERE learner_profile.auth_user_id = user.id);
--> statement-breakpoint
ALTER TABLE learner_lesson ADD COLUMN learner_profile_id text REFERENCES learner_profile(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE conversation_session ADD COLUMN learner_profile_id text REFERENCES learner_profile(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE personalized_story_art ADD COLUMN learner_profile_id text REFERENCES learner_profile(id) ON DELETE CASCADE;
--> statement-breakpoint
UPDATE learner_lesson
SET learner_profile_id = (
  SELECT learner_profile.id
  FROM learner_profile
  WHERE learner_profile.auth_user_id = learner_lesson.auth_user_id
    AND learner_profile.legacy_storage_owner = 1
);
--> statement-breakpoint
UPDATE conversation_session
SET learner_profile_id = (
  SELECT learner_profile.id
  FROM learner_profile
  WHERE learner_profile.auth_user_id = conversation_session.auth_user_id
    AND learner_profile.legacy_storage_owner = 1
);
--> statement-breakpoint
UPDATE personalized_story_art
SET learner_profile_id = (
  SELECT learner_profile.id
  FROM learner_profile
  WHERE learner_profile.auth_user_id = personalized_story_art.auth_user_id
    AND learner_profile.legacy_storage_owner = 1
);
--> statement-breakpoint
CREATE INDEX learner_lesson_profile_updated_idx ON learner_lesson(learner_profile_id, updated_at);
--> statement-breakpoint
CREATE INDEX conversation_session_profile_status_idx ON conversation_session(learner_profile_id, status);
--> statement-breakpoint
CREATE UNIQUE INDEX personalized_story_art_profile_story_unique ON personalized_story_art(learner_profile_id, auth_user_id, story_id);
--> statement-breakpoint
CREATE TABLE session_learner_selection (
  session_id text PRIMARY KEY NOT NULL,
  auth_user_id text NOT NULL,
  learner_profile_id text NOT NULL,
  created_at integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
  updated_at integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
  FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE,
  FOREIGN KEY (auth_user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (learner_profile_id) REFERENCES learner_profile(id) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO session_learner_selection (session_id, auth_user_id, learner_profile_id)
SELECT session.id, session.user_id, learner_profile.id
FROM session
INNER JOIN learner_profile
  ON learner_profile.auth_user_id = session.user_id
  AND learner_profile.legacy_storage_owner = 1;
--> statement-breakpoint
CREATE TABLE onboarding_learner_session_bypass (
  session_id text NOT NULL,
  learner_profile_id text NOT NULL,
  skipped_at integer NOT NULL,
  PRIMARY KEY (session_id, learner_profile_id),
  FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE,
  FOREIGN KEY (learner_profile_id) REFERENCES learner_profile(id) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO onboarding_learner_session_bypass (session_id, learner_profile_id, skipped_at)
SELECT bypass.session_id, learner_profile.id, bypass.skipped_at
FROM onboarding_session_bypass AS bypass
INNER JOIN learner_profile
  ON learner_profile.auth_user_id = bypass.auth_user_id
  AND learner_profile.legacy_storage_owner = 1;
--> statement-breakpoint
CREATE TABLE learner_dub_consent (
  learner_profile_id text NOT NULL,
  auth_user_id text NOT NULL,
  consent_version text NOT NULL,
  grant_generation text NOT NULL,
  state text NOT NULL,
  granted_at integer NOT NULL,
  updated_at integer NOT NULL,
  PRIMARY KEY (learner_profile_id, auth_user_id),
  FOREIGN KEY (learner_profile_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
  FOREIGN KEY (auth_user_id) REFERENCES user(id) ON DELETE CASCADE,
  CONSTRAINT learner_dub_consent_state_check CHECK (state IN ('granted', 'revoking'))
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
  AND learner_profile.legacy_storage_owner = 1;
--> statement-breakpoint
CREATE TABLE learner_story_art_generation_lease (
  learner_profile_id text NOT NULL,
  auth_user_id text NOT NULL,
  story_id text NOT NULL,
  generation_token text NOT NULL,
  candidate_r2_object_key text,
  previous_r2_object_key text,
  lease_expires_at integer NOT NULL,
  created_at integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
  updated_at integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
  PRIMARY KEY (learner_profile_id, story_id),
  FOREIGN KEY (learner_profile_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
  FOREIGN KEY (auth_user_id) REFERENCES user(id) ON DELETE CASCADE
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
  AND learner_profile.legacy_storage_owner = 1;
