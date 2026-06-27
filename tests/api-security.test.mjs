import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkEvaluateSpeechRateLimit,
  checkLessonDirectorRateLimit,
} from "../worker/api-security.ts";

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

  it("rate limits lesson director requests separately from speech evaluation", async () => {
    const env = {
      EVALUATE_RATE_LIMIT_MAX: "1",
      EVALUATE_RATE_LIMIT_WINDOW_SECONDS: "60",
      LESSON_DIRECTOR_RATE_LIMIT_MAX: "1",
      LESSON_DIRECTOR_RATE_LIMIT_WINDOW_SECONDS: "60",
    };
    const headers = {
      "CF-Connecting-IP": "203.0.113.43",
    };
    const speechRequest = () =>
      new Request("https://example.test/api/evaluate-speech", {
        method: "POST",
        headers,
      });
    const directorRequest = () =>
      new Request("https://example.test/api/lesson-director", {
        method: "POST",
        headers,
      });

    assert.equal(checkEvaluateSpeechRateLimit(speechRequest(), env, 0), null);
    assert.equal(checkLessonDirectorRateLimit(directorRequest(), env, 1000), null);

    const speechLimited = checkEvaluateSpeechRateLimit(speechRequest(), env, 2000);
    const directorLimited = checkLessonDirectorRateLimit(
      directorRequest(),
      env,
      3000
    );

    assert.equal(speechLimited.status, 429);
    assert.equal(speechLimited.headers.get("Retry-After"), "58");
    assert.equal(directorLimited.status, 429);
    assert.equal(directorLimited.headers.get("Retry-After"), "58");
  });

  it("returns Retry-After when lesson director requests exceed the limit", async () => {
    const env = {
      LESSON_DIRECTOR_RATE_LIMIT_MAX: "2",
      LESSON_DIRECTOR_RATE_LIMIT_WINDOW_SECONDS: "30",
    };
    const request = () =>
      new Request("https://example.test/api/lesson-director", {
        method: "POST",
        headers: {
          "CF-Connecting-IP": "203.0.113.44",
        },
      });

    assert.equal(checkLessonDirectorRateLimit(request(), env, 0), null);
    assert.equal(checkLessonDirectorRateLimit(request(), env, 1000), null);

    const limited = checkLessonDirectorRateLimit(request(), env, 2500);
    const payload = await limited.json();

    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("Retry-After"), "28");
    assert.equal(payload.error, "rate_limited");
  });
});
