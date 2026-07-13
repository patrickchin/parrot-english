CREATE TABLE `learner_lesson` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_user_id` text NOT NULL,
	`source` text NOT NULL,
	`lesson_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`auth_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "learner_lesson_source_check" CHECK("learner_lesson"."source" in ('generated', 'uploaded')),
	CONSTRAINT "learner_lesson_json_check" CHECK(json_valid("learner_lesson"."lesson_json"))
);
--> statement-breakpoint
CREATE INDEX `learner_lesson_user_updated_idx` ON `learner_lesson` (`auth_user_id`,`updated_at`);