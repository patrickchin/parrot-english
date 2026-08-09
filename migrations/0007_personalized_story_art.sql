CREATE TABLE `personalized_story_art` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_user_id` text NOT NULL,
	`story_id` text NOT NULL,
	`status` text NOT NULL,
	`r2_object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`guardian_consent_version` text NOT NULL,
	`guardian_consent_at` integer NOT NULL,
	`provider` text NOT NULL,
	`prompt_version` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`auth_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "personalized_story_art_status_check" CHECK("personalized_story_art"."status" in ('ready', 'deleting')),
	CONSTRAINT "personalized_story_art_content_type_check" CHECK("personalized_story_art"."content_type" in ('image/jpeg', 'image/png', 'image/webp'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `personalized_story_art_user_story_unique` ON `personalized_story_art` (`auth_user_id`,`story_id`);
