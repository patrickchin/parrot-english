import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as learnerProfileApi from "../src/learner-profile/learner-profile-api.ts";
import {
  LearnerProfileApiError,
  completeLearnerProfile,
  loadLearnerProfile,
  loadProfile,
  saveLearnerProfileAnswer,
  saveProfileAnswer,
  skipLearnerProfile,
  transcribeLearnerProfileAudio,
} from "../src/learner-profile/learner-profile-api.ts";

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
  it("normalizes every worker field sentence to a stable presentation code", () => {
    assert.equal(
      typeof learnerProfileApi.getLearnerProfileFieldErrorCode,
      "function",
      "Expected the browser API boundary to normalize worker field errors",
    );
    const cases = [
      ["This question is no longer available.", "question-unavailable"],
      ["Please enter a description.", "description-required"],
      ["Please enter an answer.", "answer-required"],
      ["Please answer this question.", "answer-required"],
      [
        "Do not share your school, home address, phone, email, or password.",
        "private-details",
      ],
      ["Please use only your first name or nickname.", "preferred-name"],
      [
        "Please tell me the name you would like us to use.",
        "preferred-name",
      ],
      [
        "Please tell me your age using a whole number.",
        "age-whole-number",
      ],
      ["Please check this answer and try again.", "check-answer"],
      ["Please use 300 characters or fewer.", "too-long"],
      ["SERVER VALIDATION SENTENCE", "check-answer"],
    ];

    for (const [message, expected] of cases) {
      assert.equal(
        learnerProfileApi.getLearnerProfileFieldErrorCode(message),
        expected,
      );
    }
  });

  it("loads learnerProfile and profile state from same-origin routes", async () => {
    const learnerProfile = jsonFetch({ profile: { name: "Mia" } });
    assert.deepEqual(
      await loadLearnerProfile({ fetch: learnerProfile.fetch }),
      { profile: { name: "Mia" } },
    );
    assert.equal(learnerProfile.calls[0][0], "/api/learner-profile");
    assert.equal(learnerProfile.calls[0][1].method, "GET");

    const profile = jsonFetch({ profile: { id: "learner-1" }, questions: [] });
    assert.deepEqual(await loadProfile({ fetch: profile.fetch }), {
      profile: { id: "learner-1" },
      questions: [],
    });
    assert.equal(profile.calls[0][0], "/api/profile");
    assert.equal(profile.calls[0][1].method, "GET");
  });

  it("uses the Guardian roster routes with exact JSON bodies and encoded profile IDs", async () => {
    assert.equal(
      typeof learnerProfileApi.loadLearnerProfiles,
      "function",
      "Expected the Guardian roster loader",
    );
    assert.equal(
      typeof learnerProfileApi.createLearnerProfile,
      "function",
      "Expected the Guardian roster creator",
    );
    assert.equal(
      typeof learnerProfileApi.selectLearnerProfile,
      "function",
      "Expected the Guardian roster selector",
    );
    assert.equal(
      typeof learnerProfileApi.deleteLearnerProfile,
      "function",
      "Expected the Guardian learner deletion API",
    );

    const request = jsonFetch({
      activeProfileId: "learner/a",
      createdProfileId: "learner/a",
      profiles: [
        {
          age: 6,
          createdAt: "2026-08-26T08:00:00.000Z",
          id: "learner/a",
          name: "Mia",
          profileStatus: "completed",
          deletionPending: false,
        },
      ],
    });

    await learnerProfileApi.loadLearnerProfiles({ fetch: request.fetch });
    await learnerProfileApi.createLearnerProfile("Mia", {
      fetch: request.fetch,
    });
    await learnerProfileApi.selectLearnerProfile("learner/a", {
      fetch: request.fetch,
    });
    await learnerProfileApi.deleteLearnerProfile("learner/a", {
      fetch: request.fetch,
    });

    assert.equal(request.calls[0][0], "/api/learner-profiles");
    assert.deepEqual(request.calls[0][1], {
      method: "GET",
      signal: undefined,
    });
    assert.equal(request.calls[1][0], "/api/learner-profiles");
    assert.deepEqual(request.calls[1][1], {
      body: '{"name":"Mia"}',
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: undefined,
    });
    assert.equal(
      request.calls[2][0],
      "/api/learner-profiles/learner%2Fa/active",
    );
    assert.deepEqual(request.calls[2][1], {
      method: "PUT",
      signal: undefined,
    });
    assert.equal(request.calls[3][0], "/api/learner-profiles/learner%2Fa");
    assert.deepEqual(request.calls[3][1], {
      method: "DELETE",
      signal: undefined,
    });
  });

  it("requests managed learner creation without changing the existing default activation contract", async () => {
    const payload = {
      activeProfileId: "learner-mia",
      createdProfileId: "learner-mia",
      profiles: [
        {
          age: 8,
          createdAt: "2026-08-26T08:00:00.000Z",
          deletionPending: false,
          id: "learner-mia",
          name: "Mia",
          profileStatus: "completed",
        },
      ],
    };
    const request = jsonFetch(payload);

    await learnerProfileApi.createLearnerProfile("Noah", {
      activate: false,
      fetch: request.fetch,
    });
    await learnerProfileApi.createLearnerProfile("Ava", {
      fetch: request.fetch,
    });

    assert.equal(request.calls[0][1].body, '{"name":"Noah","activate":false}');
    assert.equal(request.calls[1][1].body, '{"name":"Ava"}');
  });

  it("rejects learner creation responses without an authoritative roster member ID", async () => {
    const profile = {
      age: 8,
      createdAt: "2026-08-26T08:00:00.000Z",
      deletionPending: false,
      id: "learner-sam",
      name: "Sam",
      profileStatus: "completed",
    };
    const roster = {
      activeProfileId: profile.id,
      profiles: [profile],
    };

    for (const payload of [
      roster,
      { ...roster, createdProfileId: "" },
      { ...roster, createdProfileId: "learner-mary" },
    ]) {
      const request = jsonFetch(payload);
      await assert.rejects(
        learnerProfileApi.createLearnerProfile("Mary", {
          activate: false,
          fetch: request.fetch,
        }),
        (error) =>
          error instanceof LearnerProfileApiError &&
          error.code === "invalid_roster",
      );
    }
  });

  it("rejects malformed Guardian rosters from every roster endpoint", async () => {
    const validProfile = {
      age: 6,
      createdAt: "2026-08-26T08:00:00.000Z",
      deletionPending: false,
      id: "learner-mia",
      name: "Mia",
      profileStatus: "completed",
    };
    const malformedRosters = [
      { activeProfileId: "learner-mia", profiles: null },
      {
        activeProfileId: "learner-mia",
        profiles: [validProfile, { ...validProfile }],
      },
      {
        activeProfileId: "learner-mia",
        profiles: [{ ...validProfile, id: " \t " }],
      },
      {
        activeProfileId: "learner-mia",
        profiles: [{ ...validProfile, name: " \n " }],
      },
      {
        activeProfileId: "learner-mia",
        profiles: [{ ...validProfile, deletionPending: undefined }],
      },
      {
        activeProfileId: "learner-mia",
        profiles: [{ ...validProfile, deletionPending: "false" }],
      },
      { activeProfileId: "learner-noah", profiles: [validProfile] },
    ];
    const invocations = [
      (fetch) => learnerProfileApi.loadLearnerProfiles({ fetch }),
      (fetch) => learnerProfileApi.createLearnerProfile("Ava", { fetch }),
      (fetch) =>
        learnerProfileApi.selectLearnerProfile("learner-mia", { fetch }),
      (fetch) =>
        learnerProfileApi.deleteLearnerProfile("learner-mia", { fetch }),
    ];

    for (const invoke of invocations) {
      for (const malformedRoster of malformedRosters) {
        const request = jsonFetch(malformedRoster);
        await assert.rejects(
          invoke(request.fetch),
          (error) =>
            error instanceof LearnerProfileApiError &&
            error.code === "invalid_roster",
        );
      }
    }
  });

  it("turns only the active-profile selection-required response into explicit state", async () => {
    const required = jsonFetch({ error: "learner_selection_required" }, 409);

    assert.deepEqual(await loadLearnerProfile({ fetch: required.fetch }), {
      mode: "selection-required",
    });

    const otherConflict = jsonFetch({ error: "another_conflict" }, 409);
    await assert.rejects(
      loadLearnerProfile({ fetch: otherConflict.fetch }),
      (error) =>
        error instanceof LearnerProfileApiError &&
        error.status === 409 &&
        error.code === "another_conflict",
    );

    const wrongStatus = jsonFetch({ error: "learner_selection_required" }, 400);
    await assert.rejects(
      loadLearnerProfile({ fetch: wrongStatus.fetch }),
      (error) =>
        error instanceof LearnerProfileApiError &&
        error.status === 400 &&
        error.code === "learner_selection_required",
    );
  });

  it("rejects malformed full and Guardian profile responses before they can cross a learner boundary", async () => {
    for (const id of ["", "   "]) {
      const malformedLearner = jsonFetch({
        mode: "full",
        profile: { id },
      });
      await assert.rejects(
        loadLearnerProfile({ fetch: malformedLearner.fetch }),
        (error) =>
          error instanceof LearnerProfileApiError &&
          error.code === "invalid_profile",
      );

      const malformedProfile = jsonFetch({ profile: { id }, questions: [] });
      await assert.rejects(
        loadProfile({ fetch: malformedProfile.fetch }),
        (error) =>
          error instanceof LearnerProfileApiError &&
          error.code === "invalid_profile",
      );
    }
  });

  it("rejects malformed learner IDs from mutation responses", async () => {
    const invalidLearnerState = {
      mode: "full",
      profile: { id: " \t " },
    };
    const invalidProfileState = {
      profile: { id: " \n " },
      questions: [],
    };

    for (const invoke of [
      (fetch) =>
        saveLearnerProfileAnswer("favoriteAnimals", "Ducks", { fetch }),
      (fetch) => skipLearnerProfile({ fetch }),
      (fetch) =>
        learnerProfileApi.skipLearnerProfileQuestion("favoriteAnimals", {
          fetch,
        }),
      (fetch) => completeLearnerProfile({ fetch }),
    ]) {
      const request = jsonFetch(invalidLearnerState);
      await assert.rejects(
        invoke(request.fetch),
        (error) =>
          error instanceof LearnerProfileApiError &&
          error.code === "invalid_profile",
      );
    }

    for (const invoke of [
      (fetch) => saveProfileAnswer("name", "Mia", { fetch }),
      (fetch) =>
        learnerProfileApi.saveProfileAnswers({ name: "Mia" }, { fetch }),
    ]) {
      const request = jsonFetch(invalidProfileState);
      await assert.rejects(
        invoke(request.fetch),
        (error) =>
          error instanceof LearnerProfileApiError &&
          error.code === "invalid_profile",
      );
    }
  });

  it("submits prose and retains the acknowledgment response", async () => {
    const payload = {
      question: null,
      acknowledgment: {
        text: "Thank you!",
        audio: {
          id: "peppa-thank-you",
          src: "/assets/audio/peppa-thank-you.mp3",
          text: "Thank you!",
        },
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

    const profile = jsonFetch({ profile: { id: "learner-1", name: "Maya" } });
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
      profile: { id: "learner-1", name: "Maya" },
      acknowledgments: [
        {
          text: "Thank you!",
          audio: {
            id: "peppa-thank-you",
            src: "/assets/audio/peppa-thank-you.mp3",
            text: "Thank you!",
          },
        },
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

  it("reads learner-safe recording consent and saves the guardian choice", async () => {
    assert.equal(typeof learnerProfileApi.loadLessonRecordingConsent, "function");
    assert.equal(typeof learnerProfileApi.saveLessonRecordingConsent, "function");

    const loaded = jsonFetch({ cleanupPending: true, enabled: false });
    assert.deepEqual(
      await learnerProfileApi.loadLessonRecordingConsent({ fetch: loaded.fetch }),
      { cleanupPending: true, enabled: false },
    );
    assert.deepEqual(loaded.calls[0], [
      "/api/lesson-recordings/consent",
      { method: "GET", signal: undefined },
    ]);

    const saved = jsonFetch({ cleanupPending: false, enabled: true });
    assert.deepEqual(
      await learnerProfileApi.saveLessonRecordingConsent(true, {
        fetch: saved.fetch,
      }),
      { cleanupPending: false, enabled: true },
    );
    assert.deepEqual(saved.calls[0], [
      "/api/profile/lesson-recording-consent",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: '{"enabled":true}',
        signal: undefined,
      },
    ]);
  });

  it("targets Guardian profile and recording requests with one exact learner query", async () => {
    const learnerProfileId = "learner /Noah";
    const profilePayload = {
      profile: { id: learnerProfileId, storyLevel: "tiny-stories" },
      questions: [],
    };
    const request = jsonFetch(profilePayload);

    await learnerProfileApi.loadProfile({
      fetch: request.fetch,
      learnerProfileId,
    });
    await learnerProfileApi.saveProfileAnswer("name", "Noah", {
      fetch: request.fetch,
      learnerProfileId,
    });
    await learnerProfileApi.saveProfileAnswers({ name: "Noah" }, {
      fetch: request.fetch,
      learnerProfileId,
    });
    const consent = jsonFetch({ cleanupPending: false, enabled: true });
    await learnerProfileApi.loadLessonRecordingConsent({
      fetch: consent.fetch,
      learnerProfileId,
    });
    await learnerProfileApi.saveLessonRecordingConsent(true, {
      fetch: consent.fetch,
      learnerProfileId,
    });

    assert.deepEqual(
      request.calls.map(([url]) => url),
      [
        "/api/profile?learnerProfileId=learner+%2FNoah",
        "/api/profile?learnerProfileId=learner+%2FNoah",
        "/api/profile?learnerProfileId=learner+%2FNoah",
      ],
    );
    assert.deepEqual(
      consent.calls.map(([url]) => url),
      [
        "/api/lesson-recordings/consent?learnerProfileId=learner+%2FNoah",
        "/api/profile/lesson-recording-consent?learnerProfileId=learner+%2FNoah",
      ],
    );
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
    assert.equal(
      typeof learnerProfileApi.skipLearnerProfileQuestion,
      "function",
    );
    const request = jsonFetch({
      mode: "full",
      profile: { id: "learner-1" },
      question: null,
    });

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
        assert.equal(error.isFieldError, true);
        return true;
      },
    );

    const controller = new AbortController();
    const request = jsonFetch({ ok: true });
    await loadLearnerProfile({
      fetch: request.fetch,
      signal: controller.signal,
    });
    assert.equal(request.calls[0][1].signal, controller.signal);
  });

  it("notifies guardian access before exposing its typed guardian-required error", async () => {
    const previousDocument = globalThis.document;
    const eventTarget = new globalThis.EventTarget();
    const order = [];
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: eventTarget,
    });
    eventTarget.addEventListener("guardian-access-required", () => {
      order.push("notification");
    });

    try {
      const failed = jsonFetch({ error: "guardian_required" }, 403);
      await assert.rejects(loadProfile({ fetch: failed.fetch }), (error) => {
        order.push("error");
        assert.ok(error instanceof LearnerProfileApiError);
        assert.equal(error.status, 403);
        assert.equal(error.code, "guardian_required");
        return true;
      });
      assert.deepEqual(order, ["notification", "error"]);
    } finally {
      if (previousDocument === undefined)
        Reflect.deleteProperty(globalThis, "document");
      else
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: previousDocument,
        });
    }
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
      acknowledgment: "Thank you!",
      enrichmentStatus: "generated",
      answeredAt: "2026-07-06T10:30:00.000Z",
    };
    assert.equal(response.rawAnswer, "I like dinosaurs");
  });
});
