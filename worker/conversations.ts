import type { AuthEnv } from "./auth.ts";
import {
  isConversationPurpose,
  updatesLearnerProfile,
  type ConversationPurpose,
} from "../lib/conversation-purpose.ts";
import {
  DEFAULT_TALK_TO_PEPPA_PROMPT_STYLE,
  isTalkToPeppaPromptStyle,
  type TalkToPeppaPromptStyle,
} from "../lib/talk-to-peppa-prompt-style.ts";
import {
  deriveConversationProfileState,
  type ConversationProfileState,
} from "./conversation-profile-finalization.ts";
import type { Database } from "./database.ts";
import { requireGuardianAccess } from "./guardian-access.ts";
import type { ApiEnv } from "./groq.ts";
import type { LearnerProfileIdentity } from "./learner-profile.ts";
import { createLearnerProfileRepository } from "./learner-profile-repository.ts";
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
const CONVERSATION_SCENARIOS = {
  onboarding: {
    key: "onboarding",
    version: 1,
    requiredDetails: ["name", "age"],
    summaryMode: "prose",
    maxOptionalExchanges: 3,
  },
  "profile-edit": {
    key: "profile-edit",
    version: 1,
    requiredDetails: [],
    summaryMode: "prose",
    maxOptionalExchanges: 3,
  },
  "small-chat": {
    key: "small-chat",
    version: 2,
    requiredDetails: [],
    summaryMode: "none",
    maxOptionalExchanges: 8,
  },
} as const satisfies Record<
  ConversationPurpose,
  {
    key: ConversationPurpose;
    version: number;
    requiredDetails: readonly ("name" | "age")[];
    summaryMode: "none" | "prose";
    maxOptionalExchanges: number | null;
  }
>;

export interface ConversationEnv extends AuthEnv, LiveKitTokenEnv, ApiEnv {
  CONVERSATION_AGENT_SECRET?: string;
  LIVEKIT_URL?: string;
  REALTIME_CONVERSATIONS_ENABLED?: string;
}

export interface ConversationRequestInput {
  database: Database;
  env: ConversationEnv;
  identity: LearnerProfileIdentity | null;
  request: Request;
}

type HandlerDependencies = {
  createId: () => string;
  createParticipantToken: typeof createLiveKitParticipantToken;
  deriveProfileState: typeof deriveConversationProfileState;
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
    turns: loaded.turns,
  };
}

async function requireProfileConversationAccess(input: {
  database: Database;
  identity: LearnerProfileIdentity;
  purpose: ConversationPurpose;
}) {
  if (!updatesLearnerProfile(input.purpose)) return;
  let needsGuardian = input.purpose === "profile-edit";
  if (input.purpose === "onboarding") {
    const profile = await createLearnerProfileRepository(
      input.database,
    ).findProfile(input.identity.userId);
    needsGuardian = Boolean(
      profile &&
        (profile.profileStatus === "completed" || profile.lastSkippedAt !== null),
    );
  }
  if (!needsGuardian) return;
  const denied = await requireGuardianAccess({
    database: input.database,
    sessionId: input.identity.sessionId,
  });
  if (denied) throw new ConversationApiError(403, "guardian_required");
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
    deriveProfileState:
      overrides.deriveProfileState ?? deriveConversationProfileState,
  };
  const repository = createConversationRepository(input.database, dependencies);
  const url = new URL(input.request.url);
  const match = url.pathname.match(
    /^\/api\/conversations\/([^/]+)(?:\/(finish|review|turns|facts|end))?$/,
  );

  try {
    if (url.pathname === "/api/conversations" && input.request.method === "POST") {
      if (!input.identity) throw new ConversationApiError(401, "unauthorized");
      if (input.env.REALTIME_CONVERSATIONS_ENABLED !== "1") {
        throw new ConversationApiError(404, "realtime_disabled");
      }
      const body = input.request.body ? await readJson(input.request) : {};
      const purpose = body.purpose ?? "onboarding";
      if (!isConversationPurpose(purpose)) {
        throw new ConversationApiError(400, "invalid_conversation_purpose");
      }
      await requireProfileConversationAccess({
        database: input.database,
        identity: input.identity,
        purpose,
      });
      let promptStyle: TalkToPeppaPromptStyle | undefined;
      if (purpose === "small-chat") {
        promptStyle =
          body.promptStyle === undefined
            ? DEFAULT_TALK_TO_PEPPA_PROMPT_STYLE
            : isTalkToPeppaPromptStyle(body.promptStyle)
              ? body.promptStyle
              : undefined;
        if (!promptStyle) {
          throw new ConversationApiError(400, "invalid_prompt_style");
        }
      } else if (body.promptStyle !== undefined) {
        throw new ConversationApiError(400, "invalid_prompt_style");
      }
      const scenario = CONVERSATION_SCENARIOS[purpose];
      const livekitUrl = required(input.env.LIVEKIT_URL, "livekit_url");
      const conversation = await repository.createConversation(
        input.identity,
        scenario,
        { promptStyle },
      );
      const initialState = JSON.parse(conversation.controllerState) as Record<
        string,
        unknown
      >;
      const participantToken = await dependencies.createParticipantToken({
        env: input.env,
        conversation,
        identity: input.identity,
        initialState,
        now: dependencies.now(),
        promptStyle,
      });
      return json(
        {
          conversation: {
            ...conversation,
            controllerState: JSON.parse(conversation.controllerState),
          },
          livekit: { participantToken, url: livekitUrl },
          scenario,
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
      if (!Array.isArray(body.candidates) || body.candidates.length !== 0) {
        throw new ConversationApiError(400, "invalid_facts");
      }
      await repository.updateControllerState(conversationId, body.controllerState);
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
      await readJson(input.request);
      const loaded = await repository.loadOwnedConversation(
        conversationId,
        input.identity!.userId,
      );
      if (!loaded) throw new ConversationApiError(404, "not_found");
      if (!isConversationPurpose(loaded.conversation.scenarioKey)) {
        throw new ConversationApiError(500, "invalid_stored_data");
      }
      await requireProfileConversationAccess({
        database: input.database,
        identity: input.identity!,
        purpose: loaded.conversation.scenarioKey,
      });
      if (
        loaded.conversation.status !== "completed" &&
        updatesLearnerProfile(loaded.conversation.scenarioKey)
      ) {
        let initialState: ConversationProfileState;
        try {
          const storedState = JSON.parse(
            loaded.conversation.controllerState,
          ) as unknown;
          if (
            storedState === null ||
            typeof storedState !== "object" ||
            Array.isArray(storedState)
          ) {
            throw new Error("invalid controller state");
          }
          initialState = storedState as ConversationProfileState;
        } catch {
          throw new ConversationApiError(500, "invalid_stored_data");
        }
        const derivedState = await dependencies.deriveProfileState({
          env: input.env,
          initialState,
          purpose: loaded.conversation.scenarioKey,
          turns: loaded.turns.map(({ role, text }) => ({ role, text })),
        });
        if (derivedState !== initialState) {
          await repository.updateControllerState(conversationId, derivedState);
        }
      }
      const result = await repository.finalizeConversation(
        conversationId,
        input.identity!,
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
