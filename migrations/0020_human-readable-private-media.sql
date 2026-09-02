ALTER TABLE `learner_profile` ADD `private_media_name` text DEFAULT 'Learner' NOT NULL;--> statement-breakpoint
ALTER TABLE `learner_profile` ADD `name_key` text;--> statement-breakpoint
WITH `normalized_learner_name` AS (
	SELECT
		`id`,
		`auth_user_id`,
		coalesce(nullif(trim(`name`), ''), 'Learner') AS `base_name`,
		CASE
			WHEN nullif(trim(`name`), '') IS NULL THEN NULL
			ELSE lower(trim(`name`))
		END AS `normalized_name_key`,
		`created_at`
	FROM `learner_profile`
),
`ranked_learner_name` AS (
	SELECT
		`id`,
		`base_name`,
		`normalized_name_key`,
		row_number() OVER (
			PARTITION BY `auth_user_id`, lower(`base_name`)
			ORDER BY `created_at`, `id`
		) AS `name_position`
	FROM `normalized_learner_name`
)
UPDATE `learner_profile`
SET
	`private_media_name` = (
		SELECT CASE
			WHEN `name_position` = 1 THEN `base_name`
			ELSE `base_name` || ' (' || `name_position` || ')'
		END
		FROM `ranked_learner_name`
		WHERE `ranked_learner_name`.`id` = `learner_profile`.`id`
	),
	`name_key` = (
		SELECT `normalized_name_key`
		FROM `ranked_learner_name`
		WHERE `ranked_learner_name`.`id` = `learner_profile`.`id`
	);--> statement-breakpoint
CREATE UNIQUE INDEX `learner_profile_user_name_key_unique` ON `learner_profile` (`auth_user_id`,`name_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `learner_profile_user_private_media_name_unique` ON `learner_profile` (`auth_user_id`,`private_media_name`);--> statement-breakpoint
ALTER TABLE `learner_profile_deletion_tombstone` ADD `private_media_name` text DEFAULT 'Learner' NOT NULL;--> statement-breakpoint
UPDATE `learner_profile_deletion_tombstone`
SET `private_media_name` = coalesce(
	(
		SELECT `private_media_name`
		FROM `learner_profile`
		WHERE `learner_profile`.`id` = `learner_profile_deletion_tombstone`.`learner_profile_id`
	),
	'Learner'
);--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_tombstone_r2_prefix_unique` ON `account_deletion_tombstone` (`r2_prefix`);--> statement-breakpoint
DELETE FROM `learner_dub_consent`
WHERE EXISTS (
	SELECT 1
	FROM `learner_profile`
	WHERE `learner_profile`.`id` = `learner_dub_consent`.`learner_profile_id`
		AND `learner_profile`.`auth_user_id` = `learner_dub_consent`.`auth_user_id`
		AND `learner_profile`.`legacy_storage_owner` = 1
)
	AND NOT EXISTS (
		SELECT 1
		FROM `guardian_dub_consent`
		WHERE `guardian_dub_consent`.`auth_user_id` = `learner_dub_consent`.`auth_user_id`
	);--> statement-breakpoint
INSERT INTO `learner_dub_consent` (
	`learner_profile_id`,
	`auth_user_id`,
	`consent_version`,
	`grant_generation`,
	`state`,
	`granted_at`,
	`updated_at`
)
SELECT
	`learner_profile`.`id`,
	`consent`.`auth_user_id`,
	`consent`.`consent_version`,
	`consent`.`grant_generation`,
	`consent`.`state`,
	`consent`.`granted_at`,
	`consent`.`updated_at`
FROM `guardian_dub_consent` AS `consent`
INNER JOIN `learner_profile`
	ON `learner_profile`.`auth_user_id` = `consent`.`auth_user_id`
	AND `learner_profile`.`legacy_storage_owner` = 1
WHERE true
ON CONFLICT (`learner_profile_id`, `auth_user_id`) DO UPDATE SET
	`consent_version` = excluded.`consent_version`,
	`grant_generation` = excluded.`grant_generation`,
	`state` = excluded.`state`,
	`granted_at` = excluded.`granted_at`,
	`updated_at` = excluded.`updated_at`;
