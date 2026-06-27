import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createDirectorSpeechSegmentKey } from "../lib/director-speech-segments.js";
import { handleDirectorTts } from "../worker/director-tts.ts";

function createRequest(body, init = {}) {
  return new Request("https://example.com/api/director-tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  });
}

async function readJson(response) {
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  return response.json();
}

describe("director TTS Worker route", () => {
  it("rejects mixed language segment text", async () => {
    const response = await handleDirectorTts(
      createRequest({
        speaker: "polly",
        lang: "zh-CN",
        text: "轮到你说：Hello, Peppa!",
      }),
      {}
    );
    const payload = await readJson(response);

    assert.equal(response.status, 400);
    assert.equal(payload.error, "mixed_language_segment");
  });

  it("returns a playable data URL for valid text when provider is mocked", async () => {
    const env = { ELEVENLABS_API_KEY: "test-key" };
    const calls = [];
    const response = await handleDirectorTts(
      createRequest({
        speaker: "polly",
        lang: "zh-CN",
        text: "新的动态句子。",
      }),
      env,
      async (...args) => {
        calls.push(args);
        return new Uint8Array([1, 2, 3]);
      }
    );
    const payload = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(payload.audioSrc, "data:audio/mpeg;base64,AQID");
    assert.match(payload.audioSrc, /^data:audio\/mpeg;base64,/);
    assert.match(payload.key, /^polly__zh-CN__/);
    assert.deepEqual(calls, [
      [
        {
          speaker: "polly",
          lang: "zh-CN",
          text: "新的动态句子。",
        },
        env,
      ],
    ]);
  });

  it("preserves original text spacing for segment keys and provider input", async () => {
    const originalText = "  新的动态句子。  ";
    const calls = [];
    const response = await handleDirectorTts(
      createRequest({
        speaker: "polly",
        lang: "zh-CN",
        text: originalText,
      }),
      {},
      async (...args) => {
        calls.push(args);
        return new Uint8Array([1, 2, 3]);
      }
    );
    const payload = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(
      payload.key,
      createDirectorSpeechSegmentKey({
        speaker: "polly",
        lang: "zh-CN",
        text: originalText,
      })
    );
    assert.equal(calls[0][0].text, originalText);
  });

  it("returns a JSON 405 error for non-POST requests", async () => {
    const response = await handleDirectorTts(
      new Request("https://example.com/api/director-tts", { method: "GET" }),
      {}
    );
    const payload = await readJson(response);

    assert.equal(response.status, 405);
    assert.equal(payload.error, "method_not_allowed");
  });

  it("returns a JSON 400 error for invalid JSON", async () => {
    const response = await handleDirectorTts(
      new Request("https://example.com/api/director-tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      {}
    );
    const payload = await readJson(response);

    assert.equal(response.status, 400);
    assert.equal(payload.error, "invalid_json");
  });

  it("returns a JSON 400 error for missing or empty required fields", async () => {
    const cases = [
      { name: "missing speaker", body: { lang: "zh-CN", text: "新的动态句子。" } },
      { name: "empty speaker", body: { speaker: " ", lang: "zh-CN", text: "新的动态句子。" } },
      { name: "missing lang", body: { speaker: "polly", text: "新的动态句子。" } },
      { name: "empty lang", body: { speaker: "polly", lang: "", text: "新的动态句子。" } },
      { name: "missing text", body: { speaker: "polly", lang: "zh-CN" } },
      { name: "empty text", body: { speaker: "polly", lang: "zh-CN", text: " " } },
    ];

    for (const { name, body } of cases) {
      const response = await handleDirectorTts(createRequest(body), {});
      const payload = await readJson(response);

      assert.equal(response.status, 400, name);
      assert.equal(payload.error, "invalid_request", name);
    }
  });

  it("returns a JSON 400 error for unsupported speaker or language", async () => {
    const cases = [
      {
        name: "speaker",
        body: { speaker: "george", lang: "zh-CN", text: "新的动态句子。" },
      },
      {
        name: "language",
        body: { speaker: "polly", lang: "fr-FR", text: "Bonjour." },
      },
    ];

    for (const { name, body } of cases) {
      const response = await handleDirectorTts(createRequest(body), {});
      const payload = await readJson(response);

      assert.equal(response.status, 400, name);
      assert.equal(payload.error, "invalid_request", name);
    }
  });

  it("returns a JSON 503 error when no provider is configured", async () => {
    const response = await handleDirectorTts(
      createRequest({
        speaker: "polly",
        lang: "zh-CN",
        text: "新的动态句子。",
      }),
      {}
    );
    const payload = await readJson(response);

    assert.equal(response.status, 503);
    assert.equal(payload.error, "tts_provider_unconfigured");
  });

  it("returns a JSON 502 error when the provider fails", async () => {
    const response = await handleDirectorTts(
      createRequest({
        speaker: "polly",
        lang: "zh-CN",
        text: "新的动态句子。",
      }),
      {},
      async () => {
        throw new Error("upstream failed");
      }
    );
    const payload = await readJson(response);

    assert.equal(response.status, 502);
    assert.equal(payload.error, "tts_generation_failed");
  });

  it("returns a JSON 502 error when the provider returns empty audio", async () => {
    const response = await handleDirectorTts(
      createRequest({
        speaker: "polly",
        lang: "zh-CN",
        text: "新的动态句子。",
      }),
      {},
      async () => new Uint8Array([])
    );
    const payload = await readJson(response);

    assert.equal(response.status, 502);
    assert.equal(payload.error, "tts_generation_failed");
  });

  it("rate limits valid generation requests before calling the provider again", async () => {
    const env = {
      DIRECTOR_TTS_RATE_LIMIT_MAX: "1",
      DIRECTOR_TTS_RATE_LIMIT_WINDOW_MS: "60000",
    };
    const headers = {
      "content-type": "application/json",
      "CF-Connecting-IP": "203.0.113.201",
    };
    let providerCallCount = 0;
    const generateAudio = async () => {
      providerCallCount += 1;
      return new Uint8Array([1, 2, 3]);
    };
    const body = {
      speaker: "polly",
      lang: "zh-CN",
      text: "新的动态句子。",
    };

    const first = await handleDirectorTts(
      createRequest(body, { headers }),
      env,
      generateAudio
    );
    const second = await handleDirectorTts(
      createRequest(body, { headers }),
      env,
      generateAudio
    );
    const payload = await readJson(second);

    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
    assert.equal(payload.error, "rate_limited");
    assert.equal(providerCallCount, 1);
  });

  it("does not let rate limiting preempt validation errors", async () => {
    const env = {
      DIRECTOR_TTS_RATE_LIMIT_MAX: "1",
      DIRECTOR_TTS_RATE_LIMIT_WINDOW_MS: "60000",
    };
    const headers = {
      "content-type": "application/json",
      "CF-Connecting-IP": "203.0.113.202",
    };
    const response = await handleDirectorTts(
      createRequest({
        speaker: "polly",
        lang: "zh-CN",
        text: "新的动态句子。",
      }, { headers }),
      env,
      async () => new Uint8Array([1, 2, 3])
    );

    const invalidJson = await handleDirectorTts(
      new Request("https://example.com/api/director-tts", {
        method: "POST",
        headers,
        body: "{",
      }),
      env,
      async () => {
        throw new Error("Invalid JSON should not call provider");
      }
    );
    const nonPost = await handleDirectorTts(
      new Request("https://example.com/api/director-tts", {
        method: "GET",
        headers,
      }),
      env
    );
    const invalidJsonPayload = await readJson(invalidJson);
    const nonPostPayload = await readJson(nonPost);

    assert.equal(response.status, 200);
    assert.equal(invalidJson.status, 400);
    assert.equal(invalidJsonPayload.error, "invalid_json");
    assert.equal(nonPost.status, 405);
    assert.equal(nonPostPayload.error, "method_not_allowed");
  });

  it("returns a JSON 413 error for oversized raw request bodies before provider or rate limit", async () => {
    const env = {
      DIRECTOR_TTS_RATE_LIMIT_MAX: "1",
      DIRECTOR_TTS_RATE_LIMIT_WINDOW_MS: "60000",
    };
    const headers = {
      "content-type": "application/json",
      "CF-Connecting-IP": "203.0.113.203",
    };
    let providerCallCount = 0;
    const generateAudio = async () => {
      providerCallCount += 1;
      return new Uint8Array([1, 2, 3]);
    };
    const first = await handleDirectorTts(
      createRequest({
        speaker: "polly",
        lang: "zh-CN",
        text: "新的动态句子。",
      }, { headers }),
      env,
      generateAudio
    );
    const oversized = await handleDirectorTts(
      new Request("https://example.com/api/director-tts", {
        method: "POST",
        headers,
        body: "x".repeat(17 * 1024),
      }),
      env,
      generateAudio
    );
    const payload = await readJson(oversized);

    assert.equal(first.status, 200);
    assert.equal(oversized.status, 413);
    assert.equal(payload.error, "payload_too_large");
    assert.equal(providerCallCount, 1);
  });

  it("returns a JSON 400 error for overlong segment text before provider or rate limit", async () => {
    const env = {
      DIRECTOR_TTS_RATE_LIMIT_MAX: "1",
      DIRECTOR_TTS_RATE_LIMIT_WINDOW_MS: "60000",
    };
    const headers = {
      "content-type": "application/json",
      "CF-Connecting-IP": "203.0.113.204",
    };
    let providerCallCount = 0;
    const generateAudio = async () => {
      providerCallCount += 1;
      return new Uint8Array([1, 2, 3]);
    };
    const first = await handleDirectorTts(
      createRequest({
        speaker: "polly",
        lang: "zh-CN",
        text: "新的动态句子。",
      }, { headers }),
      env,
      generateAudio
    );
    const overlong = await handleDirectorTts(
      createRequest({
        speaker: "polly",
        lang: "zh-CN",
        text: "句".repeat(501),
      }, { headers }),
      env,
      generateAudio
    );
    const payload = await readJson(overlong);

    assert.equal(first.status, 200);
    assert.equal(overlong.status, 400);
    assert.equal(payload.error, "text_too_long");
    assert.equal(providerCallCount, 1);
  });

  it("routes /api/director-tts before static assets", () => {
    const workerIndex = readFileSync(
      new URL("../worker/index.ts", import.meta.url),
      "utf8"
    );
    const routeIndex = workerIndex.indexOf('url.pathname === "/api/director-tts"');
    const handlerIndex = workerIndex.indexOf("handleDirectorTts(request, env)");
    const assetFallbackIndex = workerIndex.indexOf("return env.ASSETS.fetch(request)");

    assert.ok(routeIndex > -1);
    assert.ok(handlerIndex > -1);
    assert.ok(assetFallbackIndex > -1);
    assert.ok(routeIndex < assetFallbackIndex);
    assert.ok(handlerIndex < assetFallbackIndex);
    assert.match(workerIndex, /handleDirectorTts\(request, env\)/);
  });

  it("checks the director TTS rate limit inside the handler before generation", () => {
    const handlerSource = readFileSync(
      new URL("../worker/director-tts.ts", import.meta.url),
      "utf8"
    );
    const limiterIndex = handlerSource.indexOf(
      "checkDirectorTtsRateLimit(request, env)"
    );
    const generationIndex = handlerSource.indexOf("generateAudio(segment, env)");

    assert.ok(limiterIndex > -1);
    assert.ok(generationIndex > -1);
    assert.ok(limiterIndex < generationIndex);
  });
});
