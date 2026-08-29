CREATE TABLE `learner_profile_deletion_tombstone` (
	`learner_profile_id` text PRIMARY KEY NOT NULL,
	`user_id_hash` text NOT NULL,
	`legacy_storage_owner` integer NOT NULL,
	`generation` integer NOT NULL,
	`requested_at` integer NOT NULL,
	`storage_keys_json` text DEFAULT '[]' NOT NULL,
	CONSTRAINT "learner_profile_deletion_tombstone_legacy_owner_check" CHECK("learner_profile_deletion_tombstone"."legacy_storage_owner" in (0, 1)),
	CONSTRAINT "learner_profile_deletion_tombstone_storage_keys_json_check" CHECK(json_valid("learner_profile_deletion_tombstone"."storage_keys_json"))
);
--> statement-breakpoint
CREATE INDEX `learner_profile_deletion_tombstone_user_hash_idx` ON `learner_profile_deletion_tombstone` (`user_id_hash`);--> statement-breakpoint
CREATE TABLE `learner_selection_required` (
	`session_id` text PRIMARY KEY NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
