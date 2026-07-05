import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDatabase } from "../worker/database.ts";
import { handleOnboardingRequest } from "../worker/onboarding.ts";
import { createOnboardingRepository } from "../worker/onboarding-repository.ts";
import { createWorker } from "../worker/index.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const PROTECTED_REQUESTS = [
  ["GET", "/api/onboarding"],
  ["PUT", "/api/onboarding/answer"],
  ["POST", "/api/onboarding/transcribe"],
  ["POST", "/api/onboarding/question/skip"],
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
  testDatabase.sqlite
    .prepare(
      "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    )
    .run("user-1", "Mia", "mia@example.test", 1_000, 1_000);
  const insertSession = testDatabase.sqlite.prepare(
    "INSERT INTO session (id, expires_at, token, user_id) VALUES (?, ?, ?, ?)",
  );
  insertSession.run("session-1", 9_999_999_999_999, "token-1", "user-1");
  insertSession.run("session-2", 9_999_999_999_999, "token-2", "user-1");
  return {
    ...testDatabase,
    database: createDatabase(testDatabase.d1),
  };
}

const GENERATED = {
  summary: "Likes dinosaurs.",
  acknowledgment: "Dinosaurs are very stompy!",
  canonicalName: null,
  canonicalAge: null,
  enrichmentStatus: "generated",
};

function createDependencies(overrides = {}) {
  return {
    now: () => new Date("2026-07-06T10:30:00.000Z"),
    async enrichAnswer({ question, rawAnswer }) {
      return {
        summary: `Said: ${rawAnswer}`,
        acknowledgment: `${rawAnswer} sounds brilliant!`,
        canonicalName: question.canonicalField === "name" ? rawAnswer : null,
        canonicalAge:
          question.canonicalField === "age"
            ? Number.parseInt(rawAnswer.match(/\d+/)?.[0] ?? "", 10)
            : null,
        enrichmentStatus: "generated",
      };
    },
    async synthesizeAudio() {
      return null;
    },
    ...overrides,
  };
}

async function callOnboarding(
  database,
  path,
  method = "GET",
  body,
  identity = {},
  dependencies = createDependencies(),
) {
  return handleOnboardingRequest(
    {
      database,
      env: { DB: database.$client },
      identity: {
        sessionId: "session-1",
        userId: "user-1",
        userName: "Mia",
        ...identity,
      },
      request: request(path, method, body),
    },
    dependencies,
  );
}

describe("onboarding persistence and API", () => {
  it("creates v2 profiles without normalized questionnaire rows", async () => {
    const state = createTestD1Database();
    try {
      state.sqlite
        .prepare(
          "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
        )
        .run("user-1", "Mia", "mia@example.test", 1_000, 1_000);
      const repository = createOnboardingRepository(createDatabase(state.d1), {
        createId: () => "profile-v2",
        now: () => new Date("2026-07-06T00:00:00.000Z"),
      });

      const profile = await repository.ensureProfile({
        sessionId: "session-1",
        userId: "user-1",
        userName: "Mia",
      });

      assert.equal(profile.id, "profile-v2");
      assert.equal(profile.questionnaireVersion, null);
      assert.equal(profile.name, "Mia");
      assert.equal(
        state.sqlite.prepare("SELECT count(*) AS count FROM questionnaire").get()
          .count,
        0,
      );
    } finally {
      state.close();
    }
  });

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

  it("loads six deployed prose questions without normalized questionnaire rows", async () => {
    const state = createSeededDatabase();
    try {
      const response = await callOnboarding(state.database, "/api/onboarding");
      assert.equal(response.status, 200);
      const payload = await response.json();

      assert.equal(payload.profile.name, "Mia");
      assert.equal(payload.profile.age, null);
      assert.equal(payload.profile.onboardingStatus, "not_started");
      assert.equal(payload.profile.questionnaireVersion, 2);
      assert.equal(payload.profile.answers.schemaVersion, 2);
      assert.deepEqual(payload.profile.answers.responses, {});
      assert.equal(payload.questionnaire.version, 2);
      assert.equal(payload.question.answerKey, "name");
      assert.equal(payload.question.promptEn, "Hi! I'm Peppa. What's your name?");
      assert.equal(payload.question.audio.id, "onboarding-v2-name");
      assert.equal(
        payload.question.audio.src,
        "/assets/audio/onboarding-v2-name.mp3",
      );
      assert.equal("answerType" in payload.question, false);
      assert.equal("options" in payload.question, false);
      assert.deepEqual(payload.progress, { answered: 0, current: 1, total: 6 });
      assert.equal(payload.canBypass, false);

      const row = state.sqlite
        .prepare("SELECT * FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      assert.equal(row.name, "Mia");
      assert.equal(row.questionnaire_version, null);
      assert.equal(JSON.parse(row.answers_json).schemaVersion, 2);
    } finally {
      state.close();
    }
  });

  it("persists a complete snapshot before requesting acknowledgment audio", async () => {
    const state = createSeededDatabase();
    try {
      await callOnboarding(state.database, "/api/onboarding");
      const calls = [];
      const dependencies = createDependencies({
        async enrichAnswer() {
          calls.push("enrich");
          return {
            ...GENERATED,
            summary: "Is called Mia.",
            acknowledgment: "Mia is a lovely name!",
            canonicalName: "Mia",
          };
        },
        async synthesizeAudio({ text }) {
          calls.push("tts");
          assert.equal(text, "Mia is a lovely name!");
          const stored = state.sqlite
            .prepare("SELECT answers_json FROM learner_profile WHERE auth_user_id = ?")
            .get("user-1");
          assert.equal(
            JSON.parse(stored.answers_json).responses.name.acknowledgment,
            "Mia is a lovely name!",
          );
          return { contentType: "audio/mpeg", base64: "AQID" };
        },
      });
      const response = await callOnboarding(
        state.database,
        "/api/onboarding/answer",
        "PUT",
        { questionKey: "name", rawAnswer: "  Mia  " },
        {},
        dependencies,
      );
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.deepEqual(calls, ["enrich", "tts"]);
      assert.equal(payload.question.answerKey, "age");
      assert.deepEqual(payload.acknowledgment, {
        text: "Mia is a lovely name!",
        audio: { contentType: "audio/mpeg", base64: "AQID" },
      });

      const row = state.sqlite
        .prepare("SELECT name, answers_json, current_question_key, onboarding_status FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      assert.equal(row.name, "Mia");
      assert.deepEqual(JSON.parse(row.answers_json).responses.name, {
        question: "Hi! I'm Peppa. What's your name?",
        rawAnswer: "Mia",
        summary: "Is called Mia.",
        acknowledgment: "Mia is a lovely name!",
        enrichmentStatus: "generated",
        answeredAt: "2026-07-06T10:30:00.000Z",
      });
      assert.equal(row.current_question_key, "age");
      assert.equal(row.onboarding_status, "in_progress");
    } finally {
      state.close();
    }
  });

  it("rejects client metadata, invalid prose, retired keys, and out-of-order answers", async () => {
    const state = createSeededDatabase();
    try {
      await callOnboarding(state.database, "/api/onboarding");
      for (const [body, expectedStatus] of [
        [{ questionKey: "name", rawAnswer: "Mia", question: "Trust me" }, 400],
        [{ questionKey: "name", rawAnswer: "   " }, 400],
        [{ questionKey: "name", rawAnswer: ["Mia"] }, 400],
        [{ questionKey: "retiredQuestion", rawAnswer: "anything" }, 409],
        [{ questionKey: "age", rawAnswer: "I am 8" }, 409],
      ]) {
        const response = await callOnboarding(
          state.database,
          "/api/onboarding/answer",
          "PUT",
          body,
        );
        assert.equal(response.status, expectedStatus);
        assert.equal((await response.json()).error, "invalid_answer");
      }

      const row = state.sqlite
        .prepare("SELECT answers_json FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      assert.deepEqual(JSON.parse(row.answers_json).responses, {});
    } finally {
      state.close();
    }
  });

  it("reuses an identical saved answer without calling Groq and retries TTS", async () => {
    const state = createSeededDatabase();
    try {
      await callOnboarding(state.database, "/api/onboarding");
      let enrichmentCalls = 0;
      let audioCalls = 0;
      const dependencies = createDependencies({
        async enrichAnswer() {
          enrichmentCalls += 1;
          return {
            ...GENERATED,
            summary: "Is called Mia.",
            acknowledgment: "Mia is a lovely name!",
            canonicalName: "Mia",
          };
        },
        async synthesizeAudio() {
          audioCalls += 1;
          return null;
        },
      });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await callOnboarding(
          state.database,
          "/api/onboarding/answer",
          "PUT",
          { questionKey: "name", rawAnswer: "Mia" },
          {},
          dependencies,
        );
        assert.equal(response.status, 200);
      }
      assert.equal(enrichmentCalls, 1);
      assert.equal(audioCalls, 2);
    } finally {
      state.close();
    }
  });

  it("preserves partial progress and bypasses only the skipped Better Auth session", async () => {
    const state = createSeededDatabase();
    try {
      await callOnboarding(state.database, "/api/onboarding");
      await callOnboarding(state.database, "/api/onboarding/answer", "PUT", {
        questionKey: "name",
        rawAnswer: "Mia",
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
      assert.equal(samePayload.question.answerKey, "age");

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

  it("completes onboarding in the final prose answer update", async () => {
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
        missingQuestionKey: "name",
      });

      const answers = [
        ["name", "Mia"],
        ["age", "I am 8"],
        ["favoriteCartoons", "I like Bluey"],
        ["favoriteAnimals", "I like dogs"],
        ["favoriteActivities", "I like drawing"],
        ["favoriteStoryTopics", "I like space stories"],
      ];
      let payload;
      for (const [questionKey, rawAnswer] of answers) {
        const response = await callOnboarding(
          state.database,
          "/api/onboarding/answer",
          "PUT",
          { questionKey, rawAnswer },
        );
        assert.equal(response.status, 200, questionKey);
        payload = await response.json();
      }
      assert.equal(payload.profile.onboardingStatus, "completed");
      assert.equal(payload.question, null);
      assert.equal(payload.canBypass, true);
      const row = state.sqlite
        .prepare(
          "SELECT onboarding_status, completed_at FROM learner_profile WHERE auth_user_id = ?",
        )
        .get("user-1");
      assert.equal(row.onboarding_status, "completed");
      assert.ok(row.completed_at);
    } finally {
      state.close();
    }
  });

  it("rejects skipping required deployed questions", async () => {
    const state = createSeededDatabase();
    try {
      await callOnboarding(state.database, "/api/onboarding");
      const requiredSkip = await callOnboarding(
        state.database,
        "/api/onboarding/question/skip",
        "POST",
        { questionKey: "name" },
      );
      assert.equal(requiredSkip.status, 400);
      assert.deepEqual(await requiredSkip.json(), {
        error: "invalid_answer",
        fieldError: "This question is required.",
      });
    } finally {
      state.close();
    }
  });

  it("restarts incomplete v1 profiles but preserves completed v1 users", async () => {
    const state = createSeededDatabase();
    try {
      state.sqlite.exec(
        "INSERT INTO questionnaire (id, version, status, created_at) VALUES ('legacy-v1', 1, 'inactive', 1000)",
      );
      state.sqlite
        .prepare(
          "INSERT INTO learner_profile (id, auth_user_id, name, age, answers_json, questionnaire_version, current_question_key, onboarding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          "profile-1",
          "user-1",
          "Mia",
          6,
          '{"favoriteAnimals":["dog"]}',
          1,
          "favoriteAnimals",
          "in_progress",
          1_000,
          1_000,
        );
      const restarted = await callOnboarding(state.database, "/api/onboarding");
      const restartedPayload = await restarted.json();
      assert.equal(restartedPayload.question.answerKey, "name");
      assert.deepEqual(
        restartedPayload.profile.answers.legacyAnswers,
        { favoriteAnimals: ["dog"] },
      );
      state.sqlite.exec(
        "UPDATE learner_profile SET answers_json = '{\"favoriteAnimals\":[\"dog\"]}', onboarding_status = 'completed', current_question_key = NULL, completed_at = 2000 WHERE auth_user_id = 'user-1'",
      );
      const completed = await callOnboarding(state.database, "/api/onboarding");
      const completedPayload = await completed.json();
      assert.equal(completedPayload.profile.onboardingStatus, "completed");
      assert.equal(completedPayload.question, null);
      assert.equal(completedPayload.canBypass, true);
      assert.equal(
        state.sqlite
          .prepare("SELECT answers_json FROM learner_profile WHERE auth_user_id = ?")
          .get("user-1").answers_json,
        '{"favoriteAnimals":["dog"]}',
      );
    } finally {
      state.close();
    }
  });

  it("converts legacy JSON on the first enriched profile edit", async () => {
    const state = createSeededDatabase();
    try {
      state.sqlite.exec(
        "INSERT INTO questionnaire (id, version, status, created_at) VALUES ('legacy-v1', 1, 'inactive', 1000)",
      );
      state.sqlite
        .prepare(
          "INSERT INTO learner_profile (id, auth_user_id, name, age, answers_json, questionnaire_version, onboarding_status, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          "profile-1",
          "user-1",
          "Mia",
          8,
          '{"favoriteAnimals":["dog"]}',
          1,
          "completed",
          2_000,
          1_000,
          1_000,
        );

      const profileResponse = await callOnboarding(state.database, "/api/profile");
      const profilePayload = await profileResponse.json();
      assert.equal(profilePayload.profile.name, "Mia");
      assert.equal(profilePayload.questions[0].answerKey, "name");
      assert.equal(profilePayload.questions[1].answerKey, "age");

      const editResponse = await callOnboarding(
        state.database,
        "/api/profile",
        "PUT",
        { questionKey: "favoriteAnimals", rawAnswer: "I like dinosaurs" },
        {},
        createDependencies({
          async enrichAnswer() {
            return GENERATED;
          },
        }),
      );
      assert.equal(editResponse.status, 200);
      assert.equal(
        (await editResponse.json()).acknowledgment.text,
        "Dinosaurs are very stompy!",
      );

      const row = state.sqlite
        .prepare("SELECT answers_json, onboarding_status FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      const answers = JSON.parse(row.answers_json);
      assert.deepEqual(answers.legacyAnswers, { favoriteAnimals: ["dog"] });
      assert.deepEqual(answers.responses.favoriteAnimals, {
        question: "What animals do you like?",
        rawAnswer: "I like dinosaurs",
        summary: "Likes dinosaurs.",
        acknowledgment: "Dinosaurs are very stompy!",
        enrichmentStatus: "generated",
        answeredAt: "2026-07-06T10:30:00.000Z",
      });
      assert.equal(row.onboarding_status, "completed");
    } finally {
      state.close();
    }
  });

  it("saves one changed legacy profile field without requiring blank v2 answers", async () => {
    const state = createSeededDatabase();
    try {
      state.sqlite.exec(
        "INSERT INTO questionnaire (id, version, status, created_at) VALUES ('legacy-v1', 1, 'inactive', 1000)",
      );
      state.sqlite
        .prepare(
          "INSERT INTO learner_profile (id, auth_user_id, name, age, answers_json, questionnaire_version, onboarding_status, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          "profile-1",
          "user-1",
          "Mia",
          8,
          '{"favoriteAnimals":["dog"]}',
          1,
          "completed",
          2_000,
          1_000,
          1_000,
        );
      const enriched = [];

      const response = await callOnboarding(
        state.database,
        "/api/profile",
        "PUT",
        {
          answers: {
            name: "Maya",
            age: "8",
            favoriteCartoons: "",
            favoriteAnimals: "",
            favoriteActivities: "",
            favoriteStoryTopics: "",
          },
        },
        {},
        createDependencies({
          async enrichAnswer({ question }) {
            enriched.push(question.answerKey);
            return {
              ...GENERATED,
              summary: "Is called Maya.",
              acknowledgment: "Maya is a lovely name!",
              canonicalName: "Maya",
            };
          },
        }),
      );

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.deepEqual(enriched, ["name"]);
      assert.deepEqual(payload.acknowledgments, [
        { text: "Maya is a lovely name!", audio: null },
      ]);
      const row = state.sqlite
        .prepare("SELECT name, age, answers_json FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      assert.equal(row.name, "Maya");
      assert.equal(row.age, 8);
      assert.deepEqual(JSON.parse(row.answers_json).legacyAnswers, {
        favoriteAnimals: ["dog"],
      });
    } finally {
      state.close();
    }
  });

  it("enriches all changed prose fields and persists one atomic profile update", async () => {
    const state = createSeededDatabase();
    try {
      await callOnboarding(state.database, "/api/onboarding");
      state.sqlite.exec(
        "UPDATE learner_profile SET onboarding_status = 'completed', completed_at = 2000 WHERE auth_user_id = 'user-1'",
      );
      const enriched = [];
      let audioCalls = 0;
      const dependencies = createDependencies({
        async enrichAnswer({ question, rawAnswer }) {
          enriched.push(question.answerKey);
          return {
            summary: `Summary: ${rawAnswer}`,
            acknowledgment: `${question.answerKey} saved!`,
            canonicalName: question.answerKey === "name" ? "Maya" : null,
            canonicalAge: question.answerKey === "age" ? 9 : null,
            enrichmentStatus: "generated",
          };
        },
        async synthesizeAudio({ text }) {
          audioCalls += 1;
          const stored = state.sqlite
            .prepare("SELECT answers_json FROM learner_profile WHERE auth_user_id = ?")
            .get("user-1");
          assert.equal(Object.keys(JSON.parse(stored.answers_json).responses).length, 3);
          return text === "name saved!"
            ? { contentType: "audio/mpeg", base64: "AQID" }
            : null;
        },
      });

      const response = await callOnboarding(
        state.database,
        "/api/profile",
        "PUT",
        {
          answers: {
            name: "Maya",
            age: "I am nine",
            favoriteCartoons: "I like Bluey",
          },
        },
        {},
        dependencies,
      );
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.deepEqual(enriched, ["name", "age", "favoriteCartoons"]);
      assert.equal(audioCalls, 3);
      assert.deepEqual(
        payload.acknowledgments.map(({ text }) => text),
        ["name saved!", "age saved!", "favoriteCartoons saved!"],
      );

      const row = state.sqlite
        .prepare("SELECT name, age, answers_json, onboarding_status FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      const answers = JSON.parse(row.answers_json);
      assert.equal(row.name, "Maya");
      assert.equal(row.age, 9);
      assert.equal(row.onboarding_status, "completed");
      assert.equal(answers.responses.favoriteCartoons.rawAnswer, "I like Bluey");
    } finally {
      state.close();
    }
  });

  it("rejects every atomic profile write when one prose field is invalid", async () => {
    const state = createSeededDatabase();
    try {
      await callOnboarding(state.database, "/api/onboarding");
      state.sqlite.exec(
        "UPDATE learner_profile SET onboarding_status = 'completed', completed_at = 2000 WHERE auth_user_id = 'user-1'",
      );
      const statement = state.sqlite.prepare(
        "SELECT name, age, answers_json, updated_at FROM learner_profile WHERE auth_user_id = ?",
      );
      const before = statement.get("user-1");
      let audioCalls = 0;

      const response = await callOnboarding(
        state.database,
        "/api/profile",
        "PUT",
        {
          answers: Object.fromEntries([
            ["name", "Maya"],
            ["age", "very old"],
            ["retired", "dragons"],
            ["__proto__", "dragons"],
          ]),
        },
        {},
        createDependencies({
          async enrichAnswer({ question, rawAnswer }) {
            if (question.answerKey === "age") {
              return {
                fieldError:
                  "Please tell me your age using a number from 3 to 17.",
              };
            }
            return {
              ...GENERATED,
              summary: rawAnswer,
              acknowledgment: "Saved!",
              canonicalName: question.answerKey === "name" ? "Maya" : null,
            };
          },
          async synthesizeAudio() {
            audioCalls += 1;
            return null;
          },
        }),
      );

      assert.equal(response.status, 400);
      const payload = await response.json();
      assert.equal(payload.error, "invalid_profile");
      assert.deepEqual(Object.keys(payload.fieldErrors).sort(), [
        "__proto__",
        "age",
        "retired",
      ]);
      assert.equal(
        payload.fieldErrors.age,
        "Please tell me your age using a number from 3 to 17.",
      );
      assert.equal(
        payload.fieldErrors.retired,
        "This question is no longer available.",
      );
      assert.equal(
        payload.fieldErrors.__proto__,
        "This question is no longer available.",
      );
      assert.deepEqual(statement.get("user-1"), before);
      assert.equal(audioCalls, 0);
    } finally {
      state.close();
    }
  });
});
