import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAuth } from "../worker/auth.ts";
import { createDatabase } from "../worker/database.ts";
import * as workerModule from "../worker/index.ts";

const VALID_AUTH_SECRET = "R2F7cFlwMTVNSVZ1LzNZb1ZYVUs5ZDBnKzVYV25VSEk=";

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

function createAuthStub({ session = null, response = new Response("auth") } = {}) {
  let handlerCalls = 0;
  let sessionCalls = 0;

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
      },
    },
    getHandlerCalls: () => handlerCalls,
    getSessionCalls: () => sessionCalls,
  };
}

describe("Worker authentication", () => {
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

  it("trusts the public site and Parrot Worker origins", async () => {
    const productionOrigin = "https://parrot-english.p-ch.workers.dev";
    const auth = createAuth({
      DB: {},
      BETTER_AUTH_SECRET: VALID_AUTH_SECRET,
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
      DB: {},
      BETTER_AUTH_SECRET: VALID_AUTH_SECRET,
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
    const auth = createAuth({
      DB: {},
      BETTER_AUTH_SECRET: VALID_AUTH_SECRET,
      BETTER_AUTH_URL: "https://example.test",
    });

    assert.deepEqual(auth.options.rateLimit, { enabled: true });
    assert.deepEqual(auth.options.advanced?.ipAddress, {
      ipAddressHeaders: ["cf-connecting-ip"],
    });
  });

  it("creates a Drizzle database around the D1 binding", async () => {
    assert.ok(createDatabase({}));
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
    const { env } = createEnvironment();
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
