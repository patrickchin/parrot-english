import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  conversationSession,
  conversationTurn,
  learnerProfile,
} from "../src/db/schema.ts";
import { createLearnerProfileConversationState } from "../lib/conversation-scenario.js";
import {
  isConversationPurpose,
  updatesLearnerProfile,
} from "../lib/conversation-purpose.ts";
import {
  ensureV2Profile,
  readV2Answers,
} from "../lib/learner-profile-responses.js";
import type { Database } from "./database.ts";
import type { LearnerProfileIdentity } from "./learner-profile.ts";
import { LEARNER_PROFILE_QUESTIONNAIRE } from "./learner-profile-definition.ts";
import { createLearnerProfileRepository } from "./learner-profile-repository.ts";

const MAX_CONTROLLER_STATE_BYTES = 16 * 1024;

export class ConversationRepositoryError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string) {
    super(code);
    this.name = "ConversationRepositoryError";
    this.status = status;
    this.code = code;
  }
}

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

function boundedString(value: unknown, max: number, code = "invalid_payload") {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new ConversationRepositoryError(400, code);
  }
  return value.trim();
}

function parseJson(value: string, code = "invalid_stored_data") {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ConversationRepositoryError(500, code);
  }
}

function serializeJson(value: unknown, maxBytes: number, code: string) {
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > maxBytes) {
    throw new ConversationRepositoryError(400, code);
  }
  return serialized;
}

export function createConversationRepository(
  database: Database,
  {
    createId = () => crypto.randomUUID(),
    now = () => new Date(),
  }: RepositoryOptions = {},
) {
  async function findConversation(conversationId: string) {
    const [conversation] = await database
      .select()
      .from(conversationSession)
      .where(eq(conversationSession.id, conversationId))
      .limit(1);
    return conversation ?? null;
  }

  async function createConversation(
    identity: LearnerProfileIdentity,
    scenario: { key: string; version: number },
  ) {
    const [active] = await database
      .select()
      .from(conversationSession)
      .where(
        and(
          eq(conversationSession.authUserId, identity.userId),
          eq(conversationSession.scenarioKey, scenario.key),
          inArray(conversationSession.status, ["starting", "active"]),
        ),
      )
      .orderBy(desc(conversationSession.updatedAt))
      .limit(1);
    if (active) return active;

    const id = createId();
    const timestamp = now();
    const roomName = `conversation-${id}`;
    const [storedProfile] = await database
      .select()
      .from(learnerProfile)
      .where(eq(learnerProfile.authUserId, identity.userId))
      .limit(1);
    let controllerState = createLearnerProfileConversationState();
    if (storedProfile) {
      const readableProfile = ensureV2Profile(
        storedProfile,
        LEARNER_PROFILE_QUESTIONNAIRE,
        { forProfileEdit: true },
      );
      const answers = readV2Answers(readableProfile);
      const completed = storedProfile.profileStatus === "completed";
      controllerState = createLearnerProfileConversationState({
        profileName:
          completed || Object.hasOwn(answers.responses, "name")
            ? storedProfile.name
            : null,
        profileAge:
          completed || Object.hasOwn(answers.responses, "age")
            ? storedProfile.age
            : null,
        profileSummary:
          typeof answers.description === "string" ? answers.description : "",
      });
    }
    await database.insert(conversationSession).values({
      id,
      authUserId: identity.userId,
      scenarioKey: scenario.key,
      scenarioVersion: scenario.version,
      roomName,
      status: "starting",
      controllerState: JSON.stringify(controllerState),
      startedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return (await findConversation(id))!;
  }

  async function loadOwnedConversation(conversationId: string, userId: string) {
    const [conversation] = await database
      .select()
      .from(conversationSession)
      .where(
        and(
          eq(conversationSession.id, conversationId),
          eq(conversationSession.authUserId, userId),
        ),
      )
      .limit(1);
    if (!conversation) return null;
    const turns = await database
      .select()
      .from(conversationTurn)
      .where(eq(conversationTurn.conversationId, conversationId))
      .orderBy(asc(conversationTurn.sequence));
    return { conversation, turns };
  }

  async function appendTurn(
    conversationId: string,
    input: {
      providerItemId: unknown;
      sequence: unknown;
      role: unknown;
      text: unknown;
      language?: unknown;
      inputMode: unknown;
      interrupted?: unknown;
      startedAt?: unknown;
      endedAt?: unknown;
    },
  ) {
    if (!(await findConversation(conversationId))) {
      throw new ConversationRepositoryError(404, "not_found");
    }
    const providerItemId = boundedString(input.providerItemId, 200, "invalid_turn");
    const text = boundedString(input.text, 4_000, "invalid_turn");
    if (!Number.isInteger(input.sequence) || (input.sequence as number) < 0) {
      throw new ConversationRepositoryError(400, "invalid_turn");
    }
    if (input.role !== "user" && input.role !== "assistant") {
      throw new ConversationRepositoryError(400, "invalid_turn");
    }
    if (input.inputMode !== "voice" && input.inputMode !== "text") {
      throw new ConversationRepositoryError(400, "invalid_turn");
    }
    const [existingProvider] = await database
      .select()
      .from(conversationTurn)
      .where(
        and(
          eq(conversationTurn.conversationId, conversationId),
          eq(conversationTurn.providerItemId, providerItemId),
        ),
      )
      .limit(1);
    if (existingProvider) return { created: false, turn: existingProvider };
    const [existingSequence] = await database
      .select()
      .from(conversationTurn)
      .where(
        and(
          eq(conversationTurn.conversationId, conversationId),
          eq(conversationTurn.sequence, input.sequence as number),
        ),
      )
      .limit(1);
    if (existingSequence) {
      throw new ConversationRepositoryError(409, "sequence_conflict");
    }
    const timestamp = now();
    const id = createId();
    await database.batch([
      database.insert(conversationTurn).values({
        id,
        conversationId,
        providerItemId,
        sequence: input.sequence as number,
        role: input.role,
        text,
        language:
          input.language === undefined || input.language === null
            ? null
            : boundedString(input.language, 16, "invalid_turn"),
        inputMode: input.inputMode,
        interrupted: input.interrupted === true,
        startedAt:
          typeof input.startedAt === "number" ? new Date(input.startedAt) : null,
        endedAt:
          typeof input.endedAt === "number" ? new Date(input.endedAt) : null,
        createdAt: timestamp,
      }),
      database
        .update(conversationSession)
        .set({ status: "active", updatedAt: timestamp })
        .where(
          and(
            eq(conversationSession.id, conversationId),
            inArray(conversationSession.status, ["starting", "active"]),
          ),
        ),
    ] as const);
    const [turn] = await database
      .select()
      .from(conversationTurn)
      .where(eq(conversationTurn.id, id))
      .limit(1);
    return { created: true, turn };
  }

  async function updateControllerState(
    conversationId: string,
    controllerState: unknown,
  ) {
    if (!(await findConversation(conversationId))) {
      throw new ConversationRepositoryError(404, "not_found");
    }
    const serializedState = serializeJson(
      controllerState,
      MAX_CONTROLLER_STATE_BYTES,
      "invalid_controller_state",
    );
    await database
      .update(conversationSession)
      .set({ controllerState: serializedState, updatedAt: now() })
      .where(eq(conversationSession.id, conversationId));
  }

  async function endConversation(
    conversationId: string,
    status: "completed" | "stopped" | "disconnected" | "failed" | "abandoned",
    finishReason: string,
  ) {
    if (!(await findConversation(conversationId))) {
      throw new ConversationRepositoryError(404, "not_found");
    }
    const timestamp = now();
    await database
      .update(conversationSession)
      .set({
        status,
        finishReason: boundedString(finishReason, 120),
        endedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(conversationSession.id, conversationId));
    return (await findConversation(conversationId))!;
  }

  async function finalizeConversation(
    conversationId: string,
    identity: LearnerProfileIdentity,
  ) {
    const owned = await loadOwnedConversation(conversationId, identity.userId);
    if (!owned) throw new ConversationRepositoryError(404, "not_found");
    if (!isConversationPurpose(owned.conversation.scenarioKey)) {
      throw new ConversationRepositoryError(500, "invalid_stored_data");
    }
    if (!updatesLearnerProfile(owned.conversation.scenarioKey)) {
      const timestamp = now();
      await database
        .update(conversationSession)
        .set({
          status: "completed",
          finishReason: owned.conversation.finishReason ?? "chat_finished",
          endedAt: owned.conversation.endedAt ?? timestamp,
          updatedAt: timestamp,
        })
        .where(eq(conversationSession.id, conversationId));
      return {
        conversationId,
        profileCompleted: false,
        bypassed: false,
      };
    }
    const storedState = parseJson(owned.conversation.controllerState);
    if (
      storedState === null ||
      typeof storedState !== "object" ||
      Array.isArray(storedState)
    ) {
      throw new ConversationRepositoryError(500, "invalid_stored_data");
    }
    const controllerState = storedState as Record<string, unknown>;
    const summaryValue = controllerState.profileSummary;
    if (summaryValue !== undefined && typeof summaryValue !== "string") {
      throw new ConversationRepositoryError(400, "invalid_review");
    }
    const profileSummary = summaryValue?.trim()
      ? boundedString(summaryValue, 2_000, "invalid_review")
      : null;
    const learnedName = controllerState.learnedName === true;
    const learnedAge = controllerState.learnedAge === true;
    const profileName = learnedName
      ? boundedString(controllerState.profileName, 120, "invalid_review")
      : null;
    const profileAge = controllerState.profileAge;
    if (
      learnedAge &&
      (!Number.isSafeInteger(profileAge) || (profileAge as number) < 0)
    ) {
      throw new ConversationRepositoryError(400, "invalid_review");
    }
    const profileCompleted = Boolean(
      profileSummary &&
        learnedName &&
        learnedAge &&
        profileName &&
        Number.isSafeInteger(profileAge),
    );
    const profileRepository = createLearnerProfileRepository(database, { createId, now });
    const profile = await profileRepository.ensureProfile(identity);
    const readableProfile = ensureV2Profile(
      profile,
      LEARNER_PROFILE_QUESTIONNAIRE,
      { forProfileEdit: true },
    );
    const answers = readV2Answers(readableProfile);
    const answersJson = profileSummary
      ? JSON.stringify({ ...answers, description: profileSummary })
      : readableProfile.answersJson;
    const timestamp = now();
    const sessionUpdate = database
      .update(conversationSession)
      .set({
        controllerState: serializeJson(
          profileSummary
            ? { ...controllerState, profileSummary }
            : controllerState,
          MAX_CONTROLLER_STATE_BYTES,
          "invalid_controller_state",
        ),
        status: "completed",
        finishReason: owned.conversation.finishReason ?? "reviewed",
        endedAt: owned.conversation.endedAt ?? timestamp,
        updatedAt: timestamp,
      })
      .where(eq(conversationSession.id, conversationId));
    if (profileCompleted) {
      const profileUpdate = database
        .update(learnerProfile)
        .set({
          name: profileName,
          age: profileAge as number,
          answersJson,
          profileStatus: "completed",
          currentQuestionKey: null,
          completedAt: timestamp,
          updatedAt: timestamp,
        })
        .where(eq(learnerProfile.id, profile.id));
      await database.batch([profileUpdate, sessionUpdate] as const);
    } else {
      const profileUpdate = database
        .update(learnerProfile)
        .set({
          ...(profileSummary && profileName ? { name: profileName } : {}),
          ...(profileSummary && Number.isSafeInteger(profileAge)
            ? { age: profileAge as number }
            : {}),
          ...(profileSummary ? { answersJson } : {}),
          updatedAt: timestamp,
        })
        .where(eq(learnerProfile.id, profile.id));
      await database.batch([profileUpdate, sessionUpdate] as const);
      await profileRepository.skipSession(identity);
    }
    return {
      conversationId,
      profileCompleted,
      bypassed: !profileCompleted,
    };
  }

  return {
    appendTurn,
    createConversation,
    endConversation,
    findConversation,
    finalizeConversation,
    loadOwnedConversation,
    updateControllerState,
  };
}
