import { checkEvaluateSpeechRateLimit } from "./api-security.ts";
import { createAuth } from "./auth.ts";
import type { AuthEnv } from "./auth.ts";
import { handleEvaluateSpeech } from "./groq.ts";

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env extends AuthEnv {
  ASSETS: AssetFetcher;
  EVALUATE_RATE_LIMIT_MAX?: string;
  EVALUATE_RATE_LIMIT_WINDOW_SECONDS?: string;
  GROQ_API_KEY?: string;
  GROQ_REQUEST_TIMEOUT_MS?: string;
}

interface WorkerDependencies {
  createAuth: typeof createAuth;
  checkEvaluateSpeechRateLimit: typeof checkEvaluateSpeechRateLimit;
  handleEvaluateSpeech: typeof handleEvaluateSpeech;
}

export function createWorker(
  dependencies: Partial<WorkerDependencies> = {}
) {
  const rateLimit =
    dependencies.checkEvaluateSpeechRateLimit ?? checkEvaluateSpeechRateLimit;
  const evaluateSpeech =
    dependencies.handleEvaluateSpeech ?? handleEvaluateSpeech;
  const authFactory = dependencies.createAuth ?? createAuth;

  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);

      if (
        url.pathname === "/api/auth" ||
        url.pathname.startsWith("/api/auth/")
      ) {
        return authFactory(env).handler(request);
      }

      if (url.pathname === "/api/evaluate-speech") {
        const session = await authFactory(env).api.getSession({
          headers: request.headers,
        });
        if (!session) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        const rateLimited = rateLimit(request, env);
        if (rateLimited) return rateLimited;

        return evaluateSpeech(request, env);
      }

      return env.ASSETS.fetch(request);
    },
  };
}

export default createWorker();
