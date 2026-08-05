import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorker } from "../worker/index.ts";

function authStub(session) {
  return {
    api: { async getSession() { return session; } },
    async handler() { return new Response("auth"); },
  };
}

function environment() {
  return {
    ASSETS: { async fetch() { return new Response("asset"); } },
    DB: {},
  };
}

describe("pixel lesson Worker routing", () => {
  it("requires authentication before invoking the endpoint", async () => {
    let handlerCalls = 0;
    const worker = createWorker({
      createAuth: () => authStub(null),
      async handlePixelLessonRequest() {
        handlerCalls += 1;
        return Response.json({ ok: true });
      },
    });

    const response = await worker.fetch(
      new Request("https://example.test/api/pixel-lessons/generate", {
        method: "POST",
      }),
      environment(),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
    assert.equal(handlerCalls, 0);
  });

  it("reuses the lesson generation rate limit before routing", async () => {
    let handlerCalls = 0;
    let limiterCalls = 0;
    const session = {
      session: { id: "session-1" },
      user: { id: "user-1", name: "Parent" },
    };
    const worker = createWorker({
      createAuth: () => authStub(session),
      async checkLessonGenerationRateLimit(_request, _env, userId) {
        limiterCalls += 1;
        assert.equal(userId, "user-1");
        return Response.json({ error: "rate_limited" }, { status: 429 });
      },
      async handlePixelLessonRequest() {
        handlerCalls += 1;
        return Response.json({ ok: true });
      },
    });

    const response = await worker.fetch(
      new Request("https://example.test/api/pixel-lessons/generate", {
        method: "POST",
      }),
      environment(),
    );

    assert.equal(response.status, 429);
    assert.equal(limiterCalls, 1);
    assert.equal(handlerCalls, 0);
  });

  it("passes the authenticated identity and database to the pixel handler", async () => {
    const calls = [];
    const session = {
      session: { id: "session-1" },
      user: { id: "user-1", name: " Parent " },
    };
    const worker = createWorker({
      createAuth: () => authStub(session),
      async checkLessonGenerationRateLimit() {
        return null;
      },
      async handlePixelLessonRequest(input) {
        calls.push(input);
        return Response.json({ routed: true });
      },
    });
    const env = environment();
    const request = new Request(
      "https://example.test/api/pixel-lessons/generate",
      { method: "POST" },
    );

    const response = await worker.fetch(request, env);

    assert.deepEqual(await response.json(), { routed: true });
    assert.equal(calls[0].request, request);
    assert.equal(calls[0].database.$client, env.DB);
    assert.deepEqual(calls[0].identity, {
      sessionId: "session-1",
      userId: "user-1",
      userName: "Parent",
    });
  });
});
