import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as learnerProfileApi from "../src/learner-profile-api.ts";
import {
  LearnerProfileApiError,
  completeLearnerProfile,
  loadLearnerProfile,
  loadProfile,
  saveLearnerProfileAnswer,
  saveProfileAnswer,
  skipLearnerProfile,
  transcribeLearnerProfileAudio,
} from "../src/learner-profile-api.ts";

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

describe("learnerProfile browser API", () => {
  it("loads learnerProfile and profile state from same-origin routes", async () => {
    const learnerProfile = jsonFetch({ profile: { name: "Mia" } });
    assert.deepEqual(
      await loadLearnerProfile({ fetch: learnerProfile.fetch }),
      { profile: { name: "Mia" } },
    );
    assert.equal(learnerProfile.calls[0][0], "/api/learner-profile");
    assert.equal(learnerProfile.calls[0][1].method, "GET");

    const profile = jsonFetch({ questions: [] });
    assert.deepEqual(await loadProfile({ fetch: profile.fetch }), {
      questions: [],
    });
    assert.equal(profile.calls[0][0], "/api/profile");
    assert.equal(profile.calls[0][1].method, "GET");
  });

  it("submits prose and retains the acknowledgment response", async () => {
    const payload = {
      question: null,
      acknowledgment: {
        text: "Dinosaurs are very stompy!",
        audio: { contentType: "audio/mpeg", base64: "AQID" },
      },
    };
    const learnerProfile = jsonFetch(payload);
    assert.deepEqual(
      await saveLearnerProfileAnswer("favoriteAnimals", "I like dinosaurs", {
        fetch: learnerProfile.fetch,
      }),
      payload,
    );
    assert.equal(learnerProfile.calls[0][0], "/api/learner-profile/answer");
    assert.deepEqual(learnerProfile.calls[0][1], {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: '{"questionKey":"favoriteAnimals","rawAnswer":"I like dinosaurs"}',
      signal: undefined,
    });

    const profile = jsonFetch({ profile: { name: "Maya" } });
    await saveProfileAnswer("name", "Maya", { fetch: profile.fetch });
    assert.equal(profile.calls[0][0], "/api/profile");
    assert.equal(profile.calls[0][1].method, "PUT");
    assert.equal(
      profile.calls[0][1].body,
      '{"questionKey":"name","rawAnswer":"Maya"}',
    );
  });

  it("submits all prose profile edits in one request", async () => {
    assert.equal(typeof learnerProfileApi.saveProfileAnswers, "function");
    const payload = {
      profile: { name: "Maya" },
      acknowledgments: [
        { text: "Maya is a lovely name!", audio: null },
      ],
    };
    const request = jsonFetch(payload);

    assert.deepEqual(
      await learnerProfileApi.saveProfileAnswers(
        {
          name: "Maya",
          age: "I am nine",
          description: "Maya loves drawing dragons.",
          favoriteCartoons: "I like Bluey",
        },
        { fetch: request.fetch },
      ),
      payload,
    );
    assert.equal(request.calls[0][0], "/api/profile");
    assert.deepEqual(JSON.parse(request.calls[0][1].body), {
      answers: {
        name: "Maya",
        age: "I am nine",
        description: "Maya loves drawing dragons.",
        favoriteCartoons: "I like Bluey",
      },
    });
  });

  it("posts skip and completion transitions", async () => {
    const skipped = jsonFetch({ canBypass: true });
    await skipLearnerProfile({ fetch: skipped.fetch });
    assert.equal(skipped.calls[0][0], "/api/learner-profile/skip");
    assert.equal(skipped.calls[0][1].method, "POST");

    const completed = jsonFetch({ canBypass: true });
    await completeLearnerProfile({ fetch: completed.fetch });
    assert.equal(completed.calls[0][0], "/api/learner-profile/complete");
    assert.equal(completed.calls[0][1].method, "POST");
  });

  it("posts an explicit optional-question skip", async () => {
    assert.equal(typeof learnerProfileApi.skipLearnerProfileQuestion, "function");
    const request = jsonFetch({ mode: "full", question: null });

    await learnerProfileApi.skipLearnerProfileQuestion("favoriteCartoons", {
      fetch: request.fetch,
    });

    assert.equal(request.calls[0][0], "/api/learner-profile/question/skip");
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
      await transcribeLearnerProfileAudio(audio, { fetch: request.fetch }),
      { transcript: "Bluey" },
    );
    assert.equal(request.calls[0][0], "/api/learner-profile/transcribe");
    assert.equal(request.calls[0][1].method, "POST");
    assert.ok(request.calls[0][1].body instanceof FormData);
    assert.equal(request.calls[0][1].body.get("audio").size, audio.size);
    assert.equal(request.calls[0][1].body.get("audio").type, "audio/webm");
  });

  it("throws safe field errors and propagates cancellation signals", async () => {
    const failed = jsonFetch(
      { error: "invalid_answer", fieldError: "Please enter a whole number." },
      400,
    );
    await assert.rejects(
      saveLearnerProfileAnswer("age", "I am 99", { fetch: failed.fetch }),
      (error) => {
        assert.ok(error instanceof LearnerProfileApiError);
        assert.equal(error.status, 400);
        assert.equal(error.code, "invalid_answer");
        assert.equal(error.message, "Please enter a whole number.");
        return true;
      },
    );

    const controller = new AbortController();
    const request = jsonFetch({ ok: true });
    await loadLearnerProfile({ fetch: request.fetch, signal: controller.signal });
    assert.equal(request.calls[0][1].signal, controller.signal);
  });

  it("preserves keyed errors from atomic profile validation", async () => {
    const failed = jsonFetch(
      {
        error: "invalid_profile",
        fieldErrors: {
          age: "Please tell me your age using a whole number.",
          ignored: 123,
        },
      },
      400,
    );

    await assert.rejects(
      learnerProfileApi.saveProfileAnswers(
        { name: "Maya", age: "very old" },
        { fetch: failed.fetch },
      ),
      (error) => {
        assert.ok(error instanceof LearnerProfileApiError);
        assert.equal(error.code, "invalid_profile");
        assert.deepEqual(error.fieldErrors, {
          age: "Please tell me your age using a whole number.",
        });
        return true;
      },
    );
  });

  it("models prose questions and self-contained v2 response snapshots", () => {
    const source = learnerProfileApi;
    assert.equal(typeof source.saveLearnerProfileAnswer, "function");

    const question = {
      answerKey: "favoriteAnimals",
      position: 4,
      promptEn: "What animals do you like?",
      promptZh: "你喜欢什么动物？",
      required: true,
      maxLength: 500,
      audio: null,
    };
    assert.equal("answerType" in question, false);
    assert.equal("cardinality" in question, false);
    assert.equal("options" in question, false);

    const response = {
      question: question.promptEn,
      rawAnswer: "I like dinosaurs",
      summary: "Likes dinosaurs.",
      acknowledgment: "Dinosaurs are very stompy!",
      enrichmentStatus: "generated",
      answeredAt: "2026-07-06T10:30:00.000Z",
    };
    assert.equal(response.rawAnswer, "I like dinosaurs");
  });
});
