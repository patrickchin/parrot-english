import { APIError } from "better-auth/api";
import {
  checkGuardianUnlockRateLimit,
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
import {
  handleGuardianAccessRequest,
  requireGuardianAccess,
  requiresGuardianAccess,
} from "./guardian-access.ts";
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
import { isEncodedDubRouteAlias } from "./dub-route.ts";
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
  checkGuardianUnlockRateLimit: typeof checkGuardianUnlockRateLimit;
  checkLearnerProfileEnrichmentRateLimit: typeof checkLearnerProfileEnrichmentRateLimit;
  checkLearnerProfileTranscriptionRateLimit: typeof checkLearnerProfileTranscriptionRateLimit;
  checkLessonGenerationRateLimit: typeof checkLessonGenerationRateLimit;
  checkPersonalizedStoryArtRateLimit: typeof checkPersonalizedStoryArtRateLimit;
  handleEvaluateSpeech: typeof handleEvaluateSpeech;
  handleGuardianAccessRequest: typeof handleGuardianAccessRequest;
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
    pathname === "/api/profile" ||
    pathname === "/api/profile/preferences"
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
  const guardianUnlockRateLimit =
    dependencies.checkGuardianUnlockRateLimit ?? checkGuardianUnlockRateLimit;
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
  const guardianAccessRequest =
    dependencies.handleGuardianAccessRequest ?? handleGuardianAccessRequest;
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
        if (isEncodedDubRouteAlias(url.pathname)) {
          return Response.json(
            { error: "not_found", message: "not_found" },
            {
              headers: { "Cache-Control": "private, no-store" },
              status: 404,
            },
          );
        }
        const database = createDatabase(env.DB);
        if (requiresGuardianAccess(url.pathname, request.method)) {
          const denied = await requireGuardianAccess({
            database,
            sessionId: session.session.id,
          });
          if (denied) return denied;
        }
        return dubRequest({
          database,
          env,
          identity: {
            sessionId: session.session.id,
            userId: session.user.id,
            userName: session.user.name?.trim() || null,
          },
          request,
        });
      }

      if (url.pathname === "/api/guardian-access") {
        const auth = authFactory(env);
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return Response.json(
            { error: "unauthorized" },
            { status: 401, headers: { "Cache-Control": "no-store" } },
          );
        }
        if (request.method === "POST") {
          const rateLimited = await guardianUnlockRateLimit(
            request,
            env,
            session.user.id,
          );
          if (rateLimited) return rateLimited;
        }
        return guardianAccessRequest({
          database: createDatabase(env.DB),
          identity: {
            sessionId: session.session.id,
            userId: session.user.id,
          },
          request,
          verifyPassword: async (password) => {
            try {
              const verified = await auth.api.verifyPassword({
                body: { password },
                headers: request.headers,
              });
              return Boolean(verified);
            } catch (error) {
              if (
                error instanceof APIError &&
                error.body?.code === "INVALID_PASSWORD"
              ) {
                return false;
              }
              throw error;
            }
          },
        });
      }

      if (isLearnerProfilePath(url.pathname)) {
        const session = await authFactory(env).api.getSession({
          headers: request.headers,
        });
        if (!session) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const database = createDatabase(env.DB);
        if (requiresGuardianAccess(url.pathname, request.method)) {
          const denied = await requireGuardianAccess({
            database,
            sessionId: session.session.id,
          });
          if (denied) return denied;
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
          database,
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
        const database = createDatabase(env.DB);
        if (requiresGuardianAccess(url.pathname, request.method)) {
          const denied = await requireGuardianAccess({
            database,
            sessionId: session.session.id,
          });
          if (denied) return denied;
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
          database,
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
        const database = createDatabase(env.DB);
        if (requiresGuardianAccess(url.pathname, request.method)) {
          const denied = await requireGuardianAccess({
            database,
            sessionId: session.session.id,
          });
          if (denied) return denied;
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
          database,
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
