import {
  checkEvaluateSpeechRateLimit,
  checkOnboardingEnrichmentRateLimit,
  checkOnboardingTranscriptionRateLimit,
} from "./api-security.ts";
import type { RateLimitEnv } from "./api-security.ts";
import { createAuth } from "./auth.ts";
import type { AuthEnv } from "./auth.ts";
import { createDatabase } from "./database.ts";
import { handleEvaluateSpeech } from "./groq.ts";
import { handleOnboardingRequest } from "./onboarding.ts";
import {
  handleConversationRequest,
  type ConversationEnv,
} from "./conversations.ts";

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env extends AuthEnv, RateLimitEnv, ConversationEnv {
  ASSETS: AssetFetcher;
  GROQ_API_KEY?: string;
  GROQ_REQUEST_TIMEOUT_MS?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_REQUEST_TIMEOUT_MS?: string;
}

interface WorkerDependencies {
  createAuth: typeof createAuth;
  checkEvaluateSpeechRateLimit: typeof checkEvaluateSpeechRateLimit;
  checkOnboardingEnrichmentRateLimit: typeof checkOnboardingEnrichmentRateLimit;
  checkOnboardingTranscriptionRateLimit: typeof checkOnboardingTranscriptionRateLimit;
  handleEvaluateSpeech: typeof handleEvaluateSpeech;
  handleOnboardingRequest: typeof handleOnboardingRequest;
  handleConversationRequest: typeof handleConversationRequest;
}

function isOnboardingPath(pathname: string) {
  return (
    pathname === "/api/onboarding" ||
    pathname.startsWith("/api/onboarding/") ||
    pathname === "/api/profile"
  );
}

function isConversationPath(pathname: string) {
  return pathname === "/api/conversations" || pathname.startsWith("/api/conversations/");
}

function isAgentConversationPath(pathname: string) {
  return /^\/api\/conversations\/[^/]+\/(turns|facts|end)$/.test(pathname);
}

export function createWorker(
  dependencies: Partial<WorkerDependencies> = {}
) {
  const rateLimit =
    dependencies.checkEvaluateSpeechRateLimit ?? checkEvaluateSpeechRateLimit;
  const onboardingTranscriptionRateLimit =
    dependencies.checkOnboardingTranscriptionRateLimit ??
    checkOnboardingTranscriptionRateLimit;
  const onboardingEnrichmentRateLimit =
    dependencies.checkOnboardingEnrichmentRateLimit ??
    checkOnboardingEnrichmentRateLimit;
  const evaluateSpeech =
    dependencies.handleEvaluateSpeech ?? handleEvaluateSpeech;
  const onboardingRequest =
    dependencies.handleOnboardingRequest ?? handleOnboardingRequest;
  const conversationRequest =
    dependencies.handleConversationRequest ?? handleConversationRequest;
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

      if (isOnboardingPath(url.pathname)) {
        const session = await authFactory(env).api.getSession({
          headers: request.headers,
        });
        if (!session) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        if (
          url.pathname === "/api/onboarding/transcribe" &&
          request.method === "POST"
        ) {
          const rateLimited = await onboardingTranscriptionRateLimit(
            request,
            env,
            session.user.id
          );
          if (rateLimited) return rateLimited;
        }
        if (
          request.method === "PUT" &&
          (url.pathname === "/api/onboarding/answer" ||
            url.pathname === "/api/profile")
        ) {
          const rateLimited = await onboardingEnrichmentRateLimit(
            request,
            env,
            session.user.id
          );
          if (rateLimited) return rateLimited;
        }

        return onboardingRequest({
          database: createDatabase(env.DB),
          env,
          identity: {
            sessionId: session.session.id,
            userId: session.user.id,
            userName: session.user.name?.trim() || null,
          },
          request,
        });
      }

      if (isConversationPath(url.pathname)) {
        if (isAgentConversationPath(url.pathname)) {
          return conversationRequest({
            database: createDatabase(env.DB),
            env,
            identity: null,
            request,
          });
        }
        const session = await authFactory(env).api.getSession({
          headers: request.headers,
        });
        if (!session) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        return conversationRequest({
          database: createDatabase(env.DB),
          env,
          identity: {
            sessionId: session.session.id,
            userId: session.user.id,
            userName: session.user.name?.trim() || null,
          },
          request,
        });
      }

      if (url.pathname === "/api/evaluate-speech") {
        const session = await authFactory(env).api.getSession({
          headers: request.headers,
        });
        if (!session) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        const rateLimited = await rateLimit(request, env);
        if (rateLimited) return rateLimited;

        return evaluateSpeech(request, env);
      }

      return env.ASSETS.fetch(request);
    },
  };
}

export default createWorker();
