import type { AuthEnv } from "./auth.ts";
import type { Database } from "./database.ts";
import type { OnboardingIdentity } from "./onboarding.ts";
import {
  ConversationRepositoryError,
  createConversationRepository,
} from "./conversation-repository.ts";
import {
  createLiveKitParticipantToken,
  type LiveKitTokenEnv,
} from "./livekit-token.ts";
import { readBoundedText, RequestBodyTooLargeError } from "./request-body.ts";

const MAX_BODY_BYTES = 32 * 1024;
const ONBOARDING_SCENARIO = {
  key: "onboarding",
  version: 1,
  requiredFacts: ["name", "age"],
  optionalFact: "interest",
  maxOptionalExchanges: 3,
} as const;

export interface ConversationEnv extends AuthEnv, LiveKitTokenEnv {
  CONVERSATION_AGENT_SECRET?: string;
  LIVEKIT_URL?: string;
  REALTIME_ONBOARDING_ENABLED?: string;
}

export interface ConversationRequestInput {
  database: Database;
  env: ConversationEnv;
  identity: OnboardingIdentity | null;
  request: Request;
}

type HandlerDependencies = {
  createId: () => string;
  createParticipantToken: typeof createLiveKitParticipantToken;
  now: () => Date;
};

class ConversationApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function json(payload: unknown, init?: ResponseInit) {
  return Response.json(payload, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

function required(value: string | undefined, name: string) {
  if (!value?.trim()) throw new ConversationApiError(503, `${name}_missing`);
  return value.trim();
}

async function readJson(request: Request) {
  let text: string;
  try {
    text = await readBoundedText(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw new ConversationApiError(413, "payload_too_large");
    }
    throw error;
  }
  try {
    const value = JSON.parse(text) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new ConversationApiError(400, "invalid_json");
  }
}

function isAgentAuthorized(request: Request, env: ConversationEnv) {
  const secret = env.CONVERSATION_AGENT_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("Authorization") === `Bearer ${secret}`;
}

function clientConversation(
  loaded: Awaited<
    ReturnType<ReturnType<typeof createConversationRepository>["loadOwnedConversation"]>
  >,
) {
  if (!loaded) return null;
  return {
    ...loaded.conversation,
    controllerState: JSON.parse(loaded.conversation.controllerState),
    facts: loaded.facts.map((fact) => ({
      ...fact,
      value: JSON.parse(fact.valueJson),
      sourceTurnIds: JSON.parse(fact.sourceTurnIds),
      valueJson: undefined,
    })),
    turns: loaded.turns,
  };
}

export async function handleConversationRequest(
  input: ConversationRequestInput,
  overrides: Partial<HandlerDependencies> = {},
) {
  const dependencies: HandlerDependencies = {
    createId: () => crypto.randomUUID(),
    createParticipantToken: createLiveKitParticipantToken,
    now: () => new Date(),
    ...overrides,
  };
  const repository = createConversationRepository(input.database, dependencies);
  const url = new URL(input.request.url);
  const match = url.pathname.match(
    /^\/api\/conversations\/([^/]+)(?:\/(finish|review|turns|facts|end))?$/,
  );

  try {
    if (url.pathname === "/api/conversations" && input.request.method === "POST") {
      if (!input.identity) throw new ConversationApiError(401, "unauthorized");
      if (input.env.REALTIME_ONBOARDING_ENABLED !== "1") {
        throw new ConversationApiError(404, "realtime_disabled");
      }
      const livekitUrl = required(input.env.LIVEKIT_URL, "livekit_url");
      const conversation = await repository.createConversation(
        input.identity,
        ONBOARDING_SCENARIO,
      );
      const participantToken = await dependencies.createParticipantToken({
        env: input.env,
        conversation,
        identity: input.identity,
        now: dependencies.now(),
      });
      return json(
        {
          conversation: {
            ...conversation,
            controllerState: JSON.parse(conversation.controllerState),
          },
          livekit: { participantToken, url: livekitUrl },
          scenario: ONBOARDING_SCENARIO,
        },
        { status: 201 },
      );
    }

    if (!match) throw new ConversationApiError(404, "not_found");
    const [, conversationId, action] = match;
    const agentAction = action === "turns" || action === "facts" || action === "end";
    if (agentAction && !isAgentAuthorized(input.request, input.env)) {
      throw new ConversationApiError(401, "unauthorized");
    }
    if (!agentAction && !input.identity) {
      throw new ConversationApiError(401, "unauthorized");
    }

    if (!action && input.request.method === "GET") {
      const loaded = await repository.loadOwnedConversation(
        conversationId,
        input.identity!.userId,
      );
      if (!loaded) throw new ConversationApiError(404, "not_found");
      return json({ conversation: clientConversation(loaded) });
    }

    if (action === "turns" && input.request.method === "POST") {
      const result = await repository.appendTurn(
        conversationId,
        await readJson(input.request) as Parameters<typeof repository.appendTurn>[1],
      );
      return json({ turn: result.turn }, { status: result.created ? 201 : 200 });
    }

    if (action === "facts" && input.request.method === "POST") {
      const body = await readJson(input.request);
      await repository.upsertCandidates(
        conversationId,
        body.candidates as Parameters<typeof repository.upsertCandidates>[1],
        body.controllerState,
      );
      return json({ conversationId });
    }

    if (action === "end" && input.request.method === "POST") {
      const body = await readJson(input.request);
      const allowed = new Set([
        "completed",
        "stopped",
        "disconnected",
        "failed",
        "abandoned",
      ]);
      if (!allowed.has(String(body.status))) {
        throw new ConversationApiError(400, "invalid_end_state");
      }
      const conversation = await repository.endConversation(
        conversationId,
        body.status as Parameters<typeof repository.endConversation>[1],
        String(body.finishReason ?? body.status),
      );
      return json({ conversation });
    }

    if (action === "finish" && input.request.method === "POST") {
      const body = await readJson(input.request);
      const owned = await repository.loadOwnedConversation(
        conversationId,
        input.identity!.userId,
      );
      if (!owned) throw new ConversationApiError(404, "not_found");
      const conversation = await repository.endConversation(
        conversationId,
        "stopped",
        typeof body.reason === "string" ? body.reason : "finished_by_learner",
      );
      return json({ conversation });
    }

    if (action === "review" && input.request.method === "PUT") {
      const body = await readJson(input.request);
      const result = await repository.reviewConversation(
        conversationId,
        input.identity!,
        body.decisions as Parameters<typeof repository.reviewConversation>[2],
      );
      return json(result);
    }

    throw new ConversationApiError(404, "not_found");
  } catch (error) {
    if (error instanceof ConversationApiError || error instanceof ConversationRepositoryError) {
      return json({ error: error.code }, { status: error.status });
    }
    console.error("Conversation request failed", error);
    return json({ error: "conversation_unavailable" }, { status: 503 });
  }
}
