type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const evaluateRateLimitBuckets = new Map<string, RateLimitEntry>();
const lessonDirectorRateLimitBuckets = new Map<string, RateLimitEntry>();
const DEFAULT_EVALUATE_RATE_LIMIT_MAX = 8;
const DEFAULT_EVALUATE_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_LESSON_DIRECTOR_RATE_LIMIT_MAX = 6;
const DEFAULT_LESSON_DIRECTOR_RATE_LIMIT_WINDOW_SECONDS = 60;

export interface RateLimitEnv {
  EVALUATE_RATE_LIMIT_MAX?: string;
  EVALUATE_RATE_LIMIT_WINDOW_SECONDS?: string;
  LESSON_DIRECTOR_RATE_LIMIT_MAX?: string;
  LESSON_DIRECTOR_RATE_LIMIT_WINDOW_SECONDS?: string;
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

function checkRateLimit(
  bucket: Map<string, RateLimitEntry>,
  request: Request,
  maxRequests: number,
  windowSeconds: number,
  message: string,
  now: number
) {
  const windowMs = windowSeconds * 1000;
  const key = getClientAddress(request);
  const current = bucket.get(key);

  if (!current || current.resetAt <= now) {
    bucket.set(key, {
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
        message,
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

export function checkEvaluateSpeechRateLimit(
  request: Request,
  env: RateLimitEnv,
  now = Date.now()
) {
  return checkRateLimit(
    evaluateRateLimitBuckets,
    request,
    readPositiveInteger(env.EVALUATE_RATE_LIMIT_MAX, DEFAULT_EVALUATE_RATE_LIMIT_MAX),
    readPositiveInteger(
      env.EVALUATE_RATE_LIMIT_WINDOW_SECONDS,
      DEFAULT_EVALUATE_RATE_LIMIT_WINDOW_SECONDS
    ),
    "Too many speech evaluation requests. Please wait and try again.",
    now
  );
}

export function checkLessonDirectorRateLimit(
  request: Request,
  env: RateLimitEnv,
  now = Date.now()
) {
  return checkRateLimit(
    lessonDirectorRateLimitBuckets,
    request,
    readPositiveInteger(
      env.LESSON_DIRECTOR_RATE_LIMIT_MAX,
      DEFAULT_LESSON_DIRECTOR_RATE_LIMIT_MAX
    ),
    readPositiveInteger(
      env.LESSON_DIRECTOR_RATE_LIMIT_WINDOW_SECONDS,
      DEFAULT_LESSON_DIRECTOR_RATE_LIMIT_WINDOW_SECONDS
    ),
    "Too many lesson director requests. Please wait and try again.",
    now
  );
}
