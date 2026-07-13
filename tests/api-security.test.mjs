import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as apiSecurity from "../worker/api-security.ts";

function fakeLimiter(successes) {
  const keys = [];
  return {
    keys,
    async limit({ key }) {
      keys.push(key);
      return { success: successes.shift() ?? false };
    },
  };
}

function request(path) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.42" },
  });
}

describe("API security", () => {
  it("rate limits speech evaluation by client address", async () => {
    const limiter = fakeLimiter([true, false]);
    const env = { EVALUATE_RATE_LIMITER: limiter };

    assert.equal(
      await apiSecurity.checkEvaluateSpeechRateLimit(
        request("/api/evaluate-speech"),
        env,
      ),
      null,
    );

    const limited = await apiSecurity.checkEvaluateSpeechRateLimit(
      request("/api/evaluate-speech"),
      env,
    );
    const payload = await limited.json();

    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("Retry-After"), "60");
    assert.equal(payload.error, "rate_limited");
    assert.deepEqual(limiter.keys, ["203.0.113.42", "203.0.113.42"]);
  });

  it("rate limits onboarding transcription by user and client address", async () => {
    const limiter = fakeLimiter([true, false]);
    const env = { LEARNER_PROFILE_TRANSCRIPTION_RATE_LIMITER: limiter };

    assert.equal(
      await apiSecurity.checkLearnerProfileTranscriptionRateLimit(
        request("/api/learner-profile/transcribe"),
        env,
        "user-1",
      ),
      null,
    );

    const limited = await apiSecurity.checkLearnerProfileTranscriptionRateLimit(
      request("/api/learner-profile/transcribe"),
      env,
      "user-1",
    );

    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("Retry-After"), "60");
    assert.deepEqual(limiter.keys, [
      "user-1:203.0.113.42",
      "user-1:203.0.113.42",
    ]);
  });

  it("shares one enrichment bucket across onboarding answers and profile edits", async () => {
    const limiter = fakeLimiter([true, false]);
    const env = { LEARNER_PROFILE_ENRICHMENT_RATE_LIMITER: limiter };

    assert.equal(
      await apiSecurity.checkLearnerProfileEnrichmentRateLimit(
        request("/api/learner-profile/answer"),
        env,
        "user-1",
      ),
      null,
    );

    const limited = await apiSecurity.checkLearnerProfileEnrichmentRateLimit(
      request("/api/profile"),
      env,
      "user-1",
    );

    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("Retry-After"), "60");
    assert.deepEqual(limiter.keys, [
      "user-1:203.0.113.42",
      "user-1:203.0.113.42",
    ]);
  });
});
