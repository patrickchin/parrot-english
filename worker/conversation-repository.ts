import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  conversationFact,
  conversationSession,
  conversationTurn,
  learnerProfile,
} from "../src/db/schema.ts";
import {
  createOnboardingConversationState,
  validateCandidateFacts,
} from "../lib/conversation-scenario.js";
import type { Database } from "./database.ts";
import type { OnboardingIdentity } from "./onboarding.ts";
import { createOnboardingRepository } from "./onboarding-repository.ts";

const MAX_CONTROLLER_STATE_BYTES = 16 * 1024;
const MAX_FACTS = 5;

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

type CandidateFact = {
  id?: string;
  key: "name" | "age" | "interest";
  value: unknown;
  topic?: unknown;
  sourceTurnIds?: unknown;
};

type ReviewDecision = {
  factId: string;
  status: "accepted" | "edited" | "rejected";
  value?: unknown;
  topic?: unknown;
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

function normalizeCandidate(candidate: CandidateFact) {
  const key = candidate?.key;
  const normalized = validateCandidateFacts(createOnboardingConversationState(), [
    key === "interest"
      ? { key, topic: candidate.topic, value: candidate.value }
      : { key, value: candidate.value },
  ])[0] as { key: "name" | "age" | "interest"; value: string | number; topic?: string };
  const sourceTurnIds = Array.isArray(candidate.sourceTurnIds)
    ? candidate.sourceTurnIds.map((id) => boundedString(id, 200))
    : [];
  if (sourceTurnIds.length > 10) {
    throw new ConversationRepositoryError(400, "invalid_facts");
  }
  return { ...normalized, sourceTurnIds };
}

function factValue(fact: { valueJson: string }) {
  const parsed = parseJson(fact.valueJson);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConversationRepositoryError(500, "invalid_stored_data");
  }
  return parsed as { value?: unknown; topic?: unknown };
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
    identity: OnboardingIdentity,
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
    const controllerState = createOnboardingConversationState();
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
    const facts = await database
      .select()
      .from(conversationFact)
      .where(eq(conversationFact.conversationId, conversationId))
      .orderBy(asc(conversationFact.createdAt));
    return { conversation, facts, turns };
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

  async function upsertCandidates(
    conversationId: string,
    candidates: CandidateFact[],
    controllerState: unknown,
  ) {
    if (!(await findConversation(conversationId))) {
      throw new ConversationRepositoryError(404, "not_found");
    }
    if (!Array.isArray(candidates) || candidates.length > MAX_FACTS) {
      throw new ConversationRepositoryError(400, "invalid_facts");
    }
    const serializedState = serializeJson(
      controllerState,
      MAX_CONTROLLER_STATE_BYTES,
      "invalid_controller_state",
    );
    const normalized = candidates.map((candidate) => ({
      id: candidate.id ? boundedString(candidate.id, 200, "invalid_facts") : createId(),
      fact: normalizeCandidate(candidate),
    }));
    const existing = await database
      .select()
      .from(conversationFact)
      .where(eq(conversationFact.conversationId, conversationId));
    const replacedIds = new Set(normalized.map(({ id }) => id));
    const interestCount =
      existing.filter(
        (fact) => fact.factKey === "interest" && !replacedIds.has(fact.id),
      ).length + normalized.filter(({ fact }) => fact.key === "interest").length;
    if (interestCount > 3) {
      throw new ConversationRepositoryError(400, "invalid_facts");
    }
    for (const { id } of normalized) {
      const [anyFact] = await database
        .select()
        .from(conversationFact)
        .where(eq(conversationFact.id, id))
        .limit(1);
      if (anyFact && anyFact.conversationId !== conversationId) {
        throw new ConversationRepositoryError(409, "fact_conflict");
      }
    }
    const timestamp = now();
    const queries = normalized.map(({ id, fact }) =>
      database
        .insert(conversationFact)
        .values({
          id,
          conversationId,
          factKey: fact.key,
          valueJson: JSON.stringify({
            value: fact.value,
            ...(fact.key === "interest" ? { topic: fact.topic } : {}),
          }),
          sourceTurnIds: JSON.stringify(fact.sourceTurnIds),
          status: "candidate",
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: conversationFact.id,
          set: {
            factKey: fact.key,
            valueJson: JSON.stringify({
              value: fact.value,
              ...(fact.key === "interest" ? { topic: fact.topic } : {}),
            }),
            sourceTurnIds: JSON.stringify(fact.sourceTurnIds),
            status: "candidate",
            updatedAt: timestamp,
          },
        }),
    );
    const controllerUpdate = database
      .update(conversationSession)
      .set({ controllerState: serializedState, updatedAt: timestamp })
      .where(eq(conversationSession.id, conversationId));
    await database.batch(
      [...queries, controllerUpdate] as unknown as Parameters<
        typeof database.batch
      >[0],
    );
    return normalized.map(({ id }) => id);
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

  async function reviewConversation(
    conversationId: string,
    identity: OnboardingIdentity,
    decisions: ReviewDecision[],
  ) {
    const owned = await loadOwnedConversation(conversationId, identity.userId);
    if (!owned) throw new ConversationRepositoryError(404, "not_found");
    if (!Array.isArray(decisions) || decisions.length > MAX_FACTS) {
      throw new ConversationRepositoryError(400, "invalid_review");
    }
    const byId = new Map(owned.facts.map((fact) => [fact.id, fact]));
    const seen = new Set<string>();
    const normalized = decisions.map((decision) => {
      const factId = boundedString(decision?.factId, 200, "invalid_review");
      const stored = byId.get(factId);
      if (!stored || seen.has(factId)) {
        throw new ConversationRepositoryError(400, "invalid_review");
      }
      seen.add(factId);
      if (
        decision.status !== "accepted" &&
        decision.status !== "edited" &&
        decision.status !== "rejected"
      ) {
        throw new ConversationRepositoryError(400, "invalid_review");
      }
      if (decision.status === "rejected") {
        return { stored, status: decision.status, value: factValue(stored) };
      }
      const current = factValue(stored);
      const candidate = normalizeCandidate({
        key: stored.factKey as CandidateFact["key"],
        value: decision.status === "edited" ? decision.value : current.value,
        topic: decision.topic ?? current.topic,
        sourceTurnIds: parseJson(stored.sourceTurnIds),
      });
      return {
        stored,
        status: decision.status,
        value: {
          value: candidate.value,
          ...(candidate.key === "interest" ? { topic: candidate.topic } : {}),
        },
      };
    });

    const resulting = owned.facts.map((stored) => {
      const changed = normalized.find((entry) => entry.stored.id === stored.id);
      return changed
        ? { ...stored, status: changed.status, parsed: changed.value }
        : { ...stored, parsed: factValue(stored) };
    });
    const confirmed = resulting.filter(
      (fact) => fact.status === "accepted" || fact.status === "edited",
    );
    if (confirmed.filter((fact) => fact.factKey === "interest").length > 3) {
      throw new ConversationRepositoryError(400, "invalid_review");
    }
    const nameFacts = confirmed.filter((fact) => fact.factKey === "name");
    const ageFacts = confirmed.filter((fact) => fact.factKey === "age");
    if (nameFacts.length > 1 || ageFacts.length > 1) {
      throw new ConversationRepositoryError(400, "invalid_review");
    }
    const onboarding = createOnboardingRepository(database, { createId, now });
    const profile = await onboarding.ensureProfile(identity);
    const timestamp = now();
    const profileCompleted = nameFacts.length === 1 && ageFacts.length === 1;
    const factUpdates = normalized.map(({ stored, status, value }) =>
      database
        .update(conversationFact)
        .set({ valueJson: JSON.stringify(value), status, updatedAt: timestamp })
        .where(eq(conversationFact.id, stored.id)),
    );
    const sessionUpdate = database
      .update(conversationSession)
      .set({
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
          name: String(nameFacts[0].parsed.value),
          age: Number(ageFacts[0].parsed.value),
          onboardingStatus: "completed",
          currentQuestionKey: null,
          completedAt: timestamp,
          updatedAt: timestamp,
        })
        .where(eq(learnerProfile.id, profile.id));
      await database.batch(
        [...factUpdates, profileUpdate, sessionUpdate] as unknown as Parameters<
          typeof database.batch
        >[0],
      );
    } else {
      await database.batch(
        [...factUpdates, sessionUpdate] as unknown as Parameters<
          typeof database.batch
        >[0],
      );
      await onboarding.skipSession(identity);
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
    loadOwnedConversation,
    reviewConversation,
    upsertCandidates,
  };
}
