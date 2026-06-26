type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const evaluateRateLimitBuckets = new Map<string, RateLimitEntry>();
const DEFAULT_EVALUATE_RATE_LIMIT_MAX = 8;
const DEFAULT_EVALUATE_RATE_LIMIT_WINDOW_SECONDS = 60;

export interface RateLimitEnv {
  EVALUATE_RATE_LIMIT_MAX?: string;
  EVALUATE_RATE_LIMIT_WINDOW_SECONDS?: string;
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

export function createTtsBlockedResponse() {
  return jsonResponse(
    {
      error: "tts_endpoint_disabled",
      message: "Runtime text-to-speech is disabled. Use saved audio assets.",
    },
    { status: 410 }
  );
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
  const windowMs = windowSeconds * 1000;
  const key = getClientAddress(request);
  const current = evaluateRateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    evaluateRateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return null;
  }

  if (current.count >= maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return jsonResponse(
      {
        error: "rate_limited",
        message: "Too many speech evaluation requests. Please wait and try again.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
        },
      }
    );
  }

  current.count += 1;
  return null;
}
