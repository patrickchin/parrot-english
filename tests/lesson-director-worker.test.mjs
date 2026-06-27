import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { AI_LESSON } from "../lib/ai-lesson-data.js";
import { getMockDirectorPacket } from "../lib/mock-lesson-director.js";
import { handleLessonDirector } from "../worker/lesson-director.ts";
import { callLessonDirectorProvider } from "../worker/lesson-director-provider.ts";

const originalFetch = globalThis.fetch;

const runtimeState = {
  currentSceneId: "greeting",
  phase: "start_scene",
  attemptNumber: 0,
  successfulRepeats: 0,
  previousTurnSummary: [],
  lastChildResult: null,
};

function createBody(overrides = {}) {
  return {
    lesson: AI_LESSON,
    runtimeState,
    ...overrides,
  };
}

function createRequest(body = createBody(), init = {}) {
  return new Request("https://example.test/api/lesson-director", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    body: JSON.stringify(body),
    ...init,
  });
}

function expectedFallbackPacket() {
  const packet = getMockDirectorPacket(AI_LESSON, runtimeState);
  return {
    ...packet,
    lessonControl: {
      ...packet.lessonControl,
      reason: "director_fallback",
    },
  };
}

async function readJson(response) {
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  return response.json();
}

describe("lesson director Worker handler", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns a validated provider packet when the provider returns a valid packet", async () => {
    const providerPacket = {
      ...getMockDirectorPacket(AI_LESSON, runtimeState),
      packetId: "provider-greeting-start-001",
    };
    const env = {
      LESSON_DIRECTOR_API_KEY: "test-key",
      LESSON_DIRECTOR_BASE_URL: "https://provider.test/director",
    };
    const calls = [];

    const response = await handleLessonDirector(createRequest(), env, async (...args) => {
      calls.push(args);
      return providerPacket;
    });
    const payload = await readJson(response);

    assert.equal(response.status, 200);
    assert.deepEqual(payload, providerPacket);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][0], createBody());
    assert.equal(calls[0][1], env);
  });

  it("falls back to a deterministic packet when the provider packet is invalid", async () => {
    const response = await handleLessonDirector(createRequest(), {}, async () => ({
      schemaVersion: "wrong",
    }));
    const payload = await readJson(response);

    assert.equal(response.status, 200);
    assert.deepEqual(payload, expectedFallbackPacket());
    assert.equal(payload.lessonControl.status, "prompt_child");
    assert.equal(payload.lessonControl.reason, "director_fallback");
  });

  it("falls back to a deterministic packet when the provider throws", async () => {
    const response = await handleLessonDirector(createRequest(), {}, async () => {
      throw new Error("provider unavailable");
    });
    const payload = await readJson(response);

    assert.equal(response.status, 200);
    assert.deepEqual(payload, expectedFallbackPacket());
    assert.equal(payload.lessonControl.reason, "director_fallback");
  });

  it("returns a JSON 405 error for non-POST requests", async () => {
    const response = await handleLessonDirector(
      new Request("https://example.test/api/lesson-director", { method: "GET" }),
      {},
      async () => getMockDirectorPacket(AI_LESSON, runtimeState)
    );
    const payload = await readJson(response);

    assert.equal(response.status, 405);
    assert.equal(payload.error, "method_not_allowed");
  });

  it("returns a JSON 400 error for invalid JSON bodies", async () => {
    const response = await handleLessonDirector(
      new Request("https://example.test/api/lesson-director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      {},
      async () => getMockDirectorPacket(AI_LESSON, runtimeState)
    );
    const payload = await readJson(response);

    assert.equal(response.status, 400);
    assert.equal(payload.error, "invalid_json");
  });

  it("returns a JSON 400 error when lesson or runtimeState is missing", async () => {
    const cases = [
      { name: "lesson", body: { runtimeState } },
      { name: "runtimeState", body: { lesson: AI_LESSON } },
    ];

    for (const { name, body } of cases) {
      const response = await handleLessonDirector(
        createRequest(body),
        {},
        async () => getMockDirectorPacket(AI_LESSON, runtimeState)
      );
      const payload = await readJson(response);

      assert.equal(response.status, 400, name);
      assert.equal(payload.error, "invalid_request", name);
    }
  });

  it("posts prompts to the configured provider and returns an upstream packet", async () => {
    const providerPacket = getMockDirectorPacket(AI_LESSON, runtimeState);
    let providerRequest;

    globalThis.fetch = async (url, init) => {
      providerRequest = {
        url: String(url),
        method: init?.method,
        headers: init?.headers,
        body: JSON.parse(init?.body),
      };
      return globalThis.Response.json({ packet: providerPacket });
    };

    const packet = await callLessonDirectorProvider(createBody(), {
      LESSON_DIRECTOR_API_KEY: "test-key",
      LESSON_DIRECTOR_BASE_URL: "https://provider.test/director",
      LESSON_DIRECTOR_MODEL: "director-test-model",
    });

    assert.deepEqual(packet, providerPacket);
    assert.equal(providerRequest.url, "https://provider.test/director");
    assert.equal(providerRequest.method, "POST");
    assert.equal(providerRequest.headers.Authorization, "Bearer test-key");
    assert.equal(providerRequest.headers["Content-Type"], "application/json");
    assert.equal(providerRequest.body.model, "director-test-model");
    assert.match(providerRequest.body.systemPrompt, /AI lesson director/);
    assert.match(providerRequest.body.userPrompt, /REQUEST_JSON/);
    assert.equal(providerRequest.body.responseFormat, "json_object");
  });

  it("parses provider outputText when no packet field is returned", async () => {
    const providerPacket = getMockDirectorPacket(AI_LESSON, runtimeState);

    globalThis.fetch = async () =>
      globalThis.Response.json({ outputText: JSON.stringify(providerPacket) });

    const packet = await callLessonDirectorProvider(createBody(), {
      LESSON_DIRECTOR_API_KEY: "test-key",
      LESSON_DIRECTOR_BASE_URL: "https://provider.test/director",
    });

    assert.deepEqual(packet, providerPacket);
  });

  it("throws explicit provider configuration and upstream errors", async () => {
    await assert.rejects(
      () =>
        callLessonDirectorProvider(createBody(), {
          LESSON_DIRECTOR_BASE_URL: "https://provider.test/director",
        }),
      /LESSON_DIRECTOR_API_KEY is required/
    );
    await assert.rejects(
      () =>
        callLessonDirectorProvider(createBody(), {
          LESSON_DIRECTOR_API_KEY: "test-key",
        }),
      /LESSON_DIRECTOR_BASE_URL is required/
    );

    globalThis.fetch = async () =>
      new globalThis.Response("upstream error", { status: 503 });

    await assert.rejects(
      () =>
        callLessonDirectorProvider(createBody(), {
          LESSON_DIRECTOR_API_KEY: "test-key",
          LESSON_DIRECTOR_BASE_URL: "https://provider.test/director",
        }),
      /Lesson director provider failed: 503/
    );
  });

  it("routes /api/lesson-director through the director limiter before assets", () => {
    const workerIndex = readFileSync(
      new URL("../worker/index.ts", import.meta.url),
      "utf8"
    );
    const routeIndex = workerIndex.indexOf('url.pathname === "/api/lesson-director"');
    const assetFallbackIndex = workerIndex.indexOf("return env.ASSETS.fetch(request)");

    assert.ok(routeIndex > -1);
    assert.ok(assetFallbackIndex > -1);
    assert.ok(routeIndex < assetFallbackIndex);
    assert.match(workerIndex, /checkLessonDirectorRateLimit\(request, env\)/);
    assert.match(workerIndex, /handleLessonDirector\(request, env\)/);
  });
});
