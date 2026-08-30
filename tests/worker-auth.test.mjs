import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APIError } from "better-auth/api";
import { createAuth } from "../worker/auth.ts";
import { createDatabase } from "../worker/database.ts";
import {
  createGuardianAccessRepository,
  requiresGuardianAccess,
} from "../worker/guardian-access.ts";
import * as workerModule from "../worker/index.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const VALID_AUTH_SECRET = "R2F7cFlwMTVNSVZ1LzNZb1ZYVUs5ZDBnKzVYV25VSEk=";
const VALID_TURNSTILE_SECRET = "turnstile-test-secret";

function createAuthEnvironment(overrides = {}) {
  return {
    DB: {},
    BETTER_AUTH_SECRET: VALID_AUTH_SECRET,
    BETTER_AUTH_URL: "https://example.test",
    TURNSTILE_SECRET_KEY: VALID_TURNSTILE_SECRET,
    ...overrides,
  };
}

function createTestWorker(overrides = {}) {
  assert.equal(
    typeof workerModule.createWorker,
    "function",
    "worker/index.ts must export createWorker for dependency injection"
  );

  return workerModule.createWorker(overrides);
}

function createEnvironment(assetResponse = new Response("asset")) {
  let assetCalls = 0;

  return {
    env: {
      ASSETS: {
        async fetch() {
          assetCalls += 1;
          return assetResponse;
        },
      },
    },
    getAssetCalls: () => assetCalls,
  };
}

function createAuthStub({
  session = null,
  response = new Response("auth"),
  verifyPassword = async () => ({ status: true }),
} = {}) {
  let handlerCalls = 0;
  let sessionCalls = 0;
  const passwordCalls = [];

  return {
    auth: {
      async handler() {
        handlerCalls += 1;
        return response.clone();
      },
      api: {
        async getSession() {
          sessionCalls += 1;
          return session;
        },
        async verifyPassword(input) {
          passwordCalls.push(input);
          return verifyPassword(input);
        },
      },
    },
    getHandlerCalls: () => handlerCalls,
    getSessionCalls: () => sessionCalls,
    getPasswordCalls: () => passwordCalls,
  };
}

describe("Worker authentication", () => {
  it("recognizes only exact learner-profile DELETE routes as Guardian-protected", () => {
    assert.equal(
      requiresGuardianAccess(
        "/api/learner-profiles/learner-a",
        "DELETE",
      ),
      true,
    );
    assert.equal(
      requiresGuardianAccess(
        "/api/learner-profiles/learner-a/extra",
        "DELETE",
      ),
      false,
    );
    assert.equal(
      requiresGuardianAccess(
        "/api/learner-profiles/learner-a",
        "GET",
      ),
      false,
    );
  });

  it("requires a nonblank Better Auth secret of at least 32 characters", () => {
    assert.throws(() => createAuth({ DB: {} }), /BETTER_AUTH_SECRET/);
    assert.throws(
      () =>
        createAuth({
          DB: {},
          BETTER_AUTH_SECRET: "   ",
        }),
      /BETTER_AUTH_SECRET/
    );
    assert.throws(
      () =>
        createAuth({
          DB: {},
          BETTER_AUTH_SECRET: "too-short",
          BETTER_AUTH_URL: "https://example.test",
        }),
      /BETTER_AUTH_SECRET.*at least 32 characters/
    );
  });

  it("requires a nonblank Better Auth base URL", () => {
    assert.throws(
      () =>
        createAuth({
          DB: {},
          BETTER_AUTH_SECRET: VALID_AUTH_SECRET,
        }),
      /BETTER_AUTH_URL/
    );
    assert.throws(
      () =>
        createAuth({
          DB: {},
          BETTER_AUTH_SECRET: VALID_AUTH_SECRET,
          BETTER_AUTH_URL: "   ",
        }),
      /BETTER_AUTH_URL/
    );
  });

  it("requires a nonblank Turnstile secret", () => {
    assert.throws(
      () =>
        createAuth({
          DB: {},
          BETTER_AUTH_SECRET: VALID_AUTH_SECRET,
          BETTER_AUTH_URL: "https://example.test",
        }),
      /TURNSTILE_SECRET_KEY/,
    );
    assert.throws(
      () => createAuth(createAuthEnvironment({ TURNSTILE_SECRET_KEY: "   " })),
      /TURNSTILE_SECRET_KEY/,
    );
  });

  it("enables anonymous sessions and protects guest login plus sign-up with Turnstile", () => {
    const auth = createAuth(createAuthEnvironment());
    const anonymousPlugin = auth.options.plugins?.find(
      (plugin) => plugin.id === "anonymous",
    );
    const captchaPlugin = auth.options.plugins?.find(
      (plugin) => plugin.id === "captcha",
    );

    assert.ok(anonymousPlugin);
    assert.equal(anonymousPlugin.options?.generateName?.(), "Guest");
    assert.ok(captchaPlugin);
    assert.deepEqual(captchaPlugin.options, {
      endpoints: ["/sign-in/anonymous", "/sign-up/email"],
      expectedAction: "account_access",
      provider: "cloudflare-turnstile",
      secretKey: VALID_TURNSTILE_SECRET,
    });
  });

  it("purges guest data before Better Auth links and removes an anonymous account", async () => {
    const calls = [];
    const bucket = {};
    const auth = createAuth(
      createAuthEnvironment({ PERSONALIZED_STORY_ART_BUCKET: bucket }),
      {
        async prepareAccountDeletion(input) {
          calls.push(input);
        },
      },
    );
    const anonymousPlugin = auth.options.plugins?.find(
      (plugin) => plugin.id === "anonymous",
    );

    assert.equal(typeof anonymousPlugin?.options?.onLinkAccount, "function");
    await anonymousPlugin.options.onLinkAccount({
      anonymousUser: {
        session: { id: "guest-session" },
        user: { id: "guest-user", isAnonymous: true },
      },
      ctx: {},
      newUser: {
        session: { id: "regular-session" },
        user: { id: "regular-user", isAnonymous: false },
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].bucket, bucket);
    assert.equal(calls[0].userId, "guest-user");
  });

  it("rejects guest login and sign-up without Turnstile proof before database access", async () => {
    const auth = createAuth(createAuthEnvironment());
    const requests = [
      ["/api/auth/sign-in/anonymous", {}],
      [
        "/api/auth/sign-up/email",
        { name: "Mary", email: "mary@example.com", password: "password" },
      ],
    ];

    for (const [pathname, body] of requests) {
      const response = await auth.handler(
        new Request(`https://example.test${pathname}`, {
          body: JSON.stringify(body),
          headers: {
            "cf-connecting-ip": "192.0.2.1",
            "content-type": "application/json",
            origin: "https://example.test",
          },
          method: "POST",
        }),
      );

      assert.equal(response.status, 400, pathname);
      assert.deepEqual(await response.json(), {
        code: "MISSING_RESPONSE",
        message: "Missing CAPTCHA response",
      });
    }
  });

  it("trusts the public site and Parrot Worker origins", async () => {
    const productionOrigin = "https://parrot-english.p-ch.workers.dev";
    const auth = createAuth({
      ...createAuthEnvironment(),
      BETTER_AUTH_URL: productionOrigin,
    });
    const context = await auth.$context;

    assert.equal(auth.options.baseURL, productionOrigin);
    assert.equal(context.isTrustedOrigin(productionOrigin), true);
    assert.equal(context.isTrustedOrigin("https://parrotbook.com"), true);
    assert.equal(
      context.isTrustedOrigin(
        "https://codex-app-home-routing-parrot-english.p-ch.workers.dev"
      ),
      true
    );
    assert.equal(
      context.isTrustedOrigin(
        "https://e8bf6255-parrot-english.p-ch.workers.dev"
      ),
      true
    );
  });

  it("rejects origins outside Parrot Worker HTTPS previews", async () => {
    const auth = createAuth({
      ...createAuthEnvironment(),
      BETTER_AUTH_URL: "https://parrot-english.p-ch.workers.dev",
    });
    const context = await auth.$context;
    const rejectedOrigins = [
      "https://unrelated.workers.dev",
      "https://branch-parrot-english.other-account.workers.dev",
      "http://branch-parrot-english.p-ch.workers.dev",
      "not a valid origin",
      "https://branch-parrot-english.p-ch.workers.dev.evil.example",
    ];

    for (const origin of rejectedOrigins) {
      assert.equal(
        context.isTrustedOrigin(origin),
        false,
        `Expected ${origin} to remain untrusted`
      );
    }
  });

  it("enables Better Auth rate limiting with the Cloudflare client IP header", () => {
    const auth = createAuth(createAuthEnvironment());

    assert.deepEqual(auth.options.rateLimit, { enabled: true });
    assert.deepEqual(auth.options.advanced?.ipAddress, {
      ipAddressHeaders: ["cf-connecting-ip"],
    });
  });

  it("enables password-confirmed account deletion with a fail-closed pre-delete purge", () => {
    const auth = createAuth({
      ...createAuthEnvironment(),
      PERSONALIZED_STORY_ART_BUCKET: {},
    });

    assert.equal(auth.options.user?.deleteUser?.enabled, true);
    assert.equal(
      typeof auth.options.user?.deleteUser?.beforeDelete,
      "function",
      "Account removal must run the personalized-art purge before Better Auth deletes the user row",
    );
  });

  it("creates a Drizzle database around the D1 binding", async () => {
    assert.ok(createDatabase({}));
  });

  it("redirects public aliases to the canonical HTTPS origin", async () => {
    let authFactoryCalls = 0;
    const { env, getAssetCalls } = createEnvironment();
    const worker = createTestWorker({
      createAuth() {
        authFactoryCalls += 1;
        return createAuthStub().auth;
      },
    });
    const cases = [
      [
        "http://parrotbook.com/login?returnTo=%2Flessons",
        "GET",
        "https://parrotbook.com/login?returnTo=%2Flessons",
      ],
      [
        "https://www.parrotbook.com/api/auth/sign-in/email?returnTo=%2Flessons",
        "POST",
        "https://parrotbook.com/api/auth/sign-in/email?returnTo=%2Flessons",
      ],
      [
        "http://www.parrotbook.com/lessons?tag=a+b&tag=%2F",
        "GET",
        "https://parrotbook.com/lessons?tag=a+b&tag=%2F",
      ],
    ];

    for (const [source, method, target] of cases) {
      const response = await worker.fetch(new Request(source, { method }), env);

      assert.equal(response.status, 308, source);
      assert.equal(response.headers.get("location"), target, source);
    }

    assert.equal(authFactoryCalls, 0);
    assert.equal(getAssetCalls(), 0);
  });

  it("does not redirect canonical, preview, local, or lookalike hosts", async () => {
    let assetCalls = 0;
    const env = {
      ASSETS: {
        async fetch() {
          assetCalls += 1;
          return new Response("asset");
        },
      },
    };
    const worker = createTestWorker();
    const urls = [
      "https://parrotbook.com/login",
      "https://branch-parrot-english.p-ch.workers.dev/login",
      "http://127.0.0.1:3000/login",
      "http://parrotbook.com.evil.example/login",
    ];

    for (const url of urls) {
      const response = await worker.fetch(new Request(url), env);

      assert.equal(response.status, 200, url);
      assert.equal(await response.text(), "asset", url);
    }

    assert.equal(assetCalls, urls.length);
  });

  it("dispatches Better Auth routes without falling through to assets", async () => {
    const authResponse = Response.json({ route: "better-auth" });
    const authStub = createAuthStub({ response: authResponse });
    const { env, getAssetCalls } = createEnvironment();
    const worker = createTestWorker({ createAuth: () => authStub.auth });

    const signInResponse = await worker.fetch(
      new Request("https://example.test/api/auth/sign-in/email", {
        method: "POST",
      }),
      env
    );
    const baseResponse = await worker.fetch(
      new Request("https://example.test/api/auth"),
      env
    );

    assert.deepEqual(await signInResponse.json(), { route: "better-auth" });
    assert.deepEqual(await baseResponse.json(), { route: "better-auth" });
    assert.equal(authStub.getHandlerCalls(), 2);
    assert.equal(getAssetCalls(), 0);
  });

  it("does not expose Better Auth anonymous deletion without Parrot cleanup", async () => {
    const authStub = createAuthStub();
    const { env, getAssetCalls } = createEnvironment();
    const worker = createTestWorker({ createAuth: () => authStub.auth });

    const response = await worker.fetch(
      new Request("https://example.test/api/auth/delete-anonymous-user", {
        headers: { origin: "https://example.test" },
        method: "POST",
      }),
      env,
    );

    assert.equal(response.status, 404);
    assert.equal(authStub.getHandlerCalls(), 0);
    assert.equal(getAssetCalls(), 0);
  });

  it("purges guest data before internally deleting the anonymous auth user", async () => {
    const events = [];
    const bucket = {};
    const databaseBinding = {};
    const auth = {
      api: {
        async getSession() {
          events.push("session");
          return {
            session: { id: "guest-session" },
            user: {
              id: "guest-user",
              isAnonymous: true,
              name: "Guest",
            },
          };
        },
      },
      async handler(request) {
        events.push("delete");
        assert.equal(
          new URL(request.url).pathname,
          "/api/auth/delete-anonymous-user",
        );
        assert.equal(request.method, "POST");
        assert.deepEqual(events, ["session", "purge", "delete"]);
        return Response.json(
          { success: true },
          { headers: { "set-cookie": "guest-session=; Max-Age=0" } },
        );
      },
    };
    const { env, getAssetCalls } = createEnvironment();
    env.DB = databaseBinding;
    env.PERSONALIZED_STORY_ART_BUCKET = bucket;
    const worker = createTestWorker({
      createAuth: () => auth,
      async prepareAccountDeletion(input) {
        events.push("purge");
        assert.equal(input.bucket, bucket);
        assert.equal(input.userId, "guest-user");
      },
    });

    const response = await worker.fetch(
      new Request("https://example.test/api/guest-account", {
        headers: { origin: "https://example.test" },
        method: "POST",
      }),
      env,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
    assert.deepEqual(events, ["session", "purge", "delete"]);
    assert.equal(getAssetCalls(), 0);
  });

  it("keeps regular accounts out of the guest deletion path", async () => {
    let purgeCalls = 0;
    let deleteCalls = 0;
    const auth = {
      api: {
        async getSession() {
          return {
            session: { id: "regular-session" },
            user: { id: "regular-user", isAnonymous: false, name: "Mary" },
          };
        },
      },
      async handler() {
        deleteCalls += 1;
        return Response.json({ success: true });
      },
    };
    const { env, getAssetCalls } = createEnvironment();
    env.DB = {};
    env.PERSONALIZED_STORY_ART_BUCKET = {};
    const worker = createTestWorker({
      createAuth: () => auth,
      async prepareAccountDeletion() {
        purgeCalls += 1;
      },
    });

    const response = await worker.fetch(
      new Request("https://example.test/api/guest-account", {
        headers: { origin: "https://example.test" },
        method: "POST",
      }),
      env,
    );

    assert.equal(response.status, 403);
    assert.equal(purgeCalls, 0);
    assert.equal(deleteCalls, 0);
    assert.equal(getAssetCalls(), 0);
  });

  it("rejects cross-origin guest deletion before cleanup", async () => {
    let purgeCalls = 0;
    let deleteCalls = 0;
    const auth = {
      api: {
        async getSession() {
          return {
            session: { id: "guest-session" },
            user: { id: "guest-user", isAnonymous: true, name: "Guest" },
          };
        },
      },
      async handler() {
        deleteCalls += 1;
        return Response.json({ success: true });
      },
    };
    const { env, getAssetCalls } = createEnvironment();
    env.DB = {};
    env.PERSONALIZED_STORY_ART_BUCKET = {};
    const worker = createTestWorker({
      createAuth: () => auth,
      async prepareAccountDeletion() {
        purgeCalls += 1;
      },
    });

    const response = await worker.fetch(
      new Request("https://example.test/api/guest-account", {
        headers: { origin: "https://attacker.example" },
        method: "POST",
      }),
      env,
    );

    assert.equal(response.status, 403);
    assert.equal(purgeCalls, 0);
    assert.equal(deleteCalls, 0);
    assert.equal(getAssetCalls(), 0);
  });

  it("rejects non-POST guest deletion before cleanup", async () => {
    let sessionCalls = 0;
    const auth = {
      api: {
        async getSession() {
          sessionCalls += 1;
          return null;
        },
      },
      async handler() {
        assert.fail("Guest deletion handler must not receive GET requests.");
      },
    };
    const { env, getAssetCalls } = createEnvironment();
    const worker = createTestWorker({ createAuth: () => auth });

    const response = await worker.fetch(
      new Request("https://example.test/api/guest-account", {
        headers: { origin: "https://example.test" },
        method: "GET",
      }),
      env,
    );

    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
    assert.equal(sessionCalls, 0);
    assert.equal(getAssetCalls(), 0);
  });

  it("rejects every anonymous lesson-recording route before its handler", async () => {
    const authStub = createAuthStub();
    const { env, getAssetCalls } = createEnvironment();
    let handlerCalls = 0;
    const worker = createTestWorker({
      createAuth: () => authStub.auth,
      async handleLessonRecordingRequest() {
        handlerCalls += 1;
        return Response.json({ saved: true });
      },
    });

    for (const [method, path] of [
      ["GET", "/api/lesson-recordings/consent"],
      [
        "PUT",
        "/api/lesson-recordings/parrot/01-peppas-high-ball/scenes/0/steps/2",
      ],
      ["DELETE", "/api/lesson-recordings/anything"],
    ]) {
      const response = await worker.fetch(
        new Request(`https://example.test${path}`, { method }),
        env,
      );
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.deepEqual(await response.json(), { error: "unauthorized" });
    }

    assert.equal(authStub.getSessionCalls(), 3);
    assert.equal(handlerCalls, 0);
    assert.equal(getAssetCalls(), 0);
  });

  it("dispatches authenticated recording routes with the exact session-selected learner", async () => {
    const authStub = createAuthStub({
      session: {
        session: { id: "session-1" },
        user: { id: "user-1", name: " Parent One " },
      },
    });
    const state = createTestD1Database();
    const { env, getAssetCalls } = createEnvironment();
    const timestamp = Date.parse("2026-08-26T08:00:00.000Z");
    state.sqlite
      .prepare(
        "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
      )
      .run("user-1", "Parent One", "parent@example.test", timestamp, timestamp);
    state.sqlite
      .prepare(
        "INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        "session-1",
        timestamp + 86_400_000,
        "token-1",
        timestamp,
        timestamp,
        "user-1",
      );
    state.sqlite
      .prepare(
        `INSERT INTO learner_profile
          (id, auth_user_id, legacy_storage_owner, name, onboarding_status, created_at, updated_at)
         VALUES ('learner-b', 'user-1', 0, 'Leo', 'completed', ?, ?)`,
      )
      .run(timestamp, timestamp);
    state.sqlite
      .prepare(
        `INSERT INTO session_learner_selection
          (session_id, auth_user_id, learner_profile_id, created_at, updated_at)
         VALUES ('session-1', 'user-1', 'learner-b', ?, ?)`,
      )
      .run(timestamp, timestamp);
    env.DB = state.d1;
    let received;
    const worker = createTestWorker({
      createAuth: () => authStub.auth,
      async handleLessonRecordingRequest(input) {
        received = input;
        return Response.json({ routed: true }, { status: 201 });
      },
    });
    const request = new Request(
      "https://example.test/api/lesson-recordings/parrot/01-peppas-high-ball/scenes/0/steps/2",
      { method: "PUT" },
    );

    try {
      const response = await worker.fetch(request, env);

      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), { routed: true });
      assert.deepEqual(received.identity, {
        sessionId: "session-1",
        userId: "user-1",
        userName: "Parent One",
        learnerProfileId: "learner-b",
        learnerName: "Leo",
        legacyStorageOwner: false,
      });
      assert.strictEqual(received.request, request);
      assert.equal(getAssetCalls(), 0);
    } finally {
      state.close();
    }
  });

  it("rejects anonymous speech evaluation before protected dependencies run", async () => {
    const authStub = createAuthStub();
    const { env } = createEnvironment();
    let rateLimitCalls = 0;
    let evaluationCalls = 0;
    const worker = createTestWorker({
      createAuth: () => authStub.auth,
      checkEvaluateSpeechRateLimit() {
        rateLimitCalls += 1;
        return null;
      },
      async handleEvaluateSpeech() {
        evaluationCalls += 1;
        return Response.json({ ok: true });
      },
    });

    const response = await worker.fetch(
      new Request("https://example.test/api/evaluate-speech", {
        method: "POST",
      }),
      env
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
    assert.equal(authStub.getSessionCalls(), 1);
    assert.equal(rateLimitCalls, 0);
    assert.equal(evaluationCalls, 0);
  });

  it("allows an authenticated session through the existing speech path", async () => {
    const authStub = createAuthStub({
      session: { session: { id: "session-1" }, user: { id: "user-1" } },
    });
    const { env } = createEnvironment();
    let rateLimitCalls = 0;
    let evaluationCalls = 0;
    const worker = createTestWorker({
      createAuth: () => authStub.auth,
      checkEvaluateSpeechRateLimit() {
        rateLimitCalls += 1;
        return null;
      },
      async handleEvaluateSpeech() {
        evaluationCalls += 1;
        return Response.json({ evaluated: true });
      },
    });

    const response = await worker.fetch(
      new Request("https://example.test/api/evaluate-speech", {
        method: "POST",
        headers: { Cookie: "better-auth.session_token=test" },
      }),
      env
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { evaluated: true });
    assert.equal(authStub.getSessionCalls(), 1);
    assert.equal(rateLimitCalls, 1);
    assert.equal(evaluationCalls, 1);
  });

  it("returns an existing rate-limit response before speech evaluation", async () => {
    const authStub = createAuthStub({
      session: { session: { id: "session-1" }, user: { id: "user-1" } },
    });
    const { env } = createEnvironment();
    let evaluationCalls = 0;
    const worker = createTestWorker({
      createAuth: () => authStub.auth,
      checkEvaluateSpeechRateLimit() {
        return Response.json({ error: "rate_limited" }, { status: 429 });
      },
      async handleEvaluateSpeech() {
        evaluationCalls += 1;
        return Response.json({ evaluated: true });
      },
    });

    const response = await worker.fetch(
      new Request("https://example.test/api/evaluate-speech", {
        method: "POST",
      }),
      env
    );

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: "rate_limited" });
    assert.equal(evaluationCalls, 0);
  });

  it("rate limits authenticated onboarding transcription before its handler", async () => {
    const authStub = createAuthStub({
      session: { session: { id: "session-1" }, user: { id: "user-1" } },
    });
    const { env } = createEnvironment();
    let rateLimitIdentity = "";
    let learnerProfileCalls = 0;
    const worker = createTestWorker({
      createAuth: () => authStub.auth,
      checkLearnerProfileTranscriptionRateLimit(_request, _env, userId) {
        rateLimitIdentity = userId;
        return Response.json({ error: "rate_limited" }, { status: 429 });
      },
      async handleLearnerProfileRequest() {
        learnerProfileCalls += 1;
        return Response.json({ transcribed: true });
      },
    });

    const response = await worker.fetch(
      new Request("https://example.test/api/learner-profile/transcribe", {
        method: "POST",
      }),
      env,
    );

    assert.equal(response.status, 429);
    assert.equal(rateLimitIdentity, "user-1");
    assert.equal(learnerProfileCalls, 0);
  });

  it("rate limits authenticated answer and profile enrichment before handlers", async () => {
    const authStub = createAuthStub({
      session: { session: { id: "session-1" }, user: { id: "user-1" } },
    });
    const state = createTestD1Database();
    try {
      const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
      state.sqlite
        .prepare(
          "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
        )
        .run("user-1", "Parent", "parent@example.test", timestamp, timestamp);
      state.sqlite
        .prepare(
          "INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          "session-1",
          timestamp + 86_400_000,
          "token-1",
          timestamp,
          timestamp,
          "user-1",
        );
      await createGuardianAccessRepository(createDatabase(state.d1)).unlock(
        "session-1",
      );
      const { env } = createEnvironment();
      env.DB = state.d1;
      const limitedPaths = [];
      let learnerProfileCalls = 0;
      const worker = createTestWorker({
        createAuth: () => authStub.auth,
        checkLearnerProfileEnrichmentRateLimit(request, _env, userId) {
          limitedPaths.push([new URL(request.url).pathname, userId]);
          return Response.json({ error: "rate_limited" }, { status: 429 });
        },
        async handleLearnerProfileRequest() {
          learnerProfileCalls += 1;
          return Response.json({ saved: true });
        },
      });

      for (const path of ["/api/learner-profile/answer", "/api/profile"]) {
        const response = await worker.fetch(
          new Request(`https://example.test${path}`, { method: "PUT" }),
          env,
        );
        assert.equal(response.status, 429, path);
      }
      assert.deepEqual(limitedPaths, [
        ["/api/learner-profile/answer", "user-1"],
        ["/api/profile", "user-1"],
      ]);
      assert.equal(learnerProfileCalls, 0);
    } finally {
      state.close();
    }
  });

  it("rejects anonymous guardian access without running protected dependencies", async () => {
    const authStub = createAuthStub();
    const { env } = createEnvironment();
    let rateLimitCalls = 0;
    let handlerCalls = 0;
    const worker = createTestWorker({
      createAuth: () => authStub.auth,
      checkGuardianUnlockRateLimit() {
        rateLimitCalls += 1;
        return null;
      },
      async handleGuardianAccessRequest() {
        handlerCalls += 1;
        return Response.json({ mode: "learner" });
      },
    });

    const response = await worker.fetch(
      new Request("https://example.test/api/guardian-access", { method: "POST" }),
      env,
    );

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { error: "unauthorized" });
    assert.equal(authStub.getSessionCalls(), 1);
    assert.equal(rateLimitCalls, 0);
    assert.equal(handlerCalls, 0);
  });

  it("uses one request-scoped auth instance for session and password verification", async () => {
    const authStub = createAuthStub({
      session: { session: { id: "session-1" }, user: { id: "user-1" } },
    });
    const { env } = createEnvironment();
    let authFactoryCalls = 0;
    let receivedIdentity;
    const worker = createTestWorker({
      createAuth() {
        authFactoryCalls += 1;
        return authStub.auth;
      },
      checkGuardianUnlockRateLimit: async () => null,
      async handleGuardianAccessRequest(input) {
        receivedIdentity = input.identity;
        assert.equal(await input.verifyPassword("guardian-secret"), true);
        return Response.json({ mode: "guardian" });
      },
    });
    const headers = new globalThis.Headers({
      Cookie: "better-auth.session_token=test",
    });
    const request = new Request("https://example.test/api/guardian-access", {
      method: "POST",
      headers,
    });

    const response = await worker.fetch(
      request,
      env,
    );

    assert.equal(response.status, 200);
    assert.equal(authFactoryCalls, 1);
    assert.deepEqual(receivedIdentity, {
      sessionId: "session-1",
      userId: "user-1",
      userName: null,
    });
    assert.equal(authStub.getSessionCalls(), 1);
    assert.equal(authStub.getPasswordCalls().length, 1);
    assert.deepEqual(authStub.getPasswordCalls()[0].body, {
      password: "guardian-secret",
    });
    assert.equal(authStub.getPasswordCalls()[0].headers, request.headers);
  });

  it("stops rate-limited guardian unlocks before password verification", async () => {
    const authStub = createAuthStub({
      session: { session: { id: "session-1" }, user: { id: "user-1" } },
    });
    const { env } = createEnvironment();
    let rateLimitUserId;
    let handlerCalls = 0;
    const worker = createTestWorker({
      createAuth: () => authStub.auth,
      checkGuardianUnlockRateLimit(_request, _env, userId) {
        rateLimitUserId = userId;
        return Response.json({ error: "rate_limited" }, { status: 429 });
      },
      async handleGuardianAccessRequest() {
        handlerCalls += 1;
        return Response.json({ mode: "guardian" });
      },
    });

    const response = await worker.fetch(
      new Request("https://example.test/api/guardian-access", { method: "POST" }),
      env,
    );

    assert.equal(response.status, 429);
    assert.equal(rateLimitUserId, "user-1");
    assert.equal(handlerCalls, 0);
    assert.equal(authStub.getPasswordCalls().length, 0);
  });

  it("normalizes only Better Auth invalid-password errors", async () => {
    const invalidPassword = new APIError("BAD_REQUEST", {
      code: "INVALID_PASSWORD",
      message: "Invalid password",
    });
    const authStub = createAuthStub({
      session: { session: { id: "session-1" }, user: { id: "user-1" } },
      verifyPassword: async () => {
        throw invalidPassword;
      },
    });
    const { env } = createEnvironment();
    const worker = createTestWorker({
      createAuth: () => authStub.auth,
      checkGuardianUnlockRateLimit: async () => null,
      async handleGuardianAccessRequest(input) {
        return Response.json({ verified: await input.verifyPassword("wrong") });
      },
    });

    const invalidResponse = await worker.fetch(
      new Request("https://example.test/api/guardian-access", { method: "POST" }),
      env,
    );
    assert.deepEqual(await invalidResponse.json(), { verified: false });

    const unexpected = new Error("database unavailable");
    const brokenAuth = createAuthStub({
      session: { session: { id: "session-1" }, user: { id: "user-1" } },
      verifyPassword: async () => {
        throw unexpected;
      },
    });
    const brokenWorker = createTestWorker({
      createAuth: () => brokenAuth.auth,
      checkGuardianUnlockRateLimit: async () => null,
      async handleGuardianAccessRequest(input) {
        await input.verifyPassword("secret");
        return Response.json({ mode: "guardian" });
      },
    });

    await assert.rejects(
      brokenWorker.fetch(
        new Request("https://example.test/api/guardian-access", { method: "POST" }),
        env,
      ),
      (error) => error === unexpected,
    );
  });

  it("keeps non-auth and non-speech requests on the static asset fallback", async () => {
    let authFactoryCalls = 0;
    const assetResponse = new Response("lesson app");
    const { env, getAssetCalls } = createEnvironment(assetResponse);
    const worker = createTestWorker({
      createAuth() {
        authFactoryCalls += 1;
        return createAuthStub().auth;
      },
    });

    const response = await worker.fetch(
      new Request("https://example.test/lesson"),
      env
    );

    assert.equal(await response.text(), "lesson app");
    assert.equal(getAssetCalls(), 1);
    assert.equal(authFactoryCalls, 0);
  });
});
