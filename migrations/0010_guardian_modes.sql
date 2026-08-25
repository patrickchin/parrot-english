CREATE TABLE `guardian_session_unlock` (
	`session_id` text PRIMARY KEY NOT NULL,
	`unlocked_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `guardian_session_unlock_expires_at_idx` ON `guardian_session_unlock` (`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_learner_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_user_id` text NOT NULL,
	`name` text,
	`age` integer,
	`story_level` text DEFAULT 'first-words' NOT NULL,
	`answers_json` text DEFAULT '{}' NOT NULL,
	`skipped_question_keys_json` text DEFAULT '[]' NOT NULL,
	`questionnaire_version` integer,
	`current_question_key` text,
	`onboarding_status` text DEFAULT 'not_started' NOT NULL,
	`last_skipped_at` integer,
	`last_skipped_session_id` text,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`auth_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`questionnaire_version`) REFERENCES `questionnaire`(`version`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "learner_profile_answers_json_check" CHECK(json_valid("__new_learner_profile"."answers_json")),
	CONSTRAINT "learner_profile_skipped_question_keys_json_check" CHECK(json_valid("__new_learner_profile"."skipped_question_keys_json")),
	CONSTRAINT "learner_profile_onboarding_status_check" CHECK("__new_learner_profile"."onboarding_status" in ('not_started', 'in_progress', 'completed')),
	CONSTRAINT "learner_profile_story_level_check" CHECK("__new_learner_profile"."story_level" in ('first-words', 'repeating-patterns', 'tiny-stories', 'early-a1'))
);
--> statement-breakpoint
INSERT INTO `__new_learner_profile`("id", "auth_user_id", "name", "age", "story_level", "answers_json", "skipped_question_keys_json", "questionnaire_version", "current_question_key", "onboarding_status", "last_skipped_at", "last_skipped_session_id", "completed_at", "created_at", "updated_at") SELECT "id", "auth_user_id", "name", "age", 'first-words', "answers_json", "skipped_question_keys_json", "questionnaire_version", "current_question_key", "onboarding_status", "last_skipped_at", "last_skipped_session_id", "completed_at", "created_at", "updated_at" FROM `learner_profile`;--> statement-breakpoint
DROP TABLE `learner_profile`;--> statement-breakpoint
ALTER TABLE `__new_learner_profile` RENAME TO `learner_profile`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `learner_profile_auth_user_id_unique` ON `learner_profile` (`auth_user_id`);--> statement-breakpoint
CREATE INDEX `learner_profile_questionnaire_status_idx` ON `learner_profile` (`questionnaire_version`,`onboarding_status`);
