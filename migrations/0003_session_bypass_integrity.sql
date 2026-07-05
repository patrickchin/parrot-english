PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_onboarding_session_bypass` (
	`session_id` text PRIMARY KEY NOT NULL,
	`auth_user_id` text NOT NULL,
	`skipped_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`auth_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_onboarding_session_bypass`("session_id", "auth_user_id", "skipped_at")
SELECT `bypass`.`session_id`, `bypass`.`auth_user_id`, `bypass`.`skipped_at`
FROM `onboarding_session_bypass` AS `bypass`
INNER JOIN `session` AS `live_session`
	ON `live_session`.`id` = `bypass`.`session_id`
	AND `live_session`.`user_id` = `bypass`.`auth_user_id`;--> statement-breakpoint
DROP TABLE `onboarding_session_bypass`;--> statement-breakpoint
ALTER TABLE `__new_onboarding_session_bypass` RENAME TO `onboarding_session_bypass`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `onboarding_session_bypass_user_idx` ON `onboarding_session_bypass` (`auth_user_id`);
