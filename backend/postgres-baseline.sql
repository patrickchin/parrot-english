-- Generated from the current app schema by scripts/build-aliyun-schema.mjs.
-- Baseline for a NEW, isolated PostgreSQL database; never apply to existing users.
BEGIN;
CREATE TABLE IF NOT EXISTS parrot_backend_migration (name text PRIMARY KEY);
CREATE FUNCTION unixepoch(mode text) RETURNS numeric LANGUAGE sql VOLATILE AS $$ SELECT extract(epoch FROM clock_timestamp()) $$;
CREATE FUNCTION max(a bigint, b bigint) RETURNS bigint LANGUAGE sql IMMUTABLE AS $$ SELECT greatest(a, b) $$;
CREATE FUNCTION json_valid(value text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$ BEGIN PERFORM value::jsonb; RETURN true; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END $$;
CREATE FUNCTION json_type(value text, path text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_typeof(jsonb_path_query_first(value::jsonb, path::jsonpath)) $$;
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" bigint DEFAULT 0 NOT NULL,
	"image" text,
	"created_at" bigint DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	"updated_at" bigint DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
, "is_anonymous" bigint DEFAULT 0 NOT NULL);
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" bigint,
	"refresh_token_expires_at" bigint,
	"scope" text,
	"password" text,
	"created_at" bigint DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	"updated_at" bigint DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY ("user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" bigint NOT NULL,
	"token" text NOT NULL,
	"created_at" bigint DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	"updated_at" bigint DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	FOREIGN KEY ("user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	"updated_at" bigint DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
);
CREATE TABLE "guardian_session_unlock" (
	"session_id" text PRIMARY KEY NOT NULL,
	"unlocked_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	FOREIGN KEY ("session_id") REFERENCES "session"("id") ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "learner_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"auth_user_id" text NOT NULL,
	"name" text,
	"private_media_name" text DEFAULT 'Learner' NOT NULL,
	"name_key" text,
	"age" bigint,
	"story_level" text DEFAULT 'first-words' NOT NULL,
	"answers_json" text DEFAULT '{"schemaVersion":2,"questionnaireVersion":2,"responses":{},"description":null}' NOT NULL,
	"skipped_question_keys_json" text DEFAULT '[]' NOT NULL,
	"current_question_key" text,
	"onboarding_status" text DEFAULT 'not_started' NOT NULL,
	"completed_at" bigint,
	"lesson_recording_consent_version" text,
	"lesson_recording_consent_at" bigint,
	"lesson_recording_generation" bigint DEFAULT 0 NOT NULL,
	"lesson_recording_cleanup_before_generation" bigint,
	"created_at" bigint DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	"updated_at" bigint DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY ("auth_user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "learner_profile_answers_json_check" CHECK(json_valid("learner_profile"."answers_json")),
	CONSTRAINT "learner_profile_skipped_question_keys_json_check" CHECK(json_valid("learner_profile"."skipped_question_keys_json")),
	CONSTRAINT "learner_profile_onboarding_status_check" CHECK("learner_profile"."onboarding_status" in ('not_started', 'in_progress', 'completed')),
	CONSTRAINT "learner_profile_story_level_check" CHECK("learner_profile"."story_level" in ('first-words', 'repeating-patterns', 'tiny-stories', 'early-a1'))
);
CREATE TABLE "session_learner_selection" (
	"session_id" text PRIMARY KEY NOT NULL,
	"auth_user_id" text NOT NULL,
	"learner_profile_id" text NOT NULL,
	"created_at" bigint DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	"updated_at" bigint DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE cascade,
	FOREIGN KEY ("auth_user_id") REFERENCES "user"("id") ON DELETE cascade,
	FOREIGN KEY ("learner_profile_id") REFERENCES "learner_profile"("id") ON DELETE cascade
);
CREATE TABLE "onboarding_learner_session_bypass" (
	"session_id" text NOT NULL,
	"learner_profile_id" text NOT NULL,
	"skipped_at" bigint NOT NULL,
	PRIMARY KEY ("session_id", "learner_profile_id"),
	FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE cascade,
	FOREIGN KEY ("learner_profile_id") REFERENCES "learner_profile"("id") ON DELETE cascade
);
CREATE TABLE "learner_dub_consent" (
	"learner_profile_id" text NOT NULL,
	"auth_user_id" text NOT NULL,
	"consent_version" text NOT NULL,
	"grant_generation" text NOT NULL,
	"state" text NOT NULL,
	"granted_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	PRIMARY KEY ("learner_profile_id", "auth_user_id"),
	FOREIGN KEY ("learner_profile_id") REFERENCES "learner_profile"("id") ON DELETE cascade,
	FOREIGN KEY ("auth_user_id") REFERENCES "user"("id") ON DELETE cascade,
	CONSTRAINT "learner_dub_consent_state_check" CHECK ("state" IN ('granted', 'revoking'))
);
CREATE TABLE "conversation_session" (
	"id" text PRIMARY KEY NOT NULL,
	"auth_user_id" text NOT NULL,
	"learner_profile_id" text NOT NULL,
	"scenario_key" text NOT NULL,
	"scenario_version" bigint NOT NULL,
	"prompt_style" text,
	"room_name" text NOT NULL,
	"status" text NOT NULL,
	"finish_reason" text,
	"controller_state" text DEFAULT '{}' NOT NULL,
	"started_at" bigint DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	"ended_at" bigint,
	"created_at" bigint DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	"updated_at" bigint DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY ("auth_user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("learner_profile_id") REFERENCES "learner_profile"("id") ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "conversation_session_scenario_key_check" CHECK("conversation_session"."scenario_key" in ('onboarding', 'small-chat')),
	CONSTRAINT "conversation_session_prompt_style_check" CHECK(("conversation_session"."scenario_key" = 'onboarding' and "conversation_session"."prompt_style" is null) or ("conversation_session"."scenario_key" = 'small-chat' and "conversation_session"."prompt_style" is not null and "conversation_session"."prompt_style" in ('tiny-turns', 'gentle-guide', 'playful-pal'))),
	CONSTRAINT "conversation_session_status_check" CHECK("conversation_session"."status" in ('starting', 'active', 'completed', 'stopped', 'disconnected', 'failed', 'abandoned')),
	CONSTRAINT "conversation_session_controller_state_json_check" CHECK(json_valid("conversation_session"."controller_state"))
);
CREATE TABLE "conversation_turn" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"provider_item_id" text NOT NULL,
	"sequence" bigint NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"language" text,
	"input_mode" text NOT NULL,
	"interrupted" bigint DEFAULT 0 NOT NULL,
	"started_at" bigint,
	"ended_at" bigint,
	"created_at" bigint DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY ("conversation_id") REFERENCES "conversation_session"("id") ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "conversation_turn_role_check" CHECK("conversation_turn"."role" in ('user', 'assistant')),
	CONSTRAINT "conversation_turn_input_mode_check" CHECK("conversation_turn"."input_mode" in ('voice', 'text'))
);
CREATE TABLE "account_deletion_tombstone" (
	"user_id_hash" text PRIMARY KEY NOT NULL,
	"r2_prefix" text NOT NULL,
	"requested_at" bigint NOT NULL,
	"learner_storage_identities_json" text DEFAULT '[]' NOT NULL,
	CONSTRAINT "account_deletion_tombstone_learner_storage_identities_json_check" CHECK(json_valid("account_deletion_tombstone"."learner_storage_identities_json"))
);
CREATE TABLE "learner_profile_deletion_tombstone" (
	"learner_profile_id" text PRIMARY KEY NOT NULL,
	"user_id_hash" text NOT NULL,
	"private_media_name" text DEFAULT 'Learner' NOT NULL,
	"generation" bigint NOT NULL,
	"requested_at" bigint NOT NULL,
	"storage_keys_json" text DEFAULT '[]' NOT NULL,
	CONSTRAINT "learner_profile_deletion_tombstone_storage_keys_json_check" CHECK(json_valid("learner_profile_deletion_tombstone"."storage_keys_json"))
);
CREATE INDEX "account_user_id_idx" ON "account" ("user_id");
CREATE INDEX "account_provider_account_idx" ON "account" ("provider_id","account_id");
CREATE UNIQUE INDEX "session_token_unique" ON "session" ("token");
CREATE INDEX "session_user_id_idx" ON "session" ("user_id");
CREATE UNIQUE INDEX "user_email_unique" ON "user" ("email");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
CREATE INDEX "guardian_session_unlock_expires_at_idx" ON "guardian_session_unlock" ("expires_at");
CREATE INDEX "learner_profile_auth_user_id_idx" ON "learner_profile" ("auth_user_id");
CREATE UNIQUE INDEX "learner_profile_user_name_key_unique" ON "learner_profile" ("auth_user_id","name_key");
CREATE UNIQUE INDEX "learner_profile_user_private_media_name_unique" ON "learner_profile" ("auth_user_id","private_media_name");
CREATE INDEX "session_learner_selection_auth_profile_idx" ON "session_learner_selection" ("auth_user_id","learner_profile_id");
CREATE UNIQUE INDEX "conversation_session_room_name_unique" ON "conversation_session" ("room_name");
CREATE INDEX "conversation_session_user_status_idx" ON "conversation_session" ("auth_user_id","status");
CREATE INDEX "conversation_session_profile_status_idx" ON "conversation_session" ("learner_profile_id","status");
CREATE UNIQUE INDEX "conversation_turn_provider_item_unique" ON "conversation_turn" ("conversation_id","provider_item_id");
CREATE UNIQUE INDEX "conversation_turn_sequence_unique" ON "conversation_turn" ("conversation_id","sequence");
CREATE UNIQUE INDEX "account_deletion_tombstone_r2_prefix_unique" ON "account_deletion_tombstone" ("r2_prefix");
CREATE INDEX "learner_profile_deletion_tombstone_user_hash_idx" ON "learner_profile_deletion_tombstone" ("user_id_hash");
CREATE TABLE parrot_private_media (
  key text COLLATE "C" PRIMARY KEY, etag text NOT NULL, body bytea NOT NULL,
  uploaded bigint NOT NULL, custom_metadata jsonb NOT NULL, http_metadata jsonb NOT NULL
);
CREATE TABLE parrot_rate_limit (key text PRIMARY KEY, window_start bigint NOT NULL, hits integer NOT NULL);
INSERT INTO "user" ("id", "name", "email", "email_verified", "image", "created_at", "updated_at", "is_anonymous") VALUES ('shared-guest-user', 'Guest', 'shared-guest@parrotbook.invalid', 0, NULL, 0, 0, 0);
INSERT INTO "learner_profile" ("id", "auth_user_id", "name", "private_media_name", "name_key", "age", "story_level", "answers_json", "skipped_question_keys_json", "current_question_key", "onboarding_status", "completed_at", "lesson_recording_consent_version", "lesson_recording_consent_at", "lesson_recording_generation", "lesson_recording_cleanup_before_generation", "created_at", "updated_at") VALUES ('shared-guest-sam', 'shared-guest-user', 'Sam', 'Sam', 'sam', NULL, 'first-words', '{"schemaVersion":2,"questionnaireVersion":2,"responses":{},"description":null}', '[]', NULL, 'completed', 0, NULL, NULL, 0, NULL, 0, 0);
INSERT INTO parrot_backend_migration VALUES ('0001-isolated-postgres');
COMMIT;
