export interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export interface RateLimitEnv {
  EVALUATE_RATE_LIMITER: RateLimitBinding;
  LEARNER_PROFILE_TRANSCRIPTION_RATE_LIMITER: RateLimitBinding;
  LEARNER_PROFILE_ENRICHMENT_RATE_LIMITER: RateLimitBinding;
}

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return Response.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function getClientAddress(request: Request) {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

async function checkRateLimit(
  binding: RateLimitBinding,
  key: string,
  message: string,
) {
  const { success } = await binding.limit({ key });
  if (success) return null;

  return jsonResponse(
    { error: "rate_limited", message },
    {
      status: 429,
      headers: { "Retry-After": "60" },
    },
  );
}

export function checkEvaluateSpeechRateLimit(
  request: Request,
  env: RateLimitEnv,
) {
  return checkRateLimit(
    env.EVALUATE_RATE_LIMITER,
    getClientAddress(request),
    "Too many speech evaluation requests. Please wait and try again.",
  );
}

export function checkLearnerProfileTranscriptionRateLimit(
  request: Request,
  env: RateLimitEnv,
  userId: string,
) {
  return checkRateLimit(
    env.LEARNER_PROFILE_TRANSCRIPTION_RATE_LIMITER,
    `${userId}:${getClientAddress(request)}`,
    "Too many transcription requests. Please wait and try again.",
  );
}

export function checkLearnerProfileEnrichmentRateLimit(
  request: Request,
  env: RateLimitEnv,
  userId: string,
) {
  return checkRateLimit(
    env.LEARNER_PROFILE_ENRICHMENT_RATE_LIMITER,
    `${userId}:${getClientAddress(request)}`,
    "Too many learner-profile answers. Please wait and try again.",
  );
}
