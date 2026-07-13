import type { ConversationPurpose } from "../../lib/conversation-purpose";

export type ConversationTurn = {
  id: string;
  conversationId: string;
  providerItemId: string;
  sequence: number;
  role: "user" | "assistant";
  text: string;
  language: string | null;
  inputMode: "voice" | "text";
  interrupted: boolean;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
};

export type ConversationSession = {
  id: string;
  authUserId: string;
  scenarioKey: ConversationPurpose;
  scenarioVersion: number;
  roomName: string;
  status:
    | "starting"
    | "active"
    | "completed"
    | "stopped"
    | "disconnected"
    | "failed"
    | "abandoned";
  finishReason: string | null;
  controllerState: Record<string, unknown>;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  turns?: ConversationTurn[];
};

export type ConversationScenarioDescriptor = {
  key: ConversationPurpose;
  version: number;
  requiredDetails: readonly ("name" | "age")[];
  summaryMode: "none" | "prose";
  maxOptionalExchanges: number | null;
};

export type ConversationStartResponse = {
  conversation: ConversationSession;
  livekit: { participantToken: string; url: string };
  scenario: ConversationScenarioDescriptor;
};

export type ConversationRequestOptions = {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
};

export class ConversationApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ConversationApiError";
    this.code = code;
    this.status = status;
  }
}

async function requestJson<Result>(
  path: string,
  init: RequestInit,
  { fetch: request = globalThis.fetch, signal }: ConversationRequestOptions = {},
) {
  const response = await request(path, { ...init, signal });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A failed upstream may return an empty or non-JSON body.
  }
  if (!response.ok) {
    const record =
      payload !== null && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const code =
      typeof record.error === "string" ? record.error : "request_failed";
    const message =
      typeof record.message === "string"
        ? record.message
        : "The conversation request could not be completed.";
    throw new ConversationApiError(response.status, code, message);
  }
  return payload as Result;
}

function jsonRequest<Result>(
  path: string,
  method: "POST" | "PUT",
  body: unknown,
  options?: ConversationRequestOptions,
) {
  return requestJson<Result>(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    options,
  );
}

export function startConversation(
  purpose: ConversationPurpose,
  options?: ConversationRequestOptions,
) {
  return jsonRequest<ConversationStartResponse>(
    "/api/conversations",
    "POST",
    { purpose },
    options,
  );
}

export function loadConversation(
  conversationId: string,
  options?: ConversationRequestOptions,
) {
  return requestJson<{ conversation: ConversationSession }>(
    `/api/conversations/${encodeURIComponent(conversationId)}`,
    { method: "GET" },
    options,
  );
}

export function finishConversation(
  conversationId: string,
  reason: string,
  options?: ConversationRequestOptions,
) {
  return jsonRequest<{ conversation: ConversationSession }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/finish`,
    "POST",
    { reason },
    options,
  );
}

export function finalizeConversation(
  conversationId: string,
  options?: ConversationRequestOptions,
) {
  return jsonRequest<{
    conversationId: string;
    profileCompleted: boolean;
    bypassed: boolean;
  }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/review`,
    "PUT",
    {},
    options,
  );
}
