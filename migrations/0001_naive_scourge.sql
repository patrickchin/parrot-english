CREATE TABLE `learner_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_user_id` text NOT NULL,
	`name` text,
	`age` integer,
	`answers_json` text DEFAULT '{}' NOT NULL,
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
	CONSTRAINT "learner_profile_answers_json_check" CHECK(json_valid("learner_profile"."answers_json")),
	CONSTRAINT "learner_profile_onboarding_status_check" CHECK("learner_profile"."onboarding_status" in ('not_started', 'in_progress', 'completed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learner_profile_auth_user_id_unique` ON `learner_profile` (`auth_user_id`);--> statement-breakpoint
CREATE INDEX `learner_profile_questionnaire_status_idx` ON `learner_profile` (`questionnaire_version`,`onboarding_status`);--> statement-breakpoint
CREATE TABLE `questionnaire` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`activated_at` integer,
	CONSTRAINT "questionnaire_status_check" CHECK("questionnaire"."status" in ('draft', 'active', 'inactive'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questionnaire_version_unique` ON `questionnaire` (`version`);--> statement-breakpoint
CREATE INDEX `questionnaire_status_idx` ON `questionnaire` (`status`);--> statement-breakpoint
CREATE TABLE `questionnaire_question` (
	`id` text PRIMARY KEY NOT NULL,
	`questionnaire_id` text NOT NULL,
	`answer_key` text NOT NULL,
	`position` integer NOT NULL,
	`prompt_en` text NOT NULL,
	`prompt_zh` text,
	`answer_type` text NOT NULL,
	`cardinality` text NOT NULL,
	`required` integer NOT NULL,
	`options_json` text,
	`validation_json` text,
	`branching_json` text,
	`audio_id` text NOT NULL,
	FOREIGN KEY (`questionnaire_id`) REFERENCES `questionnaire`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "questionnaire_question_answer_type_check" CHECK("questionnaire_question"."answer_type" in ('text', 'number', 'choice')),
	CONSTRAINT "questionnaire_question_cardinality_check" CHECK("questionnaire_question"."cardinality" in ('scalar', 'array')),
	CONSTRAINT "questionnaire_question_options_json_check" CHECK("questionnaire_question"."options_json" is null or json_valid("questionnaire_question"."options_json")),
	CONSTRAINT "questionnaire_question_validation_json_check" CHECK("questionnaire_question"."validation_json" is null or json_valid("questionnaire_question"."validation_json")),
	CONSTRAINT "questionnaire_question_branching_json_check" CHECK("questionnaire_question"."branching_json" is null or json_valid("questionnaire_question"."branching_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questionnaire_question_key_unique` ON `questionnaire_question` (`questionnaire_id`,`answer_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `questionnaire_question_position_unique` ON `questionnaire_question` (`questionnaire_id`,`position`);