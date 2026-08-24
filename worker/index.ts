import {
  checkPersonalizedStoryArtRateLimit,
  checkEvaluateSpeechRateLimit,
  checkLearnerProfileEnrichmentRateLimit,
  checkLearnerProfileTranscriptionRateLimit,
  checkLessonGenerationRateLimit,
} from "./api-security.ts";
import type { RateLimitEnv } from "./api-security.ts";
import { createAuth } from "./auth.ts";
import type { AuthEnv } from "./auth.ts";
import { createDatabase } from "./database.ts";
import {
  handleBuildInfoRequest,
  type BuildInfoEnv,
} from "./build-info.ts";
import { handleEvaluateSpeech } from "./groq.ts";
import { handleLearnerProfileRequest } from "./learner-profile.ts";
import {
  handleConversationRequest,
  type ConversationEnv,
} from "./conversations.ts";
import {
  handleMyLessonRequest,
  type MyLessonsEnv,
} from "./my-lessons.ts";
import {
  handlePersonalizedStoryArtRequest,
  type PersonalizedStoryArtEnv,
} from "./personalized-story-art.ts";
import { handleDubRequest, type DubEnv } from "./dubs.ts";
import { createPublicAppRedirect } from "./public-origin.ts";

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env
  extends AuthEnv,
    BuildInfoEnv,
    RateLimitEnv,
    ConversationEnv,
    MyLessonsEnv,
    PersonalizedStoryArtEnv,
    DubEnv {
  ASSETS: AssetFetcher;
  GROQ_API_KEY?: string;
  GROQ_REQUEST_TIMEOUT_MS?: string;
}

interface WorkerDependencies {
  createAuth: typeof createAuth;
  checkEvaluateSpeechRateLimit: typeof checkEvaluateSpeechRateLimit;
  checkLearnerProfileEnrichmentRateLimit: typeof checkLearnerProfileEnrichmentRateLimit;
  checkLearnerProfileTranscriptionRateLimit: typeof checkLearnerProfileTranscriptionRateLimit;
  checkLessonGenerationRateLimit: typeof checkLessonGenerationRateLimit;
  checkPersonalizedStoryArtRateLimit: typeof checkPersonalizedStoryArtRateLimit;
  handleEvaluateSpeech: typeof handleEvaluateSpeech;
  handleLearnerProfileRequest: typeof handleLearnerProfileRequest;
  handleConversationRequest: typeof handleConversationRequest;
  handleMyLessonRequest: typeof handleMyLessonRequest;
  handlePersonalizedStoryArtRequest: typeof handlePersonalizedStoryArtRequest;
  handleDubRequest: typeof handleDubRequest;
}

function isLearnerProfilePath(pathname: string) {
  return (
    pathname === "/api/learner-profile" ||
    pathname.startsWith("/api/learner-profile/") ||
    pathname === "/api/profile"
  );
}

function isConversationPath(pathname: string) {
  return pathname === "/api/conversations" || pathname.startsWith("/api/conversations/");
}

function isAgentConversationPath(pathname: string) {
  return /^\/api\/conversations\/[^/]+\/(turns|facts|end)$/.test(pathname);
}

function isMyLessonPath(pathname: string) {
  return pathname === "/api/lessons/my" || pathname.startsWith("/api/lessons/my/");
}

function isPersonalizedStoryArtPath(pathname: string) {
  return /^\/api\/stories\/[^/]+\/personalized-art(?:\/asset)?$/.test(pathname);
}

function isDubPath(pathname: string) {
  return pathname === "/api/dubs" || pathname.startsWith("/api/dubs/");
}

export function createWorker(
  dependencies: Partial<WorkerDependencies> = {}
) {
  const rateLimit =
    dependencies.checkEvaluateSpeechRateLimit ?? checkEvaluateSpeechRateLimit;
  const learnerProfileTranscriptionRateLimit =
    dependencies.checkLearnerProfileTranscriptionRateLimit ??
    checkLearnerProfileTranscriptionRateLimit;
  const learnerProfileEnrichmentRateLimit =
    dependencies.checkLearnerProfileEnrichmentRateLimit ??
    checkLearnerProfileEnrichmentRateLimit;
  const lessonGenerationRateLimit =
    dependencies.checkLessonGenerationRateLimit ?? checkLessonGenerationRateLimit;
  const personalizedStoryArtRateLimit =
    dependencies.checkPersonalizedStoryArtRateLimit ??
    checkPersonalizedStoryArtRateLimit;
  const evaluateSpeech =
    dependencies.handleEvaluateSpeech ?? handleEvaluateSpeech;
  const learnerProfileRequest =
    dependencies.handleLearnerProfileRequest ?? handleLearnerProfileRequest;
  const conversationRequest =
    dependencies.handleConversationRequest ?? handleConversationRequest;
  const myLessonRequest =
    dependencies.handleMyLessonRequest ?? handleMyLessonRequest;
  const personalizedStoryArtRequest =
    dependencies.handlePersonalizedStoryArtRequest ??
    handlePersonalizedStoryArtRequest;
  const dubRequest = dependencies.handleDubRequest ?? handleDubRequest;
  const authFactory = dependencies.createAuth ?? createAuth;

  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      const publicAppRedirect = createPublicAppRedirect(url);
      if (publicAppRedirect) return publicAppRedirect;

      if (
        url.pathname === "/api/build-info" ||
        url.pathname.startsWith("/api/build-info/")
      ) {
        return handleBuildInfoRequest({
          database: createDatabase(env.DB),
          env,
          request,
        });
      }

      if (
        url.pathname === "/api/auth" ||
        url.pathname.startsWith("/api/auth/")
      ) {
        return authFactory(env).handler(request);
      }

      if (isDubPath(url.pathname)) {
        const session = await authFactory(env).api.getSession({
          headers: request.headers,
        });
        if (!session) {
          return Response.json(
            { error: "unauthorized" },
            {
              headers: { "Cache-Control": "private, no-store" },
              status: 401,
            },
          );
        }
        return dubRequest({
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

      if (isLearnerProfilePath(url.pathname)) {
        const session = await authFactory(env).api.getSession({
          headers: request.headers,
        });
        if (!session) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        if (
          url.pathname === "/api/learner-profile/transcribe" &&
          request.method === "POST"
        ) {
          const rateLimited = await learnerProfileTranscriptionRateLimit(
            request,
            env,
            session.user.id
          );
          if (rateLimited) return rateLimited;
        }
        if (
          request.method === "PUT" &&
          (url.pathname === "/api/learner-profile/answer" ||
            url.pathname === "/api/profile")
        ) {
          const rateLimited = await learnerProfileEnrichmentRateLimit(
            request,
            env,
            session.user.id
          );
          if (rateLimited) return rateLimited;
        }

        return learnerProfileRequest({
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

      if (isMyLessonPath(url.pathname)) {
        const session = await authFactory(env).api.getSession({
          headers: request.headers,
        });
        if (!session) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        if (
          url.pathname === "/api/lessons/my/generate" &&
          request.method === "POST"
        ) {
          const rateLimited = await lessonGenerationRateLimit(
            request,
            env,
            session.user.id,
          );
          if (rateLimited) return rateLimited;
        }
        return myLessonRequest({
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

      if (isPersonalizedStoryArtPath(url.pathname)) {
        const session = await authFactory(env).api.getSession({
          headers: request.headers,
        });
        if (!session) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        if (request.method === "POST") {
          const rateLimited = await personalizedStoryArtRateLimit(
            request,
            env,
            session.user.id,
          );
          if (rateLimited) return rateLimited;
        }
        return personalizedStoryArtRequest({
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
