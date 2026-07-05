import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildQuestionnaireSql } from "../scripts/publish-questionnaire.mjs";
import { createDatabase } from "../worker/database.ts";
import { handleOnboardingRequest } from "../worker/onboarding.ts";
import { createWorker } from "../worker/index.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const PROTECTED_REQUESTS = [
  ["GET", "/api/onboarding"],
  ["PUT", "/api/onboarding/answer"],
  ["POST", "/api/onboarding/transcribe"],
  ["POST", "/api/onboarding/skip"],
  ["POST", "/api/onboarding/complete"],
  ["GET", "/api/profile"],
  ["PUT", "/api/profile"],
];

function createEnvironment() {
  let assetCalls = 0;
  return {
    env: {
      ASSETS: {
        async fetch() {
          assetCalls += 1;
          return new Response("asset");
        },
      },
      DB: {},
    },
    getAssetCalls: () => assetCalls,
  };
}

function createAuthStub(session) {
  let sessionCalls = 0;
  return {
    auth: {
      api: {
        async getSession() {
          sessionCalls += 1;
          return session;
        },
      },
      async handler() {
        return new Response("auth");
      },
    },
    getSessionCalls: () => sessionCalls,
  };
}

describe("onboarding Worker routing", () => {
  it("rejects anonymous onboarding and profile requests before handlers run", async () => {
    const authStub = createAuthStub(null);
    let handlerCalls = 0;
    const worker = createWorker({
      createAuth: () => authStub.auth,
      async handleOnboardingRequest() {
        handlerCalls += 1;
        return Response.json({ ok: true });
      },
    });

    for (const [method, path] of PROTECTED_REQUESTS) {
      const response = await worker.fetch(
        new Request(`https://example.test${path}`, { method }),
        createEnvironment().env,
      );
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.deepEqual(await response.json(), { error: "unauthorized" });
    }

    assert.equal(authStub.getSessionCalls(), PROTECTED_REQUESTS.length);
    assert.equal(handlerCalls, 0);
  });

  it("passes only server session identity and the shared D1 database to the handler", async () => {
    const session = {
      session: { id: "session-1" },
      user: { id: "user-1", name: "Mia", email: "mia@example.test" },
    };
    const authStub = createAuthStub(session);
    const calls = [];
    const worker = createWorker({
      createAuth: () => authStub.auth,
      async handleOnboardingRequest(input) {
        calls.push(input);
        return Response.json({ routed: true });
      },
    });
    const { env, getAssetCalls } = createEnvironment();
    const request = new Request("https://example.test/api/onboarding", {
      headers: { Cookie: "better-auth.session_token=secret-token" },
    });

    const response = await worker.fetch(request, env);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { routed: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].request, request);
    assert.equal(calls[0].env, env);
    assert.deepEqual(calls[0].identity, {
      sessionId: "session-1",
      userId: "user-1",
      userName: "Mia",
    });
    assert.equal(calls[0].database.$client, env.DB);
    assert.equal(getAssetCalls(), 0);
  });
});

function request(path, method = "GET", body) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function createSeededDatabase() {
  const testDatabase = createTestD1Database();
  const definition = JSON.parse(
    readFileSync(
      new URL("../content/onboarding/questionnaire-v1.json", import.meta.url),
      "utf8",
    ),
  );
  testDatabase.sqlite.exec(buildQuestionnaireSql(definition, 1_000));
  testDatabase.sqlite
    .prepare(
      "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    )
    .run("user-1", "Mia", "mia@example.test", 1_000, 1_000);
  return {
    ...testDatabase,
    database: createDatabase(testDatabase.d1),
    definition,
  };
}

async function callOnboarding(database, path, method = "GET", body, identity = {}) {
  return handleOnboardingRequest({
    database,
    env: { DB: database.$client },
    identity: {
      sessionId: "session-1",
      userId: "user-1",
      userName: "Mia",
      ...identity,
    },
    request: request(path, method, body),
  });
}

describe("onboarding persistence and API", () => {
  it("transcribes authenticated audio without persisting a learner profile", async () => {
    const state = createSeededDatabase();
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => Response.json({ text: "  Bluey  " });
      const formData = new FormData();
      formData.set(
        "audio",
        new File(["audio"], "answer.webm", { type: "audio/webm" }),
      );
      const response = await handleOnboardingRequest({
        database: state.database,
        env: { DB: state.d1, GROQ_API_KEY: "test-key" },
        identity: {
          sessionId: "session-1",
          userId: "user-1",
          userName: "Mia",
        },
        request: new Request(
          "https://example.test/api/onboarding/transcribe",
          { method: "POST", body: formData },
        ),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { transcript: "Bluey" });
      assert.equal(
        state.sqlite.prepare("SELECT count(*) AS count FROM learner_profile").get()
          .count,
        0,
      );
    } finally {
      globalThis.fetch = originalFetch;
      state.close();
    }
  });

  it("creates a separate learner profile with the active version and auth-name prefill", async () => {
    const state = createSeededDatabase();
    try {
      const response = await callOnboarding(state.database, "/api/onboarding");
      assert.equal(response.status, 200);
      const payload = await response.json();

      assert.equal(payload.profile.name, "Mia");
      assert.equal(payload.profile.age, null);
      assert.equal(payload.profile.onboardingStatus, "not_started");
      assert.equal(payload.profile.questionnaireVersion, 1);
      assert.deepEqual(payload.profile.answers, { name: "Mia" });
      assert.equal(payload.questionnaire.version, 1);
      assert.equal(payload.question.answerKey, "age");
      assert.equal(payload.question.audio.id, "onboarding-age");
      assert.equal(
        payload.question.audio.src,
        "/assets/audio/onboarding-age.mp3",
      );
      assert.equal(payload.questionnaire.introductionAudio.id, "onboarding-introduction");
      assert.deepEqual(payload.progress, { answered: 0, current: 1, total: 5 });
      assert.equal(payload.canBypass, false);

      const row = state.sqlite
        .prepare("SELECT * FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      assert.equal(row.name, "Mia");
      assert.equal(row.questionnaire_version, 1);
      assert.equal(row.answers_json, "{}");
    } finally {
      state.close();
    }
  });

  it("persists canonical age and JSON arrays while advancing one question at a time", async () => {
    const state = createSeededDatabase();
    try {
      await callOnboarding(state.database, "/api/onboarding");
      const ageResponse = await callOnboarding(
        state.database,
        "/api/onboarding/answer",
        "PUT",
        { questionKey: "age", value: 8 },
      );
      assert.equal(ageResponse.status, 200);
      assert.equal((await ageResponse.json()).question.answerKey, "favoriteCartoons");

      const cartoonResponse = await callOnboarding(
        state.database,
        "/api/onboarding/answer",
        "PUT",
        { questionKey: "favoriteCartoons", value: ["Bluey", "bluey", "Paw Patrol"] },
      );
      assert.equal(cartoonResponse.status, 200);
      const payload = await cartoonResponse.json();
      assert.equal(payload.question.answerKey, "favoriteAnimals");
      assert.deepEqual(payload.profile.answers.favoriteCartoons, [
        "Bluey",
        "Paw Patrol",
      ]);

      const row = state.sqlite
        .prepare("SELECT age, answers_json, current_question_key, onboarding_status FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      assert.equal(row.age, 8);
      assert.deepEqual(JSON.parse(row.answers_json), {
        favoriteCartoons: ["Bluey", "Paw Patrol"],
      });
      assert.equal(row.current_question_key, "favoriteAnimals");
      assert.equal(row.onboarding_status, "in_progress");
    } finally {
      state.close();
    }
  });

  it("rejects invalid values, retired keys, and out-of-order answers without writes", async () => {
    const state = createSeededDatabase();
    try {
      await callOnboarding(state.database, "/api/onboarding");
      for (const [body, expectedError] of [
        [{ questionKey: "age", value: 99 }, "Please enter a number from 3 to 17."],
        [{ questionKey: "retiredQuestion", value: "anything" }, "This question is no longer available."],
        [{ questionKey: "favoriteAnimals", value: ["dog"] }, "Please answer the current question first."],
      ]) {
        const response = await callOnboarding(
          state.database,
          "/api/onboarding/answer",
          "PUT",
          body,
        );
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
          error: "invalid_answer",
          fieldError: expectedError,
        });
      }

      const row = state.sqlite
        .prepare("SELECT age, answers_json FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      assert.equal(row.age, null);
      assert.equal(row.answers_json, "{}");
    } finally {
      state.close();
    }
  });

  it("preserves partial progress and bypasses only the skipped Better Auth session", async () => {
    const state = createSeededDatabase();
    try {
      await callOnboarding(state.database, "/api/onboarding");
      await callOnboarding(state.database, "/api/onboarding/answer", "PUT", {
        questionKey: "age",
        value: 8,
      });
      const skipped = await callOnboarding(
        state.database,
        "/api/onboarding/skip",
        "POST",
      );
      assert.equal(skipped.status, 200);
      assert.equal((await skipped.json()).canBypass, true);

      const sameSession = await callOnboarding(state.database, "/api/onboarding");
      const samePayload = await sameSession.json();
      assert.equal(samePayload.canBypass, true);
      assert.equal(samePayload.question.answerKey, "favoriteCartoons");

      const nextSession = await callOnboarding(
        state.database,
        "/api/onboarding",
        "GET",
        undefined,
        { sessionId: "session-2" },
      );
      assert.equal((await nextSession.json()).canBypass, false);
    } finally {
      state.close();
    }
  });

  it("requires every applicable answer before completion", async () => {
    const state = createSeededDatabase();
    try {
      await callOnboarding(state.database, "/api/onboarding");
      const early = await callOnboarding(
        state.database,
        "/api/onboarding/complete",
        "POST",
      );
      assert.equal(early.status, 409);
      assert.deepEqual(await early.json(), {
        error: "onboarding_incomplete",
        missingQuestionKey: "age",
      });

      const answers = [
        ["age", 8],
        ["favoriteCartoons", ["Bluey"]],
        ["favoriteAnimals", ["dog"]],
        ["favoriteActivities", ["drawing"]],
        ["favoriteStoryTopics", ["space"]],
      ];
      for (const [questionKey, value] of answers) {
        const response = await callOnboarding(
          state.database,
          "/api/onboarding/answer",
          "PUT",
          { questionKey, value },
        );
        assert.equal(response.status, 200, questionKey);
      }

      const completed = await callOnboarding(
        state.database,
        "/api/onboarding/complete",
        "POST",
      );
      assert.equal(completed.status, 200);
      const payload = await completed.json();
      assert.equal(payload.profile.onboardingStatus, "completed");
      assert.equal(payload.question, null);
      assert.equal(payload.canBypass, true);
    } finally {
      state.close();
    }
  });

  it("keeps completed users on their assigned version after a new activation", async () => {
    const state = createSeededDatabase();
    try {
      await callOnboarding(state.database, "/api/onboarding");
      state.sqlite.exec(
        "UPDATE learner_profile SET onboarding_status = 'completed', completed_at = 2000 WHERE auth_user_id = 'user-1'; UPDATE questionnaire SET status = 'inactive'; INSERT INTO questionnaire (id, version, status, created_at, activated_at) VALUES ('voice-onboarding-v2', 2, 'active', 2000, 2000);",
      );

      const response = await callOnboarding(state.database, "/api/onboarding");
      const payload = await response.json();
      assert.equal(payload.profile.questionnaireVersion, 1);
      assert.equal(payload.profile.onboardingStatus, "completed");
      assert.equal(payload.questionnaire.version, 1);
      assert.equal(payload.canBypass, true);
    } finally {
      state.close();
    }
  });

  it("loads and edits known profile fields with shared validation", async () => {
    const state = createSeededDatabase();
    try {
      await callOnboarding(state.database, "/api/onboarding");
      state.sqlite.exec(
        "UPDATE learner_profile SET age = 8, onboarding_status = 'completed', completed_at = 2000 WHERE auth_user_id = 'user-1'",
      );

      const profileResponse = await callOnboarding(state.database, "/api/profile");
      const profilePayload = await profileResponse.json();
      assert.equal(profilePayload.profile.name, "Mia");
      assert.equal(profilePayload.questions[0].answerKey, "name");
      assert.equal(profilePayload.questions[1].answerKey, "age");

      const nameResponse = await callOnboarding(
        state.database,
        "/api/profile",
        "PUT",
        { questionKey: "name", value: "  Maya  " },
      );
      assert.equal(nameResponse.status, 200);
      assert.equal((await nameResponse.json()).profile.name, "Maya");

      const ageResponse = await callOnboarding(
        state.database,
        "/api/profile",
        "PUT",
        { questionKey: "age", value: 18 },
      );
      assert.equal(ageResponse.status, 400);
      assert.deepEqual(await ageResponse.json(), {
        error: "invalid_answer",
        fieldError: "Please enter a number from 3 to 17.",
      });

      const row = state.sqlite
        .prepare("SELECT name, age, onboarding_status FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      assert.deepEqual({ ...row }, {
        name: "Maya",
        age: 8,
        onboarding_status: "completed",
      });
    } finally {
      state.close();
    }
  });
});
