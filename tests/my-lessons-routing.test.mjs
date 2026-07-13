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

describe("My Lessons Worker routing", () => {
  it("rejects anonymous list, create, generation, and detail requests", async () => {
    let handlerCalls = 0;
    const worker = createWorker({
      createAuth: () => authStub(null),
      async handleMyLessonRequest() {
        handlerCalls += 1;
        return Response.json({ ok: true });
      },
    });

    for (const [method, path] of [
      ["GET", "/api/lessons/my"],
      ["POST", "/api/lessons/my"],
      ["POST", "/api/lessons/my/generate"],
      ["GET", "/api/lessons/my/lesson-1"],
    ]) {
      const response = await worker.fetch(
        new Request(`https://example.test${path}`, { method }),
        environment(),
      );
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.deepEqual(await response.json(), { error: "unauthorized" });
    }
    assert.equal(handlerCalls, 0);
  });

  it("passes authenticated identity and D1 to the My Lessons handler", async () => {
    const calls = [];
    const session = {
      session: { id: "session-1" },
      user: { id: "user-1", name: "Parent", email: "parent@example.test" },
    };
    const worker = createWorker({
      createAuth: () => authStub(session),
      async handleMyLessonRequest(input) {
        calls.push(input);
        return Response.json({ routed: true });
      },
    });
    const env = environment();
    const request = new Request("https://example.test/api/lessons/my");

    const response = await worker.fetch(request, env);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { routed: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].request, request);
    assert.equal(calls[0].database.$client, env.DB);
    assert.deepEqual(calls[0].identity, {
      sessionId: "session-1",
      userId: "user-1",
      userName: "Parent",
    });
  });

  it("rate limits generation before invoking its handler", async () => {
    let handlerCalls = 0;
    let limiterCalls = 0;
    const session = {
      session: { id: "session-1" },
      user: { id: "user-1", name: "Parent", email: "parent@example.test" },
    };
    const worker = createWorker({
      createAuth: () => authStub(session),
      async checkLessonGenerationRateLimit(_request, _env, userId) {
        limiterCalls += 1;
        assert.equal(userId, "user-1");
        return Response.json({ error: "rate_limited" }, { status: 429 });
      },
      async handleMyLessonRequest() {
        handlerCalls += 1;
        return Response.json({ ok: true });
      },
    });

    const response = await worker.fetch(
      new Request("https://example.test/api/lessons/my/generate", {
        method: "POST",
      }),
      environment(),
    );

    assert.equal(response.status, 429);
    assert.equal(limiterCalls, 1);
    assert.equal(handlerCalls, 0);
  });
});
