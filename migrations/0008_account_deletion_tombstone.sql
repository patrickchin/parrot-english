CREATE TABLE `account_deletion_tombstone` (
	`user_id_hash` text PRIMARY KEY NOT NULL,
	`r2_prefix` text NOT NULL,
	`requested_at` integer NOT NULL
);
