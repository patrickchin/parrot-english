const MAX_INGEST_BODY_BYTES = 32 * 1024;

export type AgentConversationTurn = {
  endedAt?: number;
  inputMode: "voice" | "text";
  interrupted: boolean;
  language: string | null;
  providerItemId: string;
  role: "user" | "assistant";
  sequence: number;
  startedAt?: number;
  text: string;
};

type IngestClientOptions = {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  retryDelayMs?: number;
  secret: string;
  timeoutMs?: number;
};

function delay(milliseconds: number) {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function createConversationIngestClient({
  baseUrl,
  fetch: request = globalThis.fetch,
  retryDelayMs = 100,
  secret,
  timeoutMs = 5_000,
}: IngestClientOptions) {
  const root = baseUrl.replace(/\/$/, "");
  if (!root || !secret.trim()) throw new Error("Ingest URL and secret are required.");

  async function post(conversationId: string, action: string, body: unknown) {
    const serialized = JSON.stringify(body);
    if (new TextEncoder().encode(serialized).byteLength > MAX_INGEST_BODY_BYTES) {
      throw new Error("Conversation ingest payload is too large.");
    }
    const url = `${root}/api/conversations/${encodeURIComponent(conversationId)}/${action}`;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await request(url, {
          body: serialized,
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.ok) return;
        if (response.status < 500 || attempt === 1) {
          throw new Error(`Conversation ingest failed (${response.status}).`);
        }
        lastError = new Error(`Conversation ingest failed (${response.status}).`);
      } catch (error) {
        lastError = error;
        if (attempt === 1) throw error;
      }
      await delay(retryDelayMs);
    }
    throw lastError instanceof Error ? lastError : new Error("Conversation ingest failed.");
  }

  return {
    appendTurn(conversationId: string, turn: AgentConversationTurn) {
      return post(conversationId, "turns", turn);
    },

    endConversation(
      conversationId: string,
      status: "completed" | "stopped" | "disconnected" | "failed" | "abandoned",
      finishReason: string,
    ) {
      return post(conversationId, "end", { finishReason, status });
    },

    updateState(conversationId: string, controllerState: unknown) {
      return post(conversationId, "facts", { candidates: [], controllerState });
    },
  };
}

export type ConversationIngestClient = ReturnType<
  typeof createConversationIngestClient
>;
