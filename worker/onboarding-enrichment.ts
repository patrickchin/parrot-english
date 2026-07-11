import {
  fetchWithTimeout,
  getGroqRequestTimeoutMs,
  type ApiEnv,
} from "./groq.ts";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_CHAT_MODEL = "openai/gpt-oss-20b";
const OUTPUT_KEYS = new Set([
  "summary",
  "acknowledgment",
  "canonicalName",
  "canonicalAge",
]);
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}'’ .-]*$/u;

type OnboardingQuestion = {
  promptEn: string;
  canonicalField: "name" | "age" | null;
  maxLength: number;
  fallbackAcknowledgment: string;
};

export type OnboardingEnrichment = {
  summary: string;
  acknowledgment: string;
  canonicalName: string | null;
  canonicalAge: number | null;
  enrichmentStatus: "generated" | "fallback";
};

export type OnboardingEnrichmentResult =
  | OnboardingEnrichment
  | { fieldError: string };

type EnrichmentInput = {
  env: ApiEnv;
  fetch?: typeof globalThis.fetch;
  question: OnboardingQuestion;
  rawAnswer: string;
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", maxLength: 240 },
    acknowledgment: { type: "string", maxLength: 160 },
    canonicalName: {
      anyOf: [{ type: "string", maxLength: 80 }, { type: "null" }],
    },
    canonicalAge: {
      anyOf: [
        { type: "integer", minimum: 0 },
        { type: "null" },
      ],
    },
  },
  required: ["summary", "acknowledgment", "canonicalName", "canonicalAge"],
  additionalProperties: false,
} as const;

function truncate(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join("").trim();
}

function validName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= 80 &&
    NAME_PATTERN.test(value)
  );
}

function validAge(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function fallbackCanonical(
  question: OnboardingQuestion,
  rawAnswer: string
): Pick<OnboardingEnrichment, "canonicalName" | "canonicalAge"> | {
  fieldError: string;
} {
  if (question.canonicalField === "name") {
    if (!validName(rawAnswer)) {
      return { fieldError: "Please tell me the name you would like us to use." };
    }
    return { canonicalName: rawAnswer, canonicalAge: null };
  }
  if (question.canonicalField === "age") {
    const match = rawAnswer.match(/(?:^|[^\d.-])(\d+)(?![\d.])/);
    const age = match ? Number.parseInt(match[1], 10) : null;
    if (!validAge(age)) {
      return {
        fieldError: "Please tell me your age using a whole number.",
      };
    }
    return { canonicalName: null, canonicalAge: age };
  }
  return { canonicalName: null, canonicalAge: null };
}

function fallback(
  question: OnboardingQuestion,
  rawAnswer: string
): OnboardingEnrichmentResult {
  const canonical = fallbackCanonical(question, rawAnswer);
  if ("fieldError" in canonical) return canonical;
  return {
    summary: truncate(rawAnswer, 240),
    acknowledgment: question.fallbackAcknowledgment,
    ...canonical,
    enrichmentStatus: "fallback",
  };
}

function parseGenerated(
  value: unknown,
  question: OnboardingQuestion
): Omit<OnboardingEnrichment, "enrichmentStatus"> | null {
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

  const summary = typeof output.summary === "string" ? output.summary.trim() : "";
  const acknowledgment =
    typeof output.acknowledgment === "string"
      ? output.acknowledgment.trim()
      : "";
  if (
    summary.length === 0 ||
    summary.length > 240 ||
    acknowledgment.length === 0 ||
    acknowledgment.length > 160 ||
    acknowledgment.includes("?")
  ) {
    return null;
  }

  if (question.canonicalField === "name") {
    if (!validName(output.canonicalName) || output.canonicalAge !== null) {
      return null;
    }
  } else if (question.canonicalField === "age") {
    if (!validAge(output.canonicalAge) || output.canonicalName !== null) {
      return null;
    }
  } else if (output.canonicalName !== null || output.canonicalAge !== null) {
    return null;
  }

  return {
    summary,
    acknowledgment,
    canonicalName:
      typeof output.canonicalName === "string" ? output.canonicalName : null,
    canonicalAge:
      typeof output.canonicalAge === "number" ? output.canonicalAge : null,
  };
}

export async function enrichOnboardingAnswer({
  env,
  fetch: fetchImplementation = globalThis.fetch,
  question,
  rawAnswer,
}: EnrichmentInput): Promise<OnboardingEnrichmentResult> {
  const answer = typeof rawAnswer === "string" ? rawAnswer.trim() : "";
  if (answer.length === 0 || answer.length > Math.min(question.maxLength, 500)) {
    return { fieldError: `Please use ${Math.min(question.maxLength, 500)} characters or fewer.` };
  }
  if (!env.GROQ_API_KEY) return fallback(question, answer);

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
              content:
                "Summarize the child's answer factually in third person. Write one warm, playful acknowledgment for a child. Do not ask a question or invent details. Return only the requested JSON. Set canonicalName or canonicalAge only when the question asks for it; otherwise return null.",
            },
            {
              role: "user",
              content: `Question: ${question.promptEn}\nAnswer: ${answer}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "onboarding_enrichment",
              strict: true,
              schema: RESPONSE_SCHEMA,
            },
          },
        }),
      },
      getGroqRequestTimeoutMs(env)
    );
    if (!upstream.ok) return fallback(question, answer);

    const payload = (await upstream.json()) as {
      choices?: Array<{
        message?: { content?: unknown; refusal?: unknown };
      }>;
    };
    const message = payload.choices?.[0]?.message;
    if (message?.refusal || typeof message?.content !== "string") {
      return fallback(question, answer);
    }
    const parsed = parseGenerated(JSON.parse(message.content), question);
    if (!parsed) return fallback(question, answer);
    return { ...parsed, enrichmentStatus: "generated" };
  } catch {
    return fallback(question, answer);
  }
}
