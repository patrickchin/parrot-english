DROP TABLE `guardian_dub_consent`;--> statement-breakpoint
DROP TABLE `learner_selection_required`;--> statement-breakpoint
DROP TABLE `learner_story_art_generation_lease`;--> statement-breakpoint
DROP TABLE `personalized_story_art`;--> statement-breakpoint
DROP TABLE `personalized_story_art_generation_lease`;--> statement-breakpoint
DROP TABLE `onboarding_session_bypass`;--> statement-breakpoint
DROP TABLE `questionnaire_question`;--> statement-breakpoint
CREATE TABLE `__new_learner_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_user_id` text NOT NULL,
	`name` text,
	`private_media_name` text DEFAULT 'Learner' NOT NULL,
	`name_key` text,
	`age` integer,
	`story_level` text DEFAULT 'first-words' NOT NULL,
	`answers_json` text DEFAULT '{"schemaVersion":2,"questionnaireVersion":2,"responses":{},"description":null}' NOT NULL,
	`skipped_question_keys_json` text DEFAULT '[]' NOT NULL,
	`current_question_key` text,
	`onboarding_status` text DEFAULT 'not_started' NOT NULL,
	`completed_at` integer,
	`lesson_recording_consent_version` text,
	`lesson_recording_consent_at` integer,
	`lesson_recording_generation` integer DEFAULT 0 NOT NULL,
	`lesson_recording_cleanup_before_generation` integer,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`auth_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "learner_profile_answers_json_check" CHECK(json_valid("__new_learner_profile"."answers_json")),
	CONSTRAINT "learner_profile_skipped_question_keys_json_check" CHECK(json_valid("__new_learner_profile"."skipped_question_keys_json")),
	CONSTRAINT "learner_profile_onboarding_status_check" CHECK("__new_learner_profile"."onboarding_status" in ('not_started', 'in_progress', 'completed')),
	CONSTRAINT "learner_profile_story_level_check" CHECK("__new_learner_profile"."story_level" in ('first-words', 'repeating-patterns', 'tiny-stories', 'early-a1'))
);
--> statement-breakpoint
INSERT INTO `__new_learner_profile`("id", "auth_user_id", "name", "private_media_name", "name_key", "age", "story_level", "answers_json", "skipped_question_keys_json", "current_question_key", "onboarding_status", "completed_at", "lesson_recording_consent_version", "lesson_recording_consent_at", "lesson_recording_generation", "lesson_recording_cleanup_before_generation", "created_at", "updated_at")
SELECT
	"id",
	"auth_user_id",
	"name",
	"private_media_name",
	"name_key",
	"age",
	"story_level",
	CASE
		WHEN json_extract("answers_json", '$.schemaVersion') = 2
			AND json_type("answers_json", '$.responses') = 'object'
		THEN json_object(
			'schemaVersion', 2,
			'questionnaireVersion', 2,
			'responses', json(json_extract("answers_json", '$.responses')),
			'description', CASE
				WHEN json_type("answers_json", '$.description') = 'text'
				THEN json_extract("answers_json", '$.description')
				ELSE NULL
			END
		)
		ELSE '{"schemaVersion":2,"questionnaireVersion":2,"responses":{},"description":null}'
	END,
	CASE
		WHEN json_extract("answers_json", '$.schemaVersion') = 2
			AND json_type("answers_json", '$.responses') = 'object'
		THEN "skipped_question_keys_json"
		ELSE '[]'
	END,
	CASE
		WHEN json_extract("answers_json", '$.schemaVersion') = 2
			AND json_type("answers_json", '$.responses') = 'object'
		THEN "current_question_key"
		WHEN "onboarding_status" = 'completed' THEN "current_question_key"
		ELSE 'name'
	END,
	"onboarding_status",
	"completed_at",
	"lesson_recording_consent_version",
	"lesson_recording_consent_at",
	"lesson_recording_generation",
	"lesson_recording_cleanup_before_generation",
	"created_at",
	"updated_at"
FROM `learner_profile`;--> statement-breakpoint
CREATE TABLE `__new_session_learner_selection` (
	`session_id` text PRIMARY KEY NOT NULL,
	`auth_user_id` text NOT NULL,
	`learner_profile_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE cascade,
	FOREIGN KEY (`auth_user_id`) REFERENCES `user`(`id`) ON DELETE cascade,
	FOREIGN KEY (`learner_profile_id`) REFERENCES `__new_learner_profile`(`id`) ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_session_learner_selection`
SELECT `session_id`, `auth_user_id`, `learner_profile_id`, `created_at`, `updated_at`
FROM `session_learner_selection`;--> statement-breakpoint
CREATE TABLE `__new_onboarding_learner_session_bypass` (
	`session_id` text NOT NULL,
	`learner_profile_id` text NOT NULL,
	`skipped_at` integer NOT NULL,
	PRIMARY KEY (`session_id`, `learner_profile_id`),
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE cascade,
	FOREIGN KEY (`learner_profile_id`) REFERENCES `__new_learner_profile`(`id`) ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_onboarding_learner_session_bypass`
SELECT `session_id`, `learner_profile_id`, `skipped_at`
FROM `onboarding_learner_session_bypass`;--> statement-breakpoint
CREATE TABLE `__new_learner_dub_consent` (
	`learner_profile_id` text NOT NULL,
	`auth_user_id` text NOT NULL,
	`consent_version` text NOT NULL,
	`grant_generation` text NOT NULL,
	`state` text NOT NULL,
	`granted_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY (`learner_profile_id`, `auth_user_id`),
	FOREIGN KEY (`learner_profile_id`) REFERENCES `__new_learner_profile`(`id`) ON DELETE cascade,
	FOREIGN KEY (`auth_user_id`) REFERENCES `user`(`id`) ON DELETE cascade,
	CONSTRAINT "learner_dub_consent_state_check" CHECK (`state` IN ('granted', 'revoking'))
);--> statement-breakpoint
INSERT INTO `__new_learner_dub_consent`
SELECT `learner_profile_id`, `auth_user_id`, `consent_version`, `grant_generation`, `state`, `granted_at`, `updated_at`
FROM `learner_dub_consent`;--> statement-breakpoint
CREATE TABLE `__new_conversation_session` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_user_id` text NOT NULL,
	`learner_profile_id` text NOT NULL,
	`scenario_key` text NOT NULL,
	`scenario_version` integer NOT NULL,
	`prompt_style` text,
	`room_name` text NOT NULL,
	`status` text NOT NULL,
	`finish_reason` text,
	`controller_state` text DEFAULT '{}' NOT NULL,
	`started_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`ended_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`auth_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`learner_profile_id`) REFERENCES `__new_learner_profile`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "conversation_session_scenario_key_check" CHECK("__new_conversation_session"."scenario_key" in ('onboarding', 'small-chat')),
	CONSTRAINT "conversation_session_prompt_style_check" CHECK(("__new_conversation_session"."scenario_key" = 'onboarding' and "__new_conversation_session"."prompt_style" is null) or ("__new_conversation_session"."scenario_key" = 'small-chat' and "__new_conversation_session"."prompt_style" is not null and "__new_conversation_session"."prompt_style" in ('tiny-turns', 'gentle-guide', 'playful-pal'))),
	CONSTRAINT "conversation_session_status_check" CHECK("__new_conversation_session"."status" in ('starting', 'active', 'completed', 'stopped', 'disconnected', 'failed', 'abandoned')),
	CONSTRAINT "conversation_session_controller_state_json_check" CHECK(json_valid("__new_conversation_session"."controller_state"))
);--> statement-breakpoint
INSERT INTO `__new_conversation_session`
SELECT `id`, `auth_user_id`, `learner_profile_id`, `scenario_key`, `scenario_version`, `prompt_style`, `room_name`, `status`, `finish_reason`, `controller_state`, `started_at`, `ended_at`, `created_at`, `updated_at`
FROM `conversation_session`
WHERE `learner_profile_id` IS NOT NULL
	AND ((`scenario_key` = 'onboarding' AND `prompt_style` IS NULL)
		OR (`scenario_key` = 'small-chat' AND `prompt_style` IS NOT NULL AND `prompt_style` IN ('tiny-turns', 'gentle-guide', 'playful-pal')));--> statement-breakpoint
CREATE TABLE `__new_conversation_turn` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`provider_item_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`language` text,
	`input_mode` text NOT NULL,
	`interrupted` integer DEFAULT false NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `__new_conversation_session`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "conversation_turn_role_check" CHECK("__new_conversation_turn"."role" in ('user', 'assistant')),
	CONSTRAINT "conversation_turn_input_mode_check" CHECK("__new_conversation_turn"."input_mode" in ('voice', 'text'))
);--> statement-breakpoint
INSERT INTO `__new_conversation_turn`
SELECT `turn`.`id`, `turn`.`conversation_id`, `turn`.`provider_item_id`, `turn`.`sequence`, `turn`.`role`, `turn`.`text`, `turn`.`language`, `turn`.`input_mode`, `turn`.`interrupted`, `turn`.`started_at`, `turn`.`ended_at`, `turn`.`created_at`
FROM `conversation_turn` AS `turn`
INNER JOIN `__new_conversation_session` AS `conversation`
	ON `conversation`.`id` = `turn`.`conversation_id`;--> statement-breakpoint
DROP TABLE `conversation_turn`;--> statement-breakpoint
DROP TABLE `conversation_session`;--> statement-breakpoint
DROP TABLE `session_learner_selection`;--> statement-breakpoint
DROP TABLE `onboarding_learner_session_bypass`;--> statement-breakpoint
DROP TABLE `learner_dub_consent`;--> statement-breakpoint
DROP TABLE `learner_profile`;--> statement-breakpoint
ALTER TABLE `__new_learner_profile` RENAME TO `learner_profile`;--> statement-breakpoint
ALTER TABLE `__new_session_learner_selection` RENAME TO `session_learner_selection`;--> statement-breakpoint
ALTER TABLE `__new_onboarding_learner_session_bypass` RENAME TO `onboarding_learner_session_bypass`;--> statement-breakpoint
ALTER TABLE `__new_learner_dub_consent` RENAME TO `learner_dub_consent`;--> statement-breakpoint
ALTER TABLE `__new_conversation_session` RENAME TO `conversation_session`;--> statement-breakpoint
ALTER TABLE `__new_conversation_turn` RENAME TO `conversation_turn`;--> statement-breakpoint
CREATE INDEX `learner_profile_auth_user_id_idx` ON `learner_profile` (`auth_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `learner_profile_user_name_key_unique` ON `learner_profile` (`auth_user_id`,`name_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `learner_profile_user_private_media_name_unique` ON `learner_profile` (`auth_user_id`,`private_media_name`);--> statement-breakpoint
CREATE INDEX `session_learner_selection_auth_profile_idx` ON `session_learner_selection` (`auth_user_id`,`learner_profile_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_session_room_name_unique` ON `conversation_session` (`room_name`);--> statement-breakpoint
CREATE INDEX `conversation_session_user_status_idx` ON `conversation_session` (`auth_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `conversation_session_profile_status_idx` ON `conversation_session` (`learner_profile_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_turn_provider_item_unique` ON `conversation_turn` (`conversation_id`,`provider_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_turn_sequence_unique` ON `conversation_turn` (`conversation_id`,`sequence`);--> statement-breakpoint
DROP TABLE `questionnaire`;--> statement-breakpoint
CREATE TABLE `__new_account_deletion_tombstone` (
	`user_id_hash` text PRIMARY KEY NOT NULL,
	`r2_prefix` text NOT NULL,
	`requested_at` integer NOT NULL,
	`learner_storage_identities_json` text DEFAULT '[]' NOT NULL,
	CONSTRAINT "account_deletion_tombstone_learner_storage_identities_json_check" CHECK(json_valid("__new_account_deletion_tombstone"."learner_storage_identities_json"))
);
--> statement-breakpoint
INSERT INTO `__new_account_deletion_tombstone`("user_id_hash", "r2_prefix", "requested_at", "learner_storage_identities_json") SELECT "user_id_hash", "r2_prefix", "requested_at", "learner_storage_identities_json" FROM `account_deletion_tombstone`;--> statement-breakpoint
DROP TABLE `account_deletion_tombstone`;--> statement-breakpoint
ALTER TABLE `__new_account_deletion_tombstone` RENAME TO `account_deletion_tombstone`;--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_tombstone_r2_prefix_unique` ON `account_deletion_tombstone` (`r2_prefix`);--> statement-breakpoint
CREATE TABLE `__new_learner_profile_deletion_tombstone` (
	`learner_profile_id` text PRIMARY KEY NOT NULL,
	`user_id_hash` text NOT NULL,
	`private_media_name` text DEFAULT 'Learner' NOT NULL,
	`generation` integer NOT NULL,
	`requested_at` integer NOT NULL,
	`storage_keys_json` text DEFAULT '[]' NOT NULL,
	CONSTRAINT "learner_profile_deletion_tombstone_storage_keys_json_check" CHECK(json_valid("__new_learner_profile_deletion_tombstone"."storage_keys_json"))
);
--> statement-breakpoint
INSERT INTO `__new_learner_profile_deletion_tombstone`("learner_profile_id", "user_id_hash", "private_media_name", "generation", "requested_at", "storage_keys_json") SELECT "learner_profile_id", "user_id_hash", "private_media_name", "generation", "requested_at", "storage_keys_json" FROM `learner_profile_deletion_tombstone`;--> statement-breakpoint
DROP TABLE `learner_profile_deletion_tombstone`;--> statement-breakpoint
ALTER TABLE `__new_learner_profile_deletion_tombstone` RENAME TO `learner_profile_deletion_tombstone`;--> statement-breakpoint
CREATE INDEX `learner_profile_deletion_tombstone_user_hash_idx` ON `learner_profile_deletion_tombstone` (`user_id_hash`);
