import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
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
  },
  (table) => [uniqueIndex("user_email_unique").on(table.email)]
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
  ]
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
    index("account_provider_account_idx").on(
      table.providerId,
      table.accountId
    ),
  ]
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
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const questionnaire = sqliteTable(
  "questionnaire",
  {
    id: text("id").primaryKey(),
    version: integer("version").notNull(),
    status: text("status").notNull(),
    definitionHash: text("definition_hash"),
    createdAt: createdAt(),
    activatedAt: integer("activated_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("questionnaire_version_unique").on(table.version),
    index("questionnaire_status_idx").on(table.status),
    check(
      "questionnaire_status_check",
      sql`${table.status} in ('draft', 'active', 'inactive')`
    ),
  ]
);

export const questionnaireQuestion = sqliteTable(
  "questionnaire_question",
  {
    id: text("id").primaryKey(),
    questionnaireId: text("questionnaire_id")
      .notNull()
      .references(() => questionnaire.id, { onDelete: "cascade" }),
    answerKey: text("answer_key").notNull(),
    position: integer("position").notNull(),
    promptEn: text("prompt_en").notNull(),
    promptZh: text("prompt_zh"),
    answerType: text("answer_type").notNull(),
    cardinality: text("cardinality").notNull(),
    required: integer("required", { mode: "boolean" }).notNull(),
    optionsJson: text("options_json"),
    validationJson: text("validation_json"),
    branchingJson: text("branching_json"),
    audioId: text("audio_id").notNull(),
  },
  (table) => [
    uniqueIndex("questionnaire_question_key_unique").on(
      table.questionnaireId,
      table.answerKey
    ),
    uniqueIndex("questionnaire_question_position_unique").on(
      table.questionnaireId,
      table.position
    ),
    check(
      "questionnaire_question_answer_type_check",
      sql`${table.answerType} in ('text', 'number', 'choice')`
    ),
    check(
      "questionnaire_question_cardinality_check",
      sql`${table.cardinality} in ('scalar', 'array')`
    ),
    check(
      "questionnaire_question_options_json_check",
      sql`${table.optionsJson} is null or json_valid(${table.optionsJson})`
    ),
    check(
      "questionnaire_question_validation_json_check",
      sql`${table.validationJson} is null or json_valid(${table.validationJson})`
    ),
    check(
      "questionnaire_question_branching_json_check",
      sql`${table.branchingJson} is null or json_valid(${table.branchingJson})`
    ),
  ]
);

export const learnerProfile = sqliteTable(
  "learner_profile",
  {
    id: text("id").primaryKey(),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name"),
    age: integer("age"),
    answersJson: text("answers_json").default("{}").notNull(),
    skippedQuestionKeysJson: text("skipped_question_keys_json")
      .default("[]")
      .notNull(),
    questionnaireVersion: integer("questionnaire_version").references(
      () => questionnaire.version
    ),
    currentQuestionKey: text("current_question_key"),
    profileStatus: text("onboarding_status")
      .default("not_started")
      .notNull(),
    lastSkippedAt: integer("last_skipped_at", { mode: "timestamp_ms" }),
    lastSkippedSessionId: text("last_skipped_session_id"),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("learner_profile_auth_user_id_unique").on(table.authUserId),
    index("learner_profile_questionnaire_status_idx").on(
      table.questionnaireVersion,
      table.profileStatus
    ),
    check(
      "learner_profile_answers_json_check",
      sql`json_valid(${table.answersJson})`
    ),
    check(
      "learner_profile_skipped_question_keys_json_check",
      sql`json_valid(${table.skippedQuestionKeysJson})`
    ),
    check(
      "learner_profile_onboarding_status_check",
      sql`${table.profileStatus} in ('not_started', 'in_progress', 'completed')`
    ),
  ]
);

export const profileSessionBypass = sqliteTable(
  "onboarding_session_bypass",
  {
    sessionId: text("session_id")
      .primaryKey()
      .references(() => session.id, { onDelete: "cascade" }),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    skippedAt: integer("skipped_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("onboarding_session_bypass_user_idx").on(table.authUserId),
  ]
);

export const learnerLesson = sqliteTable(
  "learner_lesson",
  {
    id: text("id").primaryKey(),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    lessonJson: text("lesson_json").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("learner_lesson_user_updated_idx").on(
      table.authUserId,
      table.updatedAt,
    ),
    check(
      "learner_lesson_source_check",
      sql`${table.source} in ('generated', 'uploaded')`,
    ),
    check(
      "learner_lesson_json_check",
      sql`json_valid(${table.lessonJson})`,
    ),
  ],
);

export const conversationSession = sqliteTable(
  "conversation_session",
  {
    id: text("id").primaryKey(),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scenarioKey: text("scenario_key").notNull(),
    scenarioVersion: integer("scenario_version").notNull(),
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
      table.status
    ),
    check(
      "conversation_session_status_check",
      sql`${table.status} in ('starting', 'active', 'completed', 'stopped', 'disconnected', 'failed', 'abandoned')`
    ),
    check(
      "conversation_session_controller_state_json_check",
      sql`json_valid(${table.controllerState})`
    ),
  ]
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
      table.providerItemId
    ),
    uniqueIndex("conversation_turn_sequence_unique").on(
      table.conversationId,
      table.sequence
    ),
    check(
      "conversation_turn_role_check",
      sql`${table.role} in ('user', 'assistant')`
    ),
    check(
      "conversation_turn_input_mode_check",
      sql`${table.inputMode} in ('voice', 'text')`
    ),
  ]
);

export const conversationFact = sqliteTable(
  "conversation_fact",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversationSession.id, { onDelete: "cascade" }),
    factKey: text("fact_key").notNull(),
    valueJson: text("value_json").notNull(),
    sourceTurnIds: text("source_turn_ids").default("[]").notNull(),
    status: text("status").default("candidate").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("conversation_fact_session_status_idx").on(
      table.conversationId,
      table.status
    ),
    check(
      "conversation_fact_value_json_check",
      sql`json_valid(${table.valueJson})`
    ),
    check(
      "conversation_fact_source_turn_ids_json_check",
      sql`json_valid(${table.sourceTurnIds})`
    ),
    check(
      "conversation_fact_status_check",
      sql`${table.status} in ('candidate', 'accepted', 'edited', 'rejected')`
    ),
  ]
);

export const userRelations = relations(user, ({ many, one }) => ({
  accounts: many(account),
  conversationSessions: many(conversationSession),
  learnerProfile: one(learnerProfile),
  learnerLessons: many(learnerLesson),
  profileSessionBypasses: many(profileSessionBypass),
  sessions: many(session),
}));

export const learnerLessonRelations = relations(
  learnerLesson,
  ({ one }) => ({
    user: one(user, {
      fields: [learnerLesson.authUserId],
      references: [user.id],
    }),
  }),
);

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const learnerProfileRelations = relations(
  learnerProfile,
  ({ one }) => ({
    user: one(user, {
      fields: [learnerProfile.authUserId],
      references: [user.id],
    }),
    questionnaire: one(questionnaire, {
      fields: [learnerProfile.questionnaireVersion],
      references: [questionnaire.version],
    }),
  })
);

export const profileSessionBypassRelations = relations(
  profileSessionBypass,
  ({ one }) => ({
    session: one(session, {
      fields: [profileSessionBypass.sessionId],
      references: [session.id],
    }),
    user: one(user, {
      fields: [profileSessionBypass.authUserId],
      references: [user.id],
    }),
  })
);

export const conversationSessionRelations = relations(
  conversationSession,
  ({ many, one }) => ({
    facts: many(conversationFact),
    turns: many(conversationTurn),
    user: one(user, {
      fields: [conversationSession.authUserId],
      references: [user.id],
    }),
  })
);

export const conversationTurnRelations = relations(
  conversationTurn,
  ({ one }) => ({
    conversation: one(conversationSession, {
      fields: [conversationTurn.conversationId],
      references: [conversationSession.id],
    }),
  })
);

export const conversationFactRelations = relations(
  conversationFact,
  ({ one }) => ({
    conversation: one(conversationSession, {
      fields: [conversationFact.conversationId],
      references: [conversationSession.id],
    }),
  })
);

export const questionnaireRelations = relations(
  questionnaire,
  ({ many }) => ({
    learnerProfiles: many(learnerProfile),
    questions: many(questionnaireQuestion),
  })
);

export const questionnaireQuestionRelations = relations(
  questionnaireQuestion,
  ({ one }) => ({
    questionnaire: one(questionnaire, {
      fields: [questionnaireQuestion.questionnaireId],
      references: [questionnaire.id],
    }),
  })
);
