import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(unixepoch('subsecond') * 1000)`)
    .notNull();

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(unixepoch('subsecond') * 1000)`)
    .$onUpdate(() => new Date())
    .notNull();

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" })
      .default(false)
      .notNull(),
    image: text("image"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    isAnonymous: integer("is_anonymous", { mode: "boolean" })
      .default(false)
      .notNull(),
  },
  (table) => [uniqueIndex("user_email_unique").on(table.email)],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("session_token_unique").on(table.token),
    index("session_user_id_idx").on(table.userId),
  ],
);

export const guardianSessionUnlock = sqliteTable(
  "guardian_session_unlock",
  {
    sessionId: text("session_id")
      .primaryKey()
      .references(() => session.id, { onDelete: "cascade" }),
    unlockedAt: integer("unlocked_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("guardian_session_unlock_expires_at_idx").on(table.expiresAt),
  ],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    index("account_provider_account_idx").on(table.providerId, table.accountId),
  ],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const learnerProfile = sqliteTable(
  "learner_profile",
  {
    id: text("id").primaryKey(),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name"),
    privateMediaName: text("private_media_name").default("Learner").notNull(),
    nameKey: text("name_key"),
    age: integer("age"),
    storyLevel: text("story_level").default("first-words").notNull(),
    answersJson: text("answers_json")
      .default(
        '{"schemaVersion":2,"questionnaireVersion":2,"responses":{},"description":null}',
      )
      .notNull(),
    skippedQuestionKeysJson: text("skipped_question_keys_json")
      .default("[]")
      .notNull(),
    currentQuestionKey: text("current_question_key"),
    profileStatus: text("onboarding_status").default("not_started").notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    lessonRecordingConsentVersion: text("lesson_recording_consent_version"),
    lessonRecordingConsentAt: integer("lesson_recording_consent_at", {
      mode: "timestamp_ms",
    }),
    lessonRecordingGeneration: integer("lesson_recording_generation")
      .default(0)
      .notNull(),
    lessonRecordingCleanupBeforeGeneration: integer(
      "lesson_recording_cleanup_before_generation",
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("learner_profile_auth_user_id_idx").on(table.authUserId),
    uniqueIndex("learner_profile_user_name_key_unique").on(
      table.authUserId,
      table.nameKey,
    ),
    uniqueIndex("learner_profile_user_private_media_name_unique").on(
      table.authUserId,
      table.privateMediaName,
    ),
    check(
      "learner_profile_answers_json_check",
      sql`json_valid(${table.answersJson})`,
    ),
    check(
      "learner_profile_skipped_question_keys_json_check",
      sql`json_valid(${table.skippedQuestionKeysJson})`,
    ),
    check(
      "learner_profile_onboarding_status_check",
      sql`${table.profileStatus} in ('not_started', 'in_progress', 'completed')`,
    ),
    check(
      "learner_profile_story_level_check",
      sql`${table.storyLevel} in ('first-words', 'repeating-patterns', 'tiny-stories', 'early-a1')`,
    ),
  ],
);

export const learnerProfileDeletionTombstone = sqliteTable(
  "learner_profile_deletion_tombstone",
  {
    learnerProfileId: text("learner_profile_id").primaryKey(),
    userIdHash: text("user_id_hash").notNull(),
    privateMediaName: text("private_media_name").default("Learner").notNull(),
    generation: integer("generation").notNull(),
    requestedAt: integer("requested_at", { mode: "timestamp_ms" }).notNull(),
    storageKeysJson: text("storage_keys_json").default("[]").notNull(),
  },
  (table) => [
    index("learner_profile_deletion_tombstone_user_hash_idx").on(
      table.userIdHash,
    ),
    check(
      "learner_profile_deletion_tombstone_storage_keys_json_check",
      sql`json_valid(${table.storageKeysJson})`,
    ),
  ],
);

export const sessionLearnerSelection = sqliteTable(
  "session_learner_selection",
  {
    sessionId: text("session_id")
      .primaryKey()
      .references(() => session.id, { onDelete: "cascade" }),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    learnerProfileId: text("learner_profile_id")
      .notNull()
      .references(() => learnerProfile.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("session_learner_selection_auth_profile_idx").on(
      table.authUserId,
      table.learnerProfileId,
    ),
  ],
);

export const learnerDubConsent = sqliteTable(
  "learner_dub_consent",
  {
    learnerProfileId: text("learner_profile_id")
      .notNull()
      .references(() => learnerProfile.id, { onDelete: "cascade" }),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    consentVersion: text("consent_version").notNull(),
    grantGeneration: text("grant_generation").notNull(),
    state: text("state").notNull(),
    grantedAt: integer("granted_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.learnerProfileId, table.authUserId] }),
    check(
      "learner_dub_consent_state_check",
      sql`${table.state} in ('granted', 'revoking')`,
    ),
  ],
);

export const learnerSessionBypass = sqliteTable(
  "onboarding_learner_session_bypass",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    learnerProfileId: text("learner_profile_id")
      .notNull()
      .references(() => learnerProfile.id, { onDelete: "cascade" }),
    skippedAt: integer("skipped_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.learnerProfileId] }),
  ],
);

export const conversationSession = sqliteTable(
  "conversation_session",
  {
    id: text("id").primaryKey(),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    learnerProfileId: text("learner_profile_id")
      .notNull()
      .references(() => learnerProfile.id, { onDelete: "cascade" }),
    scenarioKey: text("scenario_key").notNull(),
    scenarioVersion: integer("scenario_version").notNull(),
    promptStyle: text("prompt_style"),
    roomName: text("room_name").notNull(),
    status: text("status").notNull(),
    finishReason: text("finish_reason"),
    controllerState: text("controller_state").default("{}").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" })
      .default(sql`(unixepoch('subsecond') * 1000)`)
      .notNull(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("conversation_session_room_name_unique").on(table.roomName),
    index("conversation_session_user_status_idx").on(
      table.authUserId,
      table.status,
    ),
    index("conversation_session_profile_status_idx").on(
      table.learnerProfileId,
      table.status,
    ),
    check(
      "conversation_session_scenario_key_check",
      sql`${table.scenarioKey} in ('onboarding', 'small-chat')`,
    ),
    check(
      "conversation_session_prompt_style_check",
      sql`(${table.scenarioKey} = 'onboarding' and ${table.promptStyle} is null) or (${table.scenarioKey} = 'small-chat' and ${table.promptStyle} is not null and ${table.promptStyle} in ('tiny-turns', 'gentle-guide', 'playful-pal'))`,
    ),
    check(
      "conversation_session_status_check",
      sql`${table.status} in ('starting', 'active', 'completed', 'stopped', 'disconnected', 'failed', 'abandoned')`,
    ),
    check(
      "conversation_session_controller_state_json_check",
      sql`json_valid(${table.controllerState})`,
    ),
  ],
);

export const conversationTurn = sqliteTable(
  "conversation_turn",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversationSession.id, { onDelete: "cascade" }),
    providerItemId: text("provider_item_id").notNull(),
    sequence: integer("sequence").notNull(),
    role: text("role").notNull(),
    text: text("text").notNull(),
    language: text("language"),
    inputMode: text("input_mode").notNull(),
    interrupted: integer("interrupted", { mode: "boolean" })
      .default(false)
      .notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("conversation_turn_provider_item_unique").on(
      table.conversationId,
      table.providerItemId,
    ),
    uniqueIndex("conversation_turn_sequence_unique").on(
      table.conversationId,
      table.sequence,
    ),
    check(
      "conversation_turn_role_check",
      sql`${table.role} in ('user', 'assistant')`,
    ),
    check(
      "conversation_turn_input_mode_check",
      sql`${table.inputMode} in ('voice', 'text')`,
    ),
  ],
);

export const accountDeletionTombstone = sqliteTable(
  "account_deletion_tombstone",
  {
    userIdHash: text("user_id_hash").primaryKey(),
    r2Prefix: text("r2_prefix").notNull(),
    requestedAt: integer("requested_at", { mode: "timestamp_ms" }).notNull(),
    learnerStorageIdentitiesJson: text("learner_storage_identities_json")
      .default("[]")
      .notNull(),
  },
  (table) => [
    uniqueIndex("account_deletion_tombstone_r2_prefix_unique").on(
      table.r2Prefix,
    ),
    check(
      "account_deletion_tombstone_learner_storage_identities_json_check",
      sql`json_valid(${table.learnerStorageIdentitiesJson})`,
    ),
  ],
);
