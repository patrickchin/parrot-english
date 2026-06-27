import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkEvaluateSpeechRateLimit } from "../worker/api-security.ts";

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
});
