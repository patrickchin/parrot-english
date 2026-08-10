CREATE TABLE `personalized_story_art_generation_lease` (
	`auth_user_id` text NOT NULL,
	`story_id` text NOT NULL,
	`generation_token` text NOT NULL,
	`candidate_r2_object_key` text,
	`previous_r2_object_key` text,
	`lease_expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	PRIMARY KEY(`auth_user_id`, `story_id`),
	FOREIGN KEY (`auth_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
