import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as apiSecurity from "../worker/api-security.ts";

const { checkEvaluateSpeechRateLimit } = apiSecurity;

describe("API security", () => {
  it("rate limits speech evaluation by client address", async () => {
    const env = {
      EVALUATE_RATE_LIMIT_MAX: "2",
      EVALUATE_RATE_LIMIT_WINDOW_SECONDS: "60",
    };
    const request = () =>
      new Request("https://example.test/api/evaluate-speech", {
        method: "POST",
        headers: {
          "CF-Connecting-IP": "203.0.113.42",
        },
      });

    assert.equal(checkEvaluateSpeechRateLimit(request(), env, 0), null);
    assert.equal(checkEvaluateSpeechRateLimit(request(), env, 1000), null);

    const limited = checkEvaluateSpeechRateLimit(request(), env, 2000);
    const payload = await limited.json();

    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("Retry-After"), "58");
    assert.equal(payload.error, "rate_limited");
  });

  it("rate limits onboarding transcription by user and client address", async () => {
    assert.equal(
      typeof apiSecurity.checkOnboardingTranscriptionRateLimit,
      "function",
    );
    const env = {
      ONBOARDING_TRANSCRIPTION_RATE_LIMIT_MAX: "2",
      ONBOARDING_TRANSCRIPTION_RATE_LIMIT_WINDOW_SECONDS: "60",
    };
    const request = () =>
      new Request("https://example.test/api/onboarding/transcribe", {
        method: "POST",
        headers: { "CF-Connecting-IP": "203.0.113.42" },
      });

    assert.equal(
      apiSecurity.checkOnboardingTranscriptionRateLimit(
        request(),
        env,
        "user-1",
        0,
      ),
      null,
    );
    assert.equal(
      apiSecurity.checkOnboardingTranscriptionRateLimit(
        request(),
        env,
        "user-1",
        1_000,
      ),
      null,
    );
    const limited = apiSecurity.checkOnboardingTranscriptionRateLimit(
      request(),
      env,
      "user-1",
      2_000,
    );
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("Retry-After"), "58");
    assert.equal(
      apiSecurity.checkOnboardingTranscriptionRateLimit(
        request(),
        env,
        "user-2",
        2_000,
      ),
      null,
    );
  });

  it("shares one enrichment bucket across onboarding answers and profile edits", async () => {
    assert.equal(typeof apiSecurity.checkOnboardingEnrichmentRateLimit, "function");
    const env = {
      ONBOARDING_ENRICHMENT_RATE_LIMIT_MAX: "2",
      ONBOARDING_ENRICHMENT_RATE_LIMIT_WINDOW_SECONDS: "60",
    };
    const answer = new Request(
      "https://example.test/api/onboarding/answer",
      {
        method: "PUT",
        headers: { "CF-Connecting-IP": "203.0.113.42" },
      },
    );
    const profile = new Request("https://example.test/api/profile", {
      method: "PUT",
      headers: { "CF-Connecting-IP": "203.0.113.42" },
    });

    assert.equal(
      apiSecurity.checkOnboardingEnrichmentRateLimit(answer, env, "user-1", 0),
      null,
    );
    assert.equal(
      apiSecurity.checkOnboardingEnrichmentRateLimit(
        profile,
        env,
        "user-1",
        1_000,
      ),
      null,
    );
    const limited = apiSecurity.checkOnboardingEnrichmentRateLimit(
      answer,
      env,
      "user-1",
      2_000,
    );
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("Retry-After"), "58");
    assert.equal(
      apiSecurity.checkOnboardingEnrichmentRateLimit(
        profile,
        env,
        "user-2",
        2_000,
      ),
      null,
    );
  });
});
