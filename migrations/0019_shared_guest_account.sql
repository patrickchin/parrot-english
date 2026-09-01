INSERT INTO `user` (`id`, `name`, `email`, `email_verified`, `is_anonymous`)
VALUES (
  'shared-guest-user',
  'Guest',
  'shared-guest@parrotbook.invalid',
  0,
  0
)
ON CONFLICT (`id`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `learner_profile` (
  `id`,
  `auth_user_id`,
  `legacy_storage_owner`,
  `name`,
  `story_level`,
  `answers_json`,
  `skipped_question_keys_json`,
  `onboarding_status`,
  `completed_at`
)
VALUES (
  'shared-guest-sam',
  'shared-guest-user',
  1,
  'Sam',
  'first-words',
  '{"schemaVersion":2,"questionnaireVersion":2,"responses":{},"legacyAnswers":null,"description":null}',
  '[]',
  'completed',
  (unixepoch('subsecond') * 1000)
)
ON CONFLICT (`id`) DO NOTHING;
