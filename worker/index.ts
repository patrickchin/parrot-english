import { handleEvaluateSpeech, handleTts } from "./groq";

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetFetcher;
  GROQ_API_KEY?: string;
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/tts") {
      return handleTts(request, env);
    }

    if (url.pathname === "/api/evaluate-speech") {
      return handleEvaluateSpeech(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

export default worker;
