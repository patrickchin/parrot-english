import {
  fetchWithTimeout,
  getGroqRequestTimeoutMs,
  type ApiEnv,
} from "./groq.ts";
import {
  containsLikelyFullLearnerName,
  containsPrivateLearnerProfileDetails,
  PREFERRED_NAME_FIELD_ERROR,
  PRIVATE_PROFILE_FIELD_ERROR,
} from "../lib/learner-profile-privacy.ts";
import { LEARNER_PROFILE_ENRICHMENT_SYSTEM_PROMPT } from "./prompts/learner-profile-enrichment.ts";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_CHAT_MODEL = "openai/gpt-oss-20b";
const OUTPUT_KEYS = new Set(["summary", "canonicalName", "canonicalAge"]);
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}'’ .-]*$/u;

type LearnerProfileQuestion = {
  promptEn: string;
  canonicalField: "name" | "age" | null;
  maxLength: number;
};

export type LearnerProfileEnrichment = {
  summary: string;
  canonicalName: string | null;
  canonicalAge: number | null;
  enrichmentStatus: "generated" | "fallback";
};

export type LearnerProfileEnrichmentResult =
  | LearnerProfileEnrichment
  | {
      errorCode?: "preferred_name_required" | "private_profile_details";
      fieldError: string;
    };

type EnrichmentInput = {
  env: ApiEnv;
  fetch?: typeof globalThis.fetch;
  question: LearnerProfileQuestion;
  rawAnswer: string;
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", maxLength: 240 },
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
  required: ["summary", "canonicalName", "canonicalAge"],
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
  question: LearnerProfileQuestion,
  rawAnswer: string
): Pick<LearnerProfileEnrichment, "canonicalName" | "canonicalAge"> | {
  fieldError: string;
} {
  if (question.canonicalField === "name") {
    const canonicalName = rawAnswer
      .replace(
        /^(?:my\s+name\s+is|i\s+am|i['’]m|call\s+me|\u6211\u53eb|\u6211\u7684\u540d\u5b57\u662f|\u53eb\u6211)\s*/iu,
        "",
      )
      .replace(/[.!?]+$/u, "")
      .trim();
    if (!validName(canonicalName)) {
      return { fieldError: "Please tell me the name you would like us to use." };
    }
    return { canonicalName, canonicalAge: null };
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

function safeEnrichment(
  enrichment: LearnerProfileEnrichmentResult,
): LearnerProfileEnrichmentResult {
  if ("fieldError" in enrichment) return enrichment;
  if (containsPrivateLearnerProfileDetails(enrichment.summary)) {
    return {
      errorCode: "private_profile_details",
      fieldError: PRIVATE_PROFILE_FIELD_ERROR,
    };
  }
  if (
    containsLikelyFullLearnerName(
      enrichment.canonicalName,
      enrichment.summary,
    )
  ) {
    return {
      errorCode: "preferred_name_required",
      fieldError: PREFERRED_NAME_FIELD_ERROR,
    };
  }
  return enrichment;
}

function fallback(
  question: LearnerProfileQuestion,
  rawAnswer: string
): LearnerProfileEnrichmentResult {
  const canonical = fallbackCanonical(question, rawAnswer);
  if ("fieldError" in canonical) return canonical;
  return {
    summary: truncate(rawAnswer, 240),
    ...canonical,
    enrichmentStatus: "fallback",
  };
}

function parseGenerated(
  value: unknown,
  question: LearnerProfileQuestion
): Omit<LearnerProfileEnrichment, "enrichmentStatus"> | null {
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
  if (summary.length === 0 || summary.length > 240) {
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
    canonicalName:
      typeof output.canonicalName === "string" ? output.canonicalName : null,
    canonicalAge:
      typeof output.canonicalAge === "number" ? output.canonicalAge : null,
  };
}

export async function enrichLearnerProfileAnswer({
  env,
  fetch: fetchImplementation = globalThis.fetch,
  question,
  rawAnswer,
}: EnrichmentInput): Promise<LearnerProfileEnrichmentResult> {
  const answer = typeof rawAnswer === "string" ? rawAnswer.trim() : "";
  if (answer.length === 0 || answer.length > Math.min(question.maxLength, 500)) {
    return { fieldError: `Please use ${Math.min(question.maxLength, 500)} characters or fewer.` };
  }
  if (containsPrivateLearnerProfileDetails(answer)) {
    return {
      errorCode: "private_profile_details",
      fieldError: PRIVATE_PROFILE_FIELD_ERROR,
    };
  }
  if (question.canonicalField === "name") {
    const localCanonical = fallbackCanonical(question, answer);
    if (
      !("fieldError" in localCanonical) &&
      containsLikelyFullLearnerName(localCanonical.canonicalName)
    ) {
      return {
        errorCode: "preferred_name_required",
        fieldError: PREFERRED_NAME_FIELD_ERROR,
      };
    }
  }
  if (!env.GROQ_API_KEY) return safeEnrichment(fallback(question, answer));

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
              content: LEARNER_PROFILE_ENRICHMENT_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: `Question: ${question.promptEn}\nAnswer: ${answer}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "learner_profile_enrichment",
              strict: true,
              schema: RESPONSE_SCHEMA,
            },
          },
        }),
      },
      getGroqRequestTimeoutMs(env)
    );
    if (!upstream.ok) return safeEnrichment(fallback(question, answer));

    const payload = (await upstream.json()) as {
      choices?: Array<{
        message?: { content?: unknown; refusal?: unknown };
      }>;
    };
    const message = payload.choices?.[0]?.message;
    if (message?.refusal || typeof message?.content !== "string") {
      return safeEnrichment(fallback(question, answer));
    }
    const parsed = parseGenerated(JSON.parse(message.content), question);
    if (!parsed) return safeEnrichment(fallback(question, answer));
    return safeEnrichment({ ...parsed, enrichmentStatus: "generated" });
  } catch {
    return safeEnrichment(fallback(question, answer));
  }
}
