CREATE TABLE `guardian_dub_consent` (
	`auth_user_id` text PRIMARY KEY NOT NULL,
	`consent_version` text NOT NULL,
	`grant_generation` text NOT NULL,
	`state` text NOT NULL,
	`granted_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`auth_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "guardian_dub_consent_state_check" CHECK("guardian_dub_consent"."state" in ('granted', 'revoking'))
);
