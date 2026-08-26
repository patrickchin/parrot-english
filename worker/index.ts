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
  handleLearnerProfilesRequest,
  type LearnerProfilesEnv,
} from "./learner-profiles.ts";
import {
  handleConversationRequest,
  type ConversationEnv,
} from "./conversations.ts";
import {
  handleMyLessonRequest,
  type MyLessonsEnv,
} from "./my-lessons.ts";
import {
  handleLessonRecordingRequest,
  type LessonRecordingEnv,
} from "./lesson-recordings.ts";
import {
  handlePersonalizedStoryArtRequest,
  type PersonalizedStoryArtEnv,
} from "./personalized-story-art.ts";
import { handleDubRequest, type DubEnv } from "./dubs.ts";
import { isEncodedDubRouteAlias } from "./dub-route.ts";
import { createPublicAppRedirect } from "./public-origin.ts";
import {
  resolveLearnerIdentity,
  type AccountIdentity,
} from "./request-identity.ts";

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env
  extends AuthEnv,
    BuildInfoEnv,
    RateLimitEnv,
    ConversationEnv,
    LearnerProfilesEnv,
    MyLessonsEnv,
    LessonRecordingEnv,
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
  handleLearnerProfilesRequest: typeof handleLearnerProfilesRequest;
  handleConversationRequest: typeof handleConversationRequest;
  handleMyLessonRequest: typeof handleMyLessonRequest;
  handleLessonRecordingRequest: typeof handleLessonRecordingRequest;
  handlePersonalizedStoryArtRequest: typeof handlePersonalizedStoryArtRequest;
  handleDubRequest: typeof handleDubRequest;
}

function isLearnerProfilePath(pathname: string) {
  return (
    pathname === "/api/learner-profile" ||
    pathname.startsWith("/api/learner-profile/") ||
    pathname === "/api/profile" ||
    pathname === "/api/profile/preferences" ||
    pathname === "/api/profile/lesson-recording-consent"
  );
}

function isLearnerProfilesPath(pathname: string) {
  return (
    pathname === "/api/learner-profiles" ||
    pathname.startsWith("/api/learner-profiles/")
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

function isLessonRecordingPath(pathname: string) {
  return (
    pathname === "/api/lesson-recordings" ||
    pathname.startsWith("/api/lesson-recordings/")
  );
}

function isPersonalizedStoryArtPath(pathname: string) {
  return /^\/api\/stories\/[^/]+\/personalized-art(?:\/asset)?$/.test(pathname);
}

function isDubPath(pathname: string) {
  return pathname === "/api/dubs" || pathname.startsWith("/api/dubs/");
}

function learnerSelectionRequired() {
  return Response.json(
    { error: "learner_selection_required" },
    { status: 409, headers: { "Cache-Control": "no-store" } },
  );
}

const APP_SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
} as const;

const IMMUTABLE_VITE_ASSET =
  /^\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/;

function isStaticPathname(pathname: string) {
  return (
    pathname === "/assets" ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/.well-known/") ||
    (pathname !== "/index.html" && /^\/[^/]+\.[^/]+$/.test(pathname))
  );
}

function isHtmlResponse(response: Response) {
  return (
    response.status === 200 &&
    response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() ===
      "text/html"
  );
}

function withAppHeaders(response: Response, pathname: string) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(APP_SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  if (response.ok && IMMUTABLE_VITE_ASSET.test(pathname)) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function missingStaticAsset(request: Request, pathname: string) {
  return withAppHeaders(
    new Response(request.method === "HEAD" ? null : "Not found", {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=UTF-8",
      },
      status: 404,
    }),
    pathname,
  );
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
  const learnerProfilesRequest =
    dependencies.handleLearnerProfilesRequest ?? handleLearnerProfilesRequest;
  const conversationRequest =
    dependencies.handleConversationRequest ?? handleConversationRequest;
  const myLessonRequest =
    dependencies.handleMyLessonRequest ?? handleMyLessonRequest;
  const lessonRecordingRequest =
    dependencies.handleLessonRecordingRequest ?? handleLessonRecordingRequest;
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

      if (isLearnerProfilesPath(url.pathname)) {
        const session = await authFactory(env).api.getSession({
          headers: request.headers,
        });
        if (!session) {
          return Response.json(
            { error: "unauthorized" },
            { status: 401, headers: { "Cache-Control": "no-store" } },
          );
        }
        const accountIdentity: AccountIdentity = {
          sessionId: session.session.id,
          userId: session.user.id,
          userName: session.user.name?.trim() || null,
        };
        const database = createDatabase(env.DB);
        if (requiresGuardianAccess(url.pathname, request.method)) {
          const denied = await requireGuardianAccess({
            database,
            sessionId: accountIdentity.sessionId,
          });
          if (denied) return denied;
        }
        return learnerProfilesRequest({
          database,
          env,
          identity: accountIdentity,
          request,
        });
      }

      if (isLessonRecordingPath(url.pathname)) {
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
        const accountIdentity: AccountIdentity = {
          sessionId: session.session.id,
          userId: session.user.id,
          userName: session.user.name?.trim() || null,
        };
        const database = createDatabase(env.DB);
        const learner = await resolveLearnerIdentity(database, accountIdentity);
        if (learner.status === "selection_required") {
          return learnerSelectionRequired();
        }
        return lessonRecordingRequest({
          database,
          env,
          identity: learner.identity,
          request,
        });
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
        const accountIdentity: AccountIdentity = {
          sessionId: session.session.id,
          userId: session.user.id,
          userName: session.user.name?.trim() || null,
        };
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
            sessionId: accountIdentity.sessionId,
          });
          if (denied) return denied;
        }
        const learner = await resolveLearnerIdentity(database, accountIdentity);
        if (learner.status === "selection_required") {
          return learnerSelectionRequired();
        }
        return dubRequest({
          database,
          env,
          identity: learner.identity,
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
        const accountIdentity: AccountIdentity = {
          sessionId: session.session.id,
          userId: session.user.id,
          userName: session.user.name?.trim() || null,
        };
        if (request.method === "POST") {
          const rateLimited = await guardianUnlockRateLimit(
            request,
            env,
            accountIdentity.userId,
          );
          if (rateLimited) return rateLimited;
        }
        return guardianAccessRequest({
          database: createDatabase(env.DB),
          identity: accountIdentity,
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
        const accountIdentity: AccountIdentity = {
          sessionId: session.session.id,
          userId: session.user.id,
          userName: session.user.name?.trim() || null,
        };
        const database = createDatabase(env.DB);
        if (requiresGuardianAccess(url.pathname, request.method)) {
          const denied = await requireGuardianAccess({
            database,
            sessionId: accountIdentity.sessionId,
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
            accountIdentity.userId
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
            accountIdentity.userId
          );
          if (rateLimited) return rateLimited;
        }

        const learner = await resolveLearnerIdentity(database, accountIdentity);
        if (learner.status === "selection_required") {
          return learnerSelectionRequired();
        }

        return learnerProfileRequest({
          database,
          env,
          identity: learner.identity,
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
        const accountIdentity: AccountIdentity = {
          sessionId: session.session.id,
          userId: session.user.id,
          userName: session.user.name?.trim() || null,
        };
        const database = createDatabase(env.DB);
        const learner = await resolveLearnerIdentity(database, accountIdentity);
        if (learner.status === "selection_required") {
          return learnerSelectionRequired();
        }
        return conversationRequest({
          database,
          env,
          identity: learner.identity,
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
        const accountIdentity: AccountIdentity = {
          sessionId: session.session.id,
          userId: session.user.id,
          userName: session.user.name?.trim() || null,
        };
        const database = createDatabase(env.DB);
        if (requiresGuardianAccess(url.pathname, request.method)) {
          const denied = await requireGuardianAccess({
            database,
            sessionId: accountIdentity.sessionId,
          });
          if (denied) return denied;
        }
        const learner = await resolveLearnerIdentity(database, accountIdentity);
        if (learner.status === "selection_required") {
          return learnerSelectionRequired();
        }
        if (
          url.pathname === "/api/lessons/my/generate" &&
          request.method === "POST"
        ) {
          const rateLimited = await lessonGenerationRateLimit(
            request,
            env,
            accountIdentity.userId,
          );
          if (rateLimited) return rateLimited;
        }
        return myLessonRequest({
          database,
          env,
          identity: learner.identity,
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
        const accountIdentity: AccountIdentity = {
          sessionId: session.session.id,
          userId: session.user.id,
          userName: session.user.name?.trim() || null,
        };
        const database = createDatabase(env.DB);
        if (requiresGuardianAccess(url.pathname, request.method)) {
          const denied = await requireGuardianAccess({
            database,
            sessionId: accountIdentity.sessionId,
          });
          if (denied) return denied;
        }
        const learner = await resolveLearnerIdentity(database, accountIdentity);
        if (learner.status === "selection_required") {
          return learnerSelectionRequired();
        }
        if (request.method === "POST") {
          const rateLimited = await personalizedStoryArtRateLimit(
            request,
            env,
            accountIdentity.userId,
          );
          if (rateLimited) return rateLimited;
        }
        return personalizedStoryArtRequest({
          database,
          env,
          identity: learner.identity,
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

      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        return Response.json(
          { error: "not_found" },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        );
      }

      const assetResponse = await env.ASSETS.fetch(request);
      if (isStaticPathname(url.pathname) && isHtmlResponse(assetResponse)) {
        return missingStaticAsset(request, url.pathname);
      }
      return withAppHeaders(assetResponse, url.pathname);
    },
  };
}

export default createWorker();
