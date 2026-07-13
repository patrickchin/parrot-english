import type { ConversationPurpose } from "../lib/conversation-purpose.ts";
import {
  fetchWithTimeout,
  getGroqRequestTimeoutMs,
  type ApiEnv,
} from "./groq.ts";
import { CONVERSATION_PROFILE_FINALIZATION_SYSTEM_PROMPT } from "./prompts/conversation-profile-finalization.ts";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_CHAT_MODEL = "openai/gpt-oss-20b";
const MAX_TRANSCRIPT_CHARACTERS = 16_000;
const OUTPUT_KEYS = new Set(["name", "age", "description"]);
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}'’ .-]*$/u;

type ConversationTurn = {
  role: string;
  text: string;
};

type ProfileConversationTurn = {
  role: "user" | "assistant";
  text: string;
};

export type ConversationProfileState = Record<string, unknown> & {
  learnedAge: boolean;
  learnedName: boolean;
  profileAge: number | null;
  profileName: string | null;
  profileSummary: string;
};

type DeriveConversationProfileStateInput = {
  env: ApiEnv;
  fetch?: typeof globalThis.fetch;
  initialState: ConversationProfileState;
  purpose: ConversationPurpose;
  turns: ConversationTurn[];
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    name: {
      anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }],
    },
    age: {
      anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
    },
    description: {
      anyOf: [{ type: "string", maxLength: 2_000 }, { type: "null" }],
    },
  },
  required: ["name", "age", "description"],
  additionalProperties: false,
} as const;

function validName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= 120 &&
    NAME_PATTERN.test(value)
  );
}

function validAge(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function boundedTranscript(turns: ConversationTurn[]) {
  const selected: ProfileConversationTurn[] = [];
  let characters = 0;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (
      (turn.role !== "user" && turn.role !== "assistant") ||
      typeof turn.text !== "string" ||
      !turn.text.trim()
    ) {
      continue;
    }
    const text = turn.text.trim().slice(0, 4_000);
    if (characters + text.length > MAX_TRANSCRIPT_CHARACTERS) break;
    selected.push({ role: turn.role, text });
    characters += text.length;
  }
  return selected.reverse();
}

function parseGenerated(
  value: unknown,
  initialState: ConversationProfileState,
): ConversationProfileState | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const output = value as Record<string, unknown>;
  if (
    Object.keys(output).length !== OUTPUT_KEYS.size ||
    Object.keys(output).some((key) => !OUTPUT_KEYS.has(key))
  ) {
    return null;
  }

  const name = output.name === null ? null : output.name;
  const age = output.age === null ? null : output.age;
  const description =
    output.description === null || typeof output.description !== "string"
      ? output.description
      : output.description.trim();
  if (
    (name !== null && !validName(name)) ||
    (age !== null && !validAge(age)) ||
    (description !== null &&
      (typeof description !== "string" ||
        description.length === 0 ||
        description.length > 2_000)) ||
    ((name !== null || age !== null) && description === null)
  ) {
    return null;
  }

  return {
    ...initialState,
    learnedAge: age !== null,
    learnedName: name !== null,
    profileAge: age,
    profileName: name,
    profileSummary: description ?? "",
  };
}

export async function deriveConversationProfileState({
  env,
  fetch: fetchImplementation = globalThis.fetch,
  initialState,
  purpose,
  turns,
}: DeriveConversationProfileStateInput): Promise<ConversationProfileState> {
  const transcript = boundedTranscript(turns);
  if (
    purpose === "small-chat" ||
    !env.GROQ_API_KEY ||
    !transcript.some(({ role }) => role === "user")
  ) {
    return initialState;
  }

  const input = {
    purpose,
    savedProfile: {
      age: initialState.profileAge,
      name: initialState.profileName,
      description: initialState.profileSummary || null,
    },
    transcript,
  };

  try {
    const upstream = await fetchWithTimeout(
      fetchImplementation,
      GROQ_CHAT_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_CHAT_MODEL,
          messages: [
            {
              role: "system",
              content: CONVERSATION_PROFILE_FINALIZATION_SYSTEM_PROMPT,
            },
            { role: "user", content: JSON.stringify(input) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "conversation_profile_finalization",
              strict: true,
              schema: RESPONSE_SCHEMA,
            },
          },
        }),
      },
      getGroqRequestTimeoutMs(env),
    );
    if (!upstream.ok) return initialState;
    const payload = (await upstream.json()) as {
      choices?: Array<{
        message?: { content?: unknown; refusal?: unknown };
      }>;
    };
    const message = payload.choices?.[0]?.message;
    if (message?.refusal || typeof message?.content !== "string") {
      return initialState;
    }
    return parseGenerated(JSON.parse(message.content), initialState) ?? initialState;
  } catch {
    return initialState;
  }
}
