import {
  checkEvaluateSpeechRateLimit,
  checkLessonDirectorRateLimit,
} from "./api-security";
import { handleEvaluateSpeech, type ApiEnv } from "./groq";
import { handleLessonDirector } from "./lesson-director";
import type { RateLimitEnv } from "./api-security";
import type { LessonDirectorProviderEnv } from "./lesson-director-provider";

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env extends ApiEnv, LessonDirectorProviderEnv, RateLimitEnv {
  ASSETS: AssetFetcher;
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/evaluate-speech") {
      const rateLimited = checkEvaluateSpeechRateLimit(request, env);
      if (rateLimited) return rateLimited;

      return handleEvaluateSpeech(request, env);
    }

    if (url.pathname === "/api/lesson-director") {
      const rateLimited = checkLessonDirectorRateLimit(request, env);
      if (rateLimited) return rateLimited;

      return handleLessonDirector(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

export default worker;
