import {
  checkEvaluateSpeechRateLimit,
  createTtsBlockedResponse,
} from "./api-security";
import { handleEvaluateSpeech } from "./groq";

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetFetcher;
  EVALUATE_RATE_LIMIT_MAX?: string;
  EVALUATE_RATE_LIMIT_WINDOW_SECONDS?: string;
  GROQ_API_KEY?: string;
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/tts") {
      return createTtsBlockedResponse();
    }

    if (url.pathname === "/api/evaluate-speech") {
      const rateLimited = checkEvaluateSpeechRateLimit(request, env);
      if (rateLimited) return rateLimited;

      return handleEvaluateSpeech(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

export default worker;
