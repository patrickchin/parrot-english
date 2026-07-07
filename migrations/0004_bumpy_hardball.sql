CREATE TABLE `conversation_fact` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`fact_key` text NOT NULL,
	`value_json` text NOT NULL,
	`source_turn_ids` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversation_session`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "conversation_fact_value_json_check" CHECK(json_valid("conversation_fact"."value_json")),
	CONSTRAINT "conversation_fact_source_turn_ids_json_check" CHECK(json_valid("conversation_fact"."source_turn_ids")),
	CONSTRAINT "conversation_fact_status_check" CHECK("conversation_fact"."status" in ('candidate', 'accepted', 'edited', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX `conversation_fact_session_status_idx` ON `conversation_fact` (`conversation_id`,`status`);--> statement-breakpoint
CREATE TABLE `conversation_session` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_user_id` text NOT NULL,
	`scenario_key` text NOT NULL,
	`scenario_version` integer NOT NULL,
	`room_name` text NOT NULL,
	`status` text NOT NULL,
	`finish_reason` text,
	`controller_state` text DEFAULT '{}' NOT NULL,
	`started_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`ended_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`auth_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "conversation_session_status_check" CHECK("conversation_session"."status" in ('starting', 'active', 'completed', 'stopped', 'disconnected', 'failed', 'abandoned')),
	CONSTRAINT "conversation_session_controller_state_json_check" CHECK(json_valid("conversation_session"."controller_state"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_session_room_name_unique` ON `conversation_session` (`room_name`);--> statement-breakpoint
CREATE INDEX `conversation_session_user_status_idx` ON `conversation_session` (`auth_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `conversation_turn` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`provider_item_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`language` text,
	`input_mode` text NOT NULL,
	`interrupted` integer DEFAULT false NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversation_session`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "conversation_turn_role_check" CHECK("conversation_turn"."role" in ('user', 'assistant')),
	CONSTRAINT "conversation_turn_input_mode_check" CHECK("conversation_turn"."input_mode" in ('voice', 'text'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_turn_provider_item_unique` ON `conversation_turn` (`conversation_id`,`provider_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_turn_sequence_unique` ON `conversation_turn` (`conversation_id`,`sequence`);