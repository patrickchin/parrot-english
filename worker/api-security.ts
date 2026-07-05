type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const evaluateRateLimitBuckets = new Map<string, RateLimitEntry>();
const onboardingTranscriptionRateLimitBuckets = new Map<
  string,
  RateLimitEntry
>();
const DEFAULT_EVALUATE_RATE_LIMIT_MAX = 8;
const DEFAULT_EVALUATE_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_ONBOARDING_TRANSCRIPTION_RATE_LIMIT_MAX = 6;
const DEFAULT_ONBOARDING_TRANSCRIPTION_RATE_LIMIT_WINDOW_SECONDS = 60;

export interface RateLimitEnv {
  EVALUATE_RATE_LIMIT_MAX?: string;
  EVALUATE_RATE_LIMIT_WINDOW_SECONDS?: string;
  ONBOARDING_TRANSCRIPTION_RATE_LIMIT_MAX?: string;
  ONBOARDING_TRANSCRIPTION_RATE_LIMIT_WINDOW_SECONDS?: string;
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

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getClientAddress(request: Request) {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function checkRateLimit({
  buckets,
  key,
  maxRequests,
  message,
  now,
  windowSeconds,
}: {
  buckets: Map<string, RateLimitEntry>;
  key: string;
  maxRequests: number;
  message: string;
  now: number;
  windowSeconds: number;
}) {
  const windowMs = windowSeconds * 1000;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (current.count >= maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return jsonResponse(
      { error: "rate_limited", message },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      }
    );
  }

  current.count += 1;
  return null;
}

export function checkEvaluateSpeechRateLimit(
  request: Request,
  env: RateLimitEnv,
  now = Date.now()
) {
  const maxRequests = readPositiveInteger(
    env.EVALUATE_RATE_LIMIT_MAX,
    DEFAULT_EVALUATE_RATE_LIMIT_MAX
  );
  const windowSeconds = readPositiveInteger(
    env.EVALUATE_RATE_LIMIT_WINDOW_SECONDS,
    DEFAULT_EVALUATE_RATE_LIMIT_WINDOW_SECONDS
  );
  return checkRateLimit({
    buckets: evaluateRateLimitBuckets,
    key: getClientAddress(request),
    maxRequests,
    message: "Too many speech evaluation requests. Please wait and try again.",
    now,
    windowSeconds,
  });
}

export function checkOnboardingTranscriptionRateLimit(
  request: Request,
  env: RateLimitEnv,
  userId: string,
  now = Date.now()
) {
  return checkRateLimit({
    buckets: onboardingTranscriptionRateLimitBuckets,
    key: `${userId}:${getClientAddress(request)}`,
    maxRequests: readPositiveInteger(
      env.ONBOARDING_TRANSCRIPTION_RATE_LIMIT_MAX,
      DEFAULT_ONBOARDING_TRANSCRIPTION_RATE_LIMIT_MAX
    ),
    message: "Too many transcription requests. Please wait and try again.",
    now,
    windowSeconds: readPositiveInteger(
      env.ONBOARDING_TRANSCRIPTION_RATE_LIMIT_WINDOW_SECONDS,
      DEFAULT_ONBOARDING_TRANSCRIPTION_RATE_LIMIT_WINDOW_SECONDS
    ),
  });
}
