import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as onboardingApi from "../src/onboarding-api.ts";
import {
  OnboardingApiError,
  completeOnboarding,
  loadOnboarding,
  loadProfile,
  saveOnboardingAnswer,
  skipOnboarding,
  transcribeOnboardingAudio,
} from "../src/onboarding-api.ts";

function jsonFetch(payload = { ok: true }, status = 200) {
  const calls = [];
  return {
    calls,
    fetch: async (...args) => {
      calls.push(args);
      return Response.json(payload, { status });
    },
  };
}

describe("onboarding browser API", () => {
  it("loads onboarding and profile state from same-origin routes", async () => {
    const onboarding = jsonFetch({ profile: { name: "Mia" } });
    assert.deepEqual(
      await loadOnboarding({ fetch: onboarding.fetch }),
      { profile: { name: "Mia" } },
    );
    assert.equal(onboarding.calls[0][0], "/api/onboarding");
    assert.equal(onboarding.calls[0][1].method, "GET");

    const profile = jsonFetch({ questions: [] });
    assert.deepEqual(await loadProfile({ fetch: profile.fetch }), {
      questions: [],
    });
    assert.equal(profile.calls[0][0], "/api/profile");
    assert.equal(profile.calls[0][1].method, "GET");
  });

  it("saves confirmed onboarding values as bounded JSON", async () => {
    const onboarding = jsonFetch({ question: null });
    await saveOnboardingAnswer("age", 8, { fetch: onboarding.fetch });
    assert.equal(onboarding.calls[0][0], "/api/onboarding/answer");
    assert.deepEqual(onboarding.calls[0][1], {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: '{"questionKey":"age","value":8}',
      signal: undefined,
    });

  });

  it("saves all profile answers in one request", async () => {
    assert.equal(typeof onboardingApi.saveProfileAnswers, "function");
    const profile = jsonFetch({ profile: { name: "Maya" } });
    await onboardingApi.saveProfileAnswers(
      {
        name: "Maya",
        age: 8,
        favoriteCartoons: ["Bluey"],
      },
      { fetch: profile.fetch },
    );

    assert.equal(profile.calls[0][0], "/api/profile");
    assert.equal(profile.calls[0][1].method, "PUT");
    assert.deepEqual(JSON.parse(profile.calls[0][1].body), {
      answers: {
        name: "Maya",
        age: 8,
        favoriteCartoons: ["Bluey"],
      },
    });
  });

  it("posts skip and completion transitions", async () => {
    const skipped = jsonFetch({ canBypass: true });
    await skipOnboarding({ fetch: skipped.fetch });
    assert.equal(skipped.calls[0][0], "/api/onboarding/skip");
    assert.equal(skipped.calls[0][1].method, "POST");

    const completed = jsonFetch({ canBypass: true });
    await completeOnboarding({ fetch: completed.fetch });
    assert.equal(completed.calls[0][0], "/api/onboarding/complete");
    assert.equal(completed.calls[0][1].method, "POST");
  });

  it("posts an explicit optional-question skip", async () => {
    assert.equal(typeof onboardingApi.skipOnboardingQuestion, "function");
    const request = jsonFetch({ mode: "full", question: null });

    await onboardingApi.skipOnboardingQuestion("favoriteCartoons", {
      fetch: request.fetch,
    });

    assert.equal(request.calls[0][0], "/api/onboarding/question/skip");
    assert.equal(request.calls[0][1].method, "POST");
    assert.equal(
      request.calls[0][1].body,
      '{"questionKey":"favoriteCartoons"}',
    );
  });

  it("uploads only the current audio clip for transcript text", async () => {
    const request = jsonFetch({ transcript: "Bluey" });
    const audio = new Blob(["audio"], { type: "audio/webm" });

    assert.deepEqual(
      await transcribeOnboardingAudio(audio, { fetch: request.fetch }),
      { transcript: "Bluey" },
    );
    assert.equal(request.calls[0][0], "/api/onboarding/transcribe");
    assert.equal(request.calls[0][1].method, "POST");
    assert.ok(request.calls[0][1].body instanceof FormData);
    assert.equal(request.calls[0][1].body.get("audio").size, audio.size);
    assert.equal(request.calls[0][1].body.get("audio").type, "audio/webm");
  });

  it("throws safe field errors and propagates cancellation signals", async () => {
    const failed = jsonFetch(
      { error: "invalid_answer", fieldError: "Please enter a number from 3 to 17." },
      400,
    );
    await assert.rejects(
      saveOnboardingAnswer("age", 99, { fetch: failed.fetch }),
      (error) => {
        assert.ok(error instanceof OnboardingApiError);
        assert.equal(error.status, 400);
        assert.equal(error.code, "invalid_answer");
        assert.equal(error.message, "Please enter a number from 3 to 17.");
        return true;
      },
    );

    const controller = new AbortController();
    const request = jsonFetch({ ok: true });
    await loadOnboarding({ fetch: request.fetch, signal: controller.signal });
    assert.equal(request.calls[0][1].signal, controller.signal);
  });

  it("preserves keyed profile validation errors", async () => {
    assert.equal(typeof onboardingApi.saveProfileAnswers, "function");
    const failed = jsonFetch(
      {
        error: "invalid_profile",
        fieldErrors: {
          age: "Please enter a number from 3 to 17.",
          ignored: 123,
        },
      },
      400,
    );

    await assert.rejects(
      onboardingApi.saveProfileAnswers(
        { name: "Maya", age: 99 },
        { fetch: failed.fetch },
      ),
      (error) => {
        assert.ok(error instanceof OnboardingApiError);
        assert.equal(error.status, 400);
        assert.equal(error.code, "invalid_profile");
        assert.deepEqual(error.fieldErrors, {
          age: "Please enter a number from 3 to 17.",
        });
        return true;
      },
    );
  });
});
