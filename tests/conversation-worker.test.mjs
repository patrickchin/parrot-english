import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { describe, it } from "node:test";
import { createLearnerProfileConversationState } from "../lib/conversation-scenario.js";
import { createDatabase } from "../worker/database.ts";
import { createGuardianAccessRepository } from "../worker/guardian-access.ts";
import {
  handleConversationRequest,
} from "../worker/conversations.ts";
import { createLiveKitParticipantToken } from "../worker/livekit-token.ts";
import { createWorker } from "../worker/index.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

function createAuthStub(session) {
  let calls = 0;
  return {
    auth: {
      api: {
        async getSession() {
          calls += 1;
          return session;
        },
      },
      async handler() {
        return new Response("auth");
      },
    },
    calls: () => calls,
  };
}

function createEnvironment(overrides = {}) {
  return {
    ASSETS: { fetch: async () => new Response("asset") },
    CONVERSATION_AGENT_SECRET: "agent-secret",
    DB: {},
    LIVEKIT_API_KEY: "api-key",
    LIVEKIT_API_SECRET: "api-secret-api-secret-api-secret",
    LIVEKIT_URL: "wss://livekit.example.test",
    REALTIME_CONVERSATIONS_ENABLED: "1",
    ...overrides,
  };
}

describe("conversation Worker routing", () => {
  it("rejects anonymous browser routes before the conversation handler runs", async () => {
    const auth = createAuthStub(null);
    let handlerCalls = 0;
    const worker = createWorker({
      createAuth: () => auth.auth,
      async handleConversationRequest() {
        handlerCalls += 1;
        return Response.json({ ok: true });
      },
    });

    const response = await worker.fetch(
      new Request("https://example.test/api/conversations", { method: "POST" }),
      createEnvironment(),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
    assert.equal(auth.calls(), 1);
    assert.equal(handlerCalls, 0);
  });

  it("routes agent ingest without consulting the browser session", async () => {
    const auth = createAuthStub(null);
    const calls = [];
    const worker = createWorker({
      createAuth: () => auth.auth,
      async handleConversationRequest(input) {
        calls.push(input);
        return Response.json({ routed: true });
      },
    });
    const request = new Request(
      "https://example.test/api/conversations/conversation-1/turns",
      {
        method: "POST",
        headers: { Authorization: "Bearer agent-secret" },
      },
    );
    const env = createEnvironment();

    const response = await worker.fetch(request, env);

    assert.equal(response.status, 200);
    assert.equal(auth.calls(), 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].identity, null);
    assert.equal(calls[0].request, request);
    assert.equal(calls[0].env, env);
  });
});

function createSeededDatabase({ seedProfile = true } = {}) {
  const state = createTestD1Database();
  const insertUser = state.sqlite.prepare(
    "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
  );
  insertUser.run("user-1", "Parent One", "one@example.test", 1_000, 1_000);
  insertUser.run("user-2", "Parent Two", "two@example.test", 1_000, 1_000);
  const insertSession = state.sqlite.prepare(
    "INSERT INTO session (id, expires_at, token, user_id) VALUES (?, ?, ?, ?)",
  );
  insertSession.run("session-1", 9_999_999_999_999, "token-1", "user-1");
  insertSession.run("session-2", 9_999_999_999_999, "token-2", "user-2");
  if (seedProfile) {
    state.sqlite
      .prepare(
        `INSERT INTO learner_profile
          (id, auth_user_id, legacy_storage_owner, name, onboarding_status, created_at, updated_at)
         VALUES ('profile-1', 'user-1', 1, NULL, 'not_started', 1000, 1000)`,
      )
      .run();
  }
  return { ...state, database: createDatabase(state.d1) };
}

function request(path, method = "GET", body, headers = {}) {
  return new Request(`https://example.test${path}`, {
    method,
    headers:
      body === undefined
        ? headers
        : { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const identity = {
  sessionId: "session-1",
  userId: "user-1",
  userName: "Parent One",
  learnerProfileId: "profile-1",
  learnerName: null,
  legacyStorageOwner: true,
};

async function callConversation(
  database,
  path,
  method = "GET",
  body,
  options = {},
) {
  const env = {
    CONVERSATION_AGENT_SECRET: "agent-secret",
    DB: database.$client,
    LIVEKIT_API_KEY: "api-key",
    LIVEKIT_API_SECRET: "api-secret-api-secret-api-secret",
    LIVEKIT_URL: "wss://livekit.example.test",
    REALTIME_CONVERSATIONS_ENABLED: "1",
    ...options.env,
  };
  return handleConversationRequest(
    {
      database,
      env,
      identity: options.identity === undefined ? identity : options.identity,
      request: request(path, method, body, options.headers),
    },
    {
      createId: options.createId,
      createParticipantToken:
        options.createParticipantToken ??
        (async ({ conversation }) => `token-for-${conversation.id}`),
      deriveProfileState: options.deriveProfileState,
      now: options.now ?? (() => new Date("2026-07-08T08:00:00.000Z")),
    },
  );
}

function insertLearnerProfile(
  state,
  {
    age = 8,
    description = "Mia is eight years old and loves pandas.",
    lastSkippedAt = null,
    lastSkippedSessionId = null,
    name = "Mia",
    profileStatus = "completed",
  } = {},
) {
  state.sqlite
    .prepare(
      "UPDATE learner_profile SET name = ?, age = ?, answers_json = ?, onboarding_status = ?, last_skipped_at = ?, last_skipped_session_id = ?, completed_at = ?, updated_at = ? WHERE id = ? AND auth_user_id = ?",
    )
    .run(
      name,
      age,
      JSON.stringify({
        schemaVersion: 2,
        questionnaireVersion: 2,
        responses: {},
        legacyAnswers: null,
        description,
      }),
      profileStatus,
      lastSkippedAt,
      lastSkippedSessionId,
      profileStatus === "completed" ? 2_000 : null,
      2_000,
      "profile-1",
      "user-1",
    );
}

function createMultiLearnerDatabase() {
  const state = createSeededDatabase({ seedProfile: false });
  const insertProfile = state.sqlite.prepare(
    `INSERT INTO learner_profile
      (id, auth_user_id, legacy_storage_owner, name, onboarding_status, created_at, updated_at)
     VALUES (?, 'user-1', ?, ?, 'not_started', 1000, 1000)`,
  );
  insertProfile.run("learner-a", 1, "Mia");
  insertProfile.run("learner-b", 0, "Leo");
  const insertSession = state.sqlite.prepare(
    "INSERT INTO session (id, expires_at, token, user_id) VALUES (?, ?, ?, 'user-1')",
  );
  insertSession.run("session-a", 9_999_999_999_999, "token-a");
  insertSession.run("session-b", 9_999_999_999_999, "token-b");
  const selectLearner = state.sqlite.prepare(
    `INSERT INTO session_learner_selection
      (session_id, auth_user_id, learner_profile_id, created_at, updated_at)
     VALUES (?, 'user-1', ?, 1000, 1000)`,
  );
  selectLearner.run("session-a", "learner-a");
  selectLearner.run("session-b", "learner-b");
  return state;
}

function createRoutedConversationWorker() {
  return createWorker({
    createAuth: () => ({
      api: {
        async getSession({ headers }) {
          const sessionId = headers.get("X-Test-Session");
          if (sessionId !== "session-a" && sessionId !== "session-b") return null;
          return {
            session: { id: sessionId },
            user: { id: "user-1", name: "Parent One" },
          };
        },
      },
      async handler() {
        return new Response("auth");
      },
    }),
  });
}

function routedEnvironment(state) {
  return createEnvironment({ DB: state.d1 });
}

function browserConversation(worker, state, sessionId, path, method = "GET", body) {
  return worker.fetch(
    request(path, method, body, { "X-Test-Session": sessionId }),
    routedEnvironment(state),
  );
}

function agentConversation(worker, state, path, body) {
  return worker.fetch(
    request(path, "POST", body, { Authorization: "Bearer agent-secret" }),
    routedEnvironment(state),
  );
}

function selectLearner(state, sessionId, learnerProfileId) {
  state.sqlite
    .prepare(
      `UPDATE session_learner_selection
       SET learner_profile_id = ?, updated_at = updated_at + 1
       WHERE session_id = ?`,
    )
    .run(learnerProfileId, sessionId);
}

function storedProfile(state, learnerProfileId) {
  return state.sqlite
    .prepare(
      "SELECT id, name, age, onboarding_status AS profileStatus, answers_json FROM learner_profile WHERE id = ?",
    )
    .get(learnerProfileId);
}

async function stageConversationProfile(database, conversationId, values = {}) {
  return callConversation(
    database,
    `/api/conversations/${conversationId}/facts`,
    "POST",
    {
      controllerState: {
        phase: "closing",
        activeObjective: null,
        rephraseCount: { name: 0, age: 0, interest: 0 },
        optionalExchangeCount: 1,
        profileSummary: "Maya is nine years old and loves red pandas.",
        profileName: "Maya",
        profileAge: 9,
        learnedName: true,
        learnedAge: true,
        finishReason: "conversation_complete",
        ...values,
      },
    },
    {
      identity: null,
      headers: { Authorization: "Bearer agent-secret" },
    },
  );
}

function profileValues(state) {
  const profile = state.sqlite
    .prepare("SELECT name, age, answers_json FROM learner_profile WHERE auth_user_id = ?")
    .get("user-1");
  return {
    age: profile.age,
    description: JSON.parse(profile.answers_json).description,
    name: profile.name,
  };
}

function insertExpiredGuardianUnlock(state) {
  state.sqlite
    .prepare(
      "INSERT INTO guardian_session_unlock (session_id, unlocked_at, expires_at) VALUES (?, ?, ?)",
    )
    .run("session-1", 1_000, 2_000);
}

describe("conversation persistence and API", () => {
  it("rejects onboarding start after the learner profile is complete", async () => {
    const state = createSeededDatabase();
    try {
      insertLearnerProfile(state);

      const response = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { purpose: "onboarding" },
      );

      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: "guardian_required" });
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM conversation_session")
          .get().count,
        0,
      );
    } finally {
      state.close();
    }
  });

  it("rejects onboarding start after the learner bypassed initial setup", async () => {
    const state = createSeededDatabase();
    try {
      insertLearnerProfile(state, {
        lastSkippedAt: 2_000,
        lastSkippedSessionId: "session-1",
        profileStatus: "not_started",
      });

      const response = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { purpose: "onboarding" },
      );

      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: "guardian_required" });
    } finally {
      state.close();
    }
  });

  it("keeps initial incomplete onboarding learner-safe", async () => {
    const state = createSeededDatabase();
    try {
      insertLearnerProfile(state, { profileStatus: "in_progress" });

      const response = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { purpose: "onboarding" },
      );

      assert.equal(response.status, 201);
      assert.equal((await response.json()).conversation.scenarioKey, "onboarding");
    } finally {
      state.close();
    }
  });

  it("keeps locked and expired browser finishes outside profile persistence", async () => {
    for (const accessState of ["locked", "expired"]) {
      const state = createSeededDatabase();
      try {
        const started = await callConversation(
          state.database,
          "/api/conversations",
          "POST",
          { purpose: "onboarding" },
        );
        const { conversation } = await started.json();
        assert.equal(
          (await stageConversationProfile(state.database, conversation.id)).status,
          200,
        );
        insertLearnerProfile(state);
        if (accessState === "expired") insertExpiredGuardianUnlock(state);

        const response = await callConversation(
          state.database,
          `/api/conversations/${conversation.id}/finish`,
          "POST",
          { reason: "finished_by_learner" },
        );

        assert.equal(response.status, 200, accessState);
        assert.deepEqual(profileValues(state), {
          age: 8,
          description: "Mia is eight years old and loves pandas.",
          name: "Mia",
        });
      } finally {
        state.close();
      }
    }
  });

  it("keeps locked and expired trusted-agent endings outside profile persistence", async () => {
    for (const accessState of ["locked", "expired"]) {
      const state = createSeededDatabase();
      try {
        const started = await callConversation(
          state.database,
          "/api/conversations",
          "POST",
          { purpose: "onboarding" },
        );
        const { conversation } = await started.json();
        assert.equal(
          (await stageConversationProfile(state.database, conversation.id)).status,
          200,
        );
        insertLearnerProfile(state);
        if (accessState === "expired") insertExpiredGuardianUnlock(state);

        const response = await callConversation(
          state.database,
          `/api/conversations/${conversation.id}/end`,
          "POST",
          { finishReason: "conversation_complete", status: "completed" },
          {
            identity: null,
            headers: { Authorization: "Bearer agent-secret" },
          },
        );

        assert.equal(response.status, 200, accessState);
        assert.deepEqual(profileValues(state), {
          age: 8,
          description: "Mia is eight years old and loves pandas.",
          name: "Mia",
        });
      } finally {
        state.close();
      }
    }
  });

  it("rejects locked and expired onboarding reviews after profile completion", async () => {
    for (const accessState of ["locked", "expired"]) {
      const state = createSeededDatabase();
      try {
        const started = await callConversation(
          state.database,
          "/api/conversations",
          "POST",
          { purpose: "onboarding" },
        );
        const { conversation } = await started.json();
        assert.equal(
          (await stageConversationProfile(state.database, conversation.id)).status,
          200,
        );
        insertLearnerProfile(state);
        if (accessState === "expired") insertExpiredGuardianUnlock(state);

        const response = await callConversation(
          state.database,
          `/api/conversations/${conversation.id}/review`,
          "PUT",
          {},
        );

        assert.equal(response.status, 403, accessState);
        assert.deepEqual(await response.json(), { error: "guardian_required" });
        assert.deepEqual(profileValues(state), {
          age: 8,
          description: "Mia is eight years old and loves pandas.",
          name: "Mia",
        });
      } finally {
        state.close();
      }
    }
  });

  it("saves a profile-edit review through the current authorized session", async () => {
    const state = createSeededDatabase();
    try {
      insertLearnerProfile(state);
      await createGuardianAccessRepository(state.database).unlock("session-1");
      const started = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { purpose: "profile-edit" },
      );
      const { conversation } = await started.json();
      assert.equal(
        (await stageConversationProfile(state.database, conversation.id)).status,
        200,
      );

      const response = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/review`,
        "PUT",
        {},
      );

      assert.equal(response.status, 200);
      assert.deepEqual(profileValues(state), {
        age: 9,
        description: "Maya is nine years old and loves red pandas.",
        name: "Maya",
      });
    } finally {
      state.close();
    }
  });

  it("guards profile edits while keeping initial onboarding and small chat learner-safe", async () => {
    const state = createSeededDatabase();
    try {
      const lockedStart = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { purpose: "profile-edit" },
      );
      assert.equal(lockedStart.status, 403);
      assert.deepEqual(await lockedStart.json(), { error: "guardian_required" });
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM conversation_session")
          .get().count,
        0,
      );

      for (const purpose of ["onboarding", "small-chat"]) {
        const started = await callConversation(
          state.database,
          "/api/conversations",
          "POST",
          { purpose },
        );
        assert.equal(started.status, 201, purpose);
        const conversation = (await started.json()).conversation;
        const reviewed = await callConversation(
          state.database,
          `/api/conversations/${conversation.id}/review`,
          "PUT",
          {},
        );
        assert.equal(reviewed.status, 200, purpose);
      }

      const access = createGuardianAccessRepository(state.database);
      await access.unlock("session-1");
      const started = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { purpose: "profile-edit" },
      );
      assert.equal(started.status, 201);
      const conversation = (await started.json()).conversation;
      await access.lock("session-1");

      const lockedReview = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/review`,
        "PUT",
        {},
      );
      assert.equal(lockedReview.status, 403);
      assert.deepEqual(await lockedReview.json(), {
        error: "guardian_required",
      });
    } finally {
      state.close();
    }
  });

  it("does not mint a conversation token while realtime rollout is disabled", async () => {
    const state = createSeededDatabase();
    try {
      const response = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        undefined,
        { env: { REALTIME_CONVERSATIONS_ENABLED: "0" } },
      );

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "realtime_disabled" });
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM conversation_session")
          .get().count,
        0,
      );
    } finally {
      state.close();
    }
  });

  it("starts one owner-scoped onboarding conversation with a short-lived room token", async () => {
    const state = createSeededDatabase();
    const tokenCalls = [];
    try {
      const response = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        undefined,
        {
          createId: (() => {
            const ids = ["conversation-1"];
            return () => ids.shift() ?? "generated-id";
          })(),
          async createParticipantToken(input) {
            tokenCalls.push(input);
            return "participant-token";
          },
        },
      );

      assert.equal(response.status, 201);
      const payload = await response.json();
      assert.equal(payload.conversation.id, "conversation-1");
      assert.equal(payload.conversation.scenarioKey, "onboarding");
      assert.equal(payload.conversation.promptStyle, null);
      assert.equal(payload.conversation.status, "starting");
      assert.equal(payload.livekit.url, "wss://livekit.example.test");
      assert.equal(payload.livekit.participantToken, "participant-token");
      assert.deepEqual(payload.scenario.requiredDetails, ["name", "age"]);
      assert.equal(payload.scenario.summaryMode, "prose");
      assert.equal("requiredFacts" in payload.scenario, false);
      assert.equal(payload.scenario.maxOptionalExchanges, 3);
      assert.equal(tokenCalls.length, 1);
      assert.equal(tokenCalls[0].conversation.roomName, payload.conversation.roomName);
      assert.equal(tokenCalls[0].identity.userId, "user-1");

      const stored = state.sqlite
        .prepare("SELECT * FROM conversation_session WHERE id = ?")
        .get("conversation-1");
      assert.equal(stored.auth_user_id, "user-1");
      assert.equal(stored.learner_profile_id, "profile-1");
      assert.equal(JSON.parse(stored.controller_state).activeObjective, "name");
    } finally {
      state.close();
    }
  });

  it("stores and hands off the requested conversation purpose", async () => {
    const state = createSeededDatabase();
    const tokenPurposes = [];
    try {
      await createGuardianAccessRepository(state.database).unlock("session-1");
      for (const purpose of ["onboarding", "profile-edit", "small-chat"]) {
        const response = await callConversation(
          state.database,
          "/api/conversations",
          "POST",
          { purpose },
          {
            async createParticipantToken({ conversation }) {
              tokenPurposes.push(conversation.scenarioKey);
              return `token-for-${purpose}`;
            },
          },
        );
        const payload = await response.json();

        assert.equal(response.status, 201);
        assert.equal(payload.conversation.scenarioKey, purpose);
        assert.equal(payload.scenario.key, purpose);
      }

      assert.deepEqual(tokenPurposes, [
        "onboarding",
        "profile-edit",
        "small-chat",
      ]);
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM conversation_session")
          .get().count,
        3,
      );
    } finally {
      state.close();
    }
  });

  it("stores and hands off each Talk to Peppa prompt style", async () => {
    const state = createSeededDatabase();
    const tokenStyles = [];
    const ids = ["tiny-session", "guide-session", "play-session"];
    try {
      for (const promptStyle of [
        "tiny-turns",
        "gentle-guide",
        "playful-pal",
      ]) {
        const response = await callConversation(
          state.database,
          "/api/conversations",
          "POST",
          { promptStyle, purpose: "small-chat" },
          {
            createId: () => ids.shift() ?? "generated-id",
            async createParticipantToken(input) {
              tokenStyles.push(input.promptStyle);
              return `token-for-${promptStyle}`;
            },
          },
        );
        const payload = await response.json();

        assert.equal(response.status, 201);
        assert.equal(payload.conversation.promptStyle, promptStyle);
        assert.equal(payload.conversation.scenarioVersion, 2);
        assert.equal(payload.scenario.version, 2);
        assert.equal(payload.scenario.maxOptionalExchanges, 8);
      }

      assert.deepEqual(tokenStyles, [
        "tiny-turns",
        "gentle-guide",
        "playful-pal",
      ]);
      const rows = state.sqlite
        .prepare(
          "SELECT prompt_style FROM conversation_session ORDER BY created_at, id",
        )
        .all();
      assert.deepEqual(
        new Set(rows.map((row) => row.prompt_style)),
        new Set(["tiny-turns", "gentle-guide", "playful-pal"]),
      );
    } finally {
      state.close();
    }
  });

  it("defaults old clients and rejects invalid prompt-style combinations", async () => {
    const state = createSeededDatabase();
    try {
      const compatible = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { purpose: "small-chat" },
      );
      assert.equal(
        (await compatible.json()).conversation.promptStyle,
        "tiny-turns",
      );

      for (const body of [
        { promptStyle: "wordy", purpose: "small-chat" },
        { promptStyle: "tiny-turns", purpose: "onboarding" },
      ]) {
        const response = await callConversation(
          state.database,
          "/api/conversations",
          "POST",
          body,
        );
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
          error: "invalid_prompt_style",
        });
      }
    } finally {
      state.close();
    }
  });

  it("finishes small chat without creating or changing a learner profile", async () => {
    const state = createSeededDatabase();
    try {
      const started = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { purpose: "small-chat" },
      );
      const conversation = (await started.json()).conversation;
      const review = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/review`,
        "PUT",
        {},
      );

      assert.equal(review.status, 200);
      assert.deepEqual(await review.json(), {
        conversationId: conversation.id,
        profileCompleted: false,
        bypassed: false,
      });
      assert.equal(storedProfile(state, "profile-1").profileStatus, "not_started");
    } finally {
      state.close();
    }
  });

  it("derives and saves the learner profile once during review", async () => {
    const state = createSeededDatabase();
    const derivations = [];
    try {
      const started = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { purpose: "onboarding" },
      );
      const conversation = (await started.json()).conversation;
      const agentOptions = {
        identity: null,
        headers: { Authorization: "Bearer agent-secret" },
      };
      for (const [sequence, role, text] of [
        [0, "assistant", "What is your name?"],
        [1, "user", "My name is Mia and I am eight."],
      ]) {
        await callConversation(
          state.database,
          `/api/conversations/${conversation.id}/turns`,
          "POST",
          {
            providerItemId: `turn-${sequence}`,
            sequence,
            role,
            text,
            language: "en",
            inputMode: "voice",
            interrupted: false,
          },
          agentOptions,
        );
      }

      const review = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/review`,
        "PUT",
        {},
        {
          async deriveProfileState(input) {
            derivations.push(input);
            return {
              ...input.initialState,
              learnedAge: true,
              learnedName: true,
              profileAge: 8,
              profileName: "Mia",
              profileSummary: "Mia is eight years old.",
            };
          },
        },
      );

      assert.equal(review.status, 200);
      assert.equal(derivations.length, 1);
      assert.deepEqual(
        derivations[0].turns.map(({ role, text }) => ({ role, text })),
        [
          { role: "assistant", text: "What is your name?" },
          { role: "user", text: "My name is Mia and I am eight." },
        ],
      );
      assert.deepEqual(await review.json(), {
        conversationId: conversation.id,
        profileCompleted: true,
        bypassed: false,
      });
      const profile = state.sqlite
        .prepare("SELECT * FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      assert.equal(profile.name, "Mia");
      assert.equal(profile.age, 8);
      assert.equal(JSON.parse(profile.answers_json).description, "Mia is eight years old.");
    } finally {
      state.close();
    }
  });

  it("rejects an unknown conversation purpose", async () => {
    const state = createSeededDatabase();
    try {
      const response = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { purpose: "everything-at-once" },
      );

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: "invalid_conversation_purpose",
      });
    } finally {
      state.close();
    }
  });

  it("reuses the learner's active conversation instead of creating parallel rooms", async () => {
    const state = createSeededDatabase();
    try {
      const first = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
      );
      const second = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
      );
      const firstPayload = await first.json();
      const secondPayload = await second.json();

      assert.equal(second.status, 201);
      assert.equal(secondPayload.conversation.id, firstPayload.conversation.id);
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM conversation_session")
          .get().count,
        1,
      );
    } finally {
      state.close();
    }
  });

  it("reuses active conversations only within the starting learner", async () => {
    const state = createMultiLearnerDatabase();
    const worker = createRoutedConversationWorker();
    try {
      const firstA = await browserConversation(
        worker,
        state,
        "session-a",
        "/api/conversations",
        "POST",
        { purpose: "small-chat" },
      );
      const retryA = await browserConversation(
        worker,
        state,
        "session-a",
        "/api/conversations",
        "POST",
        { purpose: "small-chat" },
      );
      const firstB = await browserConversation(
        worker,
        state,
        "session-b",
        "/api/conversations",
        "POST",
        { purpose: "small-chat" },
      );
      const firstAPayload = await firstA.json();
      const retryAPayload = await retryA.json();
      const firstBPayload = await firstB.json();

      assert.equal(retryAPayload.conversation.id, firstAPayload.conversation.id);
      assert.notEqual(firstBPayload.conversation.id, firstAPayload.conversation.id);
      assert.deepEqual(
        state.sqlite
          .prepare(
            "SELECT learner_profile_id FROM conversation_session ORDER BY learner_profile_id",
          )
          .all()
          .map(({ learner_profile_id }) => learner_profile_id),
        ["learner-a", "learner-b"],
      );
    } finally {
      state.close();
    }
  });

  it("does not reveal a same-account sibling conversation to browser GET", async () => {
    const state = createMultiLearnerDatabase();
    const worker = createRoutedConversationWorker();
    try {
      const started = await browserConversation(
        worker,
        state,
        "session-a",
        "/api/conversations",
        "POST",
        { purpose: "small-chat" },
      );
      const { conversation } = await started.json();

      const sibling = await browserConversation(
        worker,
        state,
        "session-b",
        `/api/conversations/${conversation.id}`,
      );
      const owner = await browserConversation(
        worker,
        state,
        "session-a",
        `/api/conversations/${conversation.id}`,
      );

      assert.equal(sibling.status, 404);
      assert.equal(owner.status, 200);
    } finally {
      state.close();
    }
  });

  it("does not let a same-account sibling finish a browser conversation", async () => {
    const state = createMultiLearnerDatabase();
    const worker = createRoutedConversationWorker();
    try {
      const started = await browserConversation(
        worker,
        state,
        "session-a",
        "/api/conversations",
        "POST",
        { purpose: "small-chat" },
      );
      const { conversation } = await started.json();

      const sibling = await browserConversation(
        worker,
        state,
        "session-b",
        `/api/conversations/${conversation.id}/finish`,
        "POST",
        {},
      );

      assert.equal(sibling.status, 404);
      assert.equal(
        state.sqlite
          .prepare("SELECT status FROM conversation_session WHERE id = ?")
          .get(conversation.id).status,
        "starting",
      );
    } finally {
      state.close();
    }
  });

  it("keeps trusted callbacks bound to the stored conversation learner", async () => {
    const state = createMultiLearnerDatabase();
    const worker = createRoutedConversationWorker();
    try {
      const started = await browserConversation(
        worker,
        state,
        "session-a",
        "/api/conversations",
        "POST",
        { purpose: "small-chat" },
      );
      const { conversation } = await started.json();
      selectLearner(state, "session-a", "learner-b");

      const turn = await agentConversation(
        worker,
        state,
        `/api/conversations/${conversation.id}/turns`,
        {
          providerItemId: "trusted-turn",
          sequence: 0,
          role: "user",
          text: "Hello!",
          inputMode: "voice",
        },
      );
      const facts = await agentConversation(
        worker,
        state,
        `/api/conversations/${conversation.id}/facts`,
        { controllerState: { checkpoint: "stored-owner" } },
      );
      const ended = await agentConversation(
        worker,
        state,
        `/api/conversations/${conversation.id}/end`,
        { finishReason: "conversation_complete", status: "completed" },
      );

      assert.equal(turn.status, 201);
      assert.equal(facts.status, 200);
      assert.equal(ended.status, 200);
      const stored = state.sqlite
        .prepare(
          "SELECT learner_profile_id, status, controller_state FROM conversation_session WHERE id = ?",
        )
        .get(conversation.id);
      assert.equal(stored.learner_profile_id, "learner-a");
      assert.equal(stored.status, "completed");
      assert.deepEqual(JSON.parse(stored.controller_state), {
        checkpoint: "stored-owner",
      });
      assert.equal(storedProfile(state, "learner-a").profileStatus, "not_started");
      assert.equal(storedProfile(state, "learner-b").profileStatus, "not_started");
    } finally {
      state.close();
    }
  });

  it("rejects switched-learner review and finalizes the starting learner after re-selection", async () => {
    const state = createMultiLearnerDatabase();
    const worker = createRoutedConversationWorker();
    try {
      const started = await browserConversation(
        worker,
        state,
        "session-a",
        "/api/conversations",
        "POST",
        { purpose: "onboarding" },
      );
      const { conversation } = await started.json();
      assert.equal(
        (
          await agentConversation(
            worker,
            state,
            `/api/conversations/${conversation.id}/facts`,
            {
              controllerState: {
                ...conversation.controllerState,
                profileSummary: "Mia is eight and likes pandas.",
                profileName: "Mia",
                profileAge: 8,
                learnedName: true,
                learnedAge: true,
              },
            },
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await agentConversation(
            worker,
            state,
            `/api/conversations/${conversation.id}/end`,
            { finishReason: "conversation_complete", status: "completed" },
          )
        ).status,
        200,
      );
      assert.equal(storedProfile(state, "learner-a").profileStatus, "not_started");

      selectLearner(state, "session-a", "learner-b");
      const switchedReview = await browserConversation(
        worker,
        state,
        "session-a",
        `/api/conversations/${conversation.id}/review`,
        "PUT",
        {},
      );
      assert.equal(switchedReview.status, 404);
      assert.equal(storedProfile(state, "learner-a").profileStatus, "not_started");
      assert.equal(storedProfile(state, "learner-b").profileStatus, "not_started");

      selectLearner(state, "session-a", "learner-a");
      const ownerReview = await browserConversation(
        worker,
        state,
        "session-a",
        `/api/conversations/${conversation.id}/review`,
        "PUT",
        {},
      );
      assert.equal(ownerReview.status, 200);
      assert.equal(storedProfile(state, "learner-a").profileStatus, "completed");
      assert.equal(storedProfile(state, "learner-b").profileStatus, "not_started");
    } finally {
      state.close();
    }
  });

  it("shows a null-profile legacy conversation only to the legacy learner", async () => {
    const state = createMultiLearnerDatabase();
    const worker = createRoutedConversationWorker();
    try {
      state.sqlite
        .prepare(
          `INSERT INTO conversation_session
            (id, auth_user_id, learner_profile_id, scenario_key, scenario_version, room_name, status, controller_state, started_at, created_at, updated_at)
           VALUES ('legacy-conversation', 'user-1', NULL, 'small-chat', 2, 'legacy-room', 'active', '{}', 1000, 1000, 1000)`,
        )
        .run();

      const legacyOwner = await browserConversation(
        worker,
        state,
        "session-a",
        "/api/conversations/legacy-conversation",
      );
      const sibling = await browserConversation(
        worker,
        state,
        "session-b",
        "/api/conversations/legacy-conversation",
      );

      assert.equal(legacyOwner.status, 200);
      assert.equal(sibling.status, 404);
    } finally {
      state.close();
    }
  });

  it("reuses the same style but retires an active room when its style changes", async () => {
    const state = createSeededDatabase();
    const ids = ["conversation-tiny", "conversation-guide"];
    const createId = () => ids.shift() ?? "generated-id";
    try {
      const first = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { promptStyle: "tiny-turns", purpose: "small-chat" },
        { createId },
      );
      const retry = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { promptStyle: "tiny-turns", purpose: "small-chat" },
        { createId },
      );
      const changed = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { promptStyle: "gentle-guide", purpose: "small-chat" },
        { createId },
      );
      const firstPayload = await first.json();
      const retryPayload = await retry.json();
      const changedPayload = await changed.json();

      assert.equal(retryPayload.conversation.id, firstPayload.conversation.id);
      assert.notEqual(changedPayload.conversation.id, firstPayload.conversation.id);
      assert.equal(changedPayload.conversation.promptStyle, "gentle-guide");
      const retired = state.sqlite
        .prepare(
          "SELECT status, finish_reason FROM conversation_session WHERE id = ?",
        )
        .get(firstPayload.conversation.id);
      assert.equal(retired.status, "abandoned");
      assert.equal(
        retired.finish_reason,
        "conversation_configuration_changed",
      );
    } finally {
      state.close();
    }
  });

  it("seeds profile editing and its signed agent handoff from the saved profile", async () => {
    const state = createSeededDatabase();
    const tokenCalls = [];
    try {
      insertLearnerProfile(state, {
        age: 30,
        description: "Mia is thirty and loves fast red cars.",
        profileStatus: "completed",
      });
      await createGuardianAccessRepository(state.database).unlock("session-1");

      const response = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { purpose: "profile-edit" },
        {
          async createParticipantToken(input) {
            tokenCalls.push(input);
            return "participant-token";
          },
        },
      );
      const payload = await response.json();

      assert.equal(response.status, 201);
      assert.equal(payload.conversation.controllerState.phase, "optional");
      assert.equal(payload.conversation.controllerState.profileName, "Mia");
      assert.equal(payload.conversation.controllerState.profileAge, 30);
      assert.equal(
        payload.conversation.controllerState.profileSummary,
        "Mia is thirty and loves fast red cars.",
      );
      assert.deepEqual(tokenCalls[0].initialState, payload.conversation.controllerState);
    } finally {
      state.close();
    }
  });

  it("does not reveal another user's conversation", async () => {
    const state = createSeededDatabase();
    try {
      await callConversation(state.database, "/api/conversations", "POST");
      const row = state.sqlite
        .prepare("SELECT id FROM conversation_session LIMIT 1")
        .get();

      const response = await callConversation(
        state.database,
        `/api/conversations/${row.id}`,
        "GET",
        undefined,
        {
          identity: {
            sessionId: "session-2",
            userId: "user-2",
            userName: "Parent Two",
            learnerProfileId: "profile-2",
            learnerName: null,
            legacyStorageOwner: true,
          },
        },
      );

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "not_found" });
    } finally {
      state.close();
    }
  });

  it("requires the agent secret and ingests finalized turns idempotently", async () => {
    const state = createSeededDatabase();
    try {
      const started = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
      );
      const { conversation } = await started.json();
      const path = `/api/conversations/${conversation.id}/turns`;
      const turn = {
        providerItemId: "provider-user-1",
        sequence: 1,
        role: "user",
        text: "My name is Mia.",
        language: "en",
        inputMode: "voice",
        interrupted: false,
      };

      const unauthorized = await callConversation(
        state.database,
        path,
        "POST",
        turn,
        { identity: null, headers: { Authorization: "Bearer wrong" } },
      );
      assert.equal(unauthorized.status, 401);

      const first = await callConversation(state.database, path, "POST", turn, {
        identity: null,
        headers: { Authorization: "Bearer agent-secret" },
      });
      const repeated = await callConversation(state.database, path, "POST", turn, {
        identity: null,
        headers: { Authorization: "Bearer agent-secret" },
      });
      assert.equal(first.status, 201);
      assert.equal(repeated.status, 200);
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM conversation_turn")
          .get().count,
        1,
      );

      const collision = await callConversation(
        state.database,
        path,
        "POST",
        { ...turn, providerItemId: "provider-user-2" },
        {
          identity: null,
          headers: { Authorization: "Bearer agent-secret" },
        },
      );
      assert.equal(collision.status, 409);
      assert.deepEqual(await collision.json(), { error: "sequence_conflict" });
    } finally {
      state.close();
    }
  });

  it("keeps a terminal conversation stopped when a final assistant turn arrives late", async () => {
    const state = createSeededDatabase();
    try {
      const started = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
      );
      const { conversation } = await started.json();
      const agentOptions = {
        identity: null,
        headers: { Authorization: "Bearer agent-secret" },
      };

      const ended = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/end`,
        "POST",
        { finishReason: "child_stopped", status: "stopped" },
        agentOptions,
      );
      assert.equal(ended.status, 200);

      const finalTurn = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/turns`,
        "POST",
        {
          providerItemId: "provider-assistant-final",
          sequence: 0,
          role: "assistant",
          text: "Thanks for chatting with me!",
          language: "en",
          inputMode: "voice",
          interrupted: false,
        },
        agentOptions,
      );
      assert.equal(finalTurn.status, 201);

      const stored = state.sqlite
        .prepare(
          "SELECT status, finish_reason, ended_at FROM conversation_session WHERE id = ?",
        )
        .get(conversation.id);
      assert.equal(stored.status, "stopped");
      assert.equal(stored.finish_reason, "child_stopped");
      assert.notEqual(stored.ended_at, null);
    } finally {
      state.close();
    }
  });

  it("defers an agent-ended profile edit to authenticated review", async () => {
    const state = createSeededDatabase();
    try {
      insertLearnerProfile(state);
      await createGuardianAccessRepository(state.database).unlock("session-1");
      const started = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { purpose: "profile-edit" },
      );
      const { conversation } = await started.json();
      const agentOptions = {
        identity: null,
        headers: { Authorization: "Bearer agent-secret" },
      };
      const controllerState = {
        phase: "closing",
        activeObjective: null,
        rephraseCount: { name: 0, age: 0, interest: 0 },
        optionalExchangeCount: 1,
        profileSummary: "Maya is nine years old and loves pandas.",
        profileName: "Maya",
        profileAge: 9,
        learnedName: true,
        learnedAge: true,
        finishReason: "child_stopped",
      };

      const staged = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/facts`,
        "POST",
        { controllerState },
        agentOptions,
      );
      assert.equal(staged.status, 200);

      const ended = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/end`,
        "POST",
        { finishReason: "child_stopped", status: "stopped" },
        agentOptions,
      );

      assert.equal(ended.status, 200);
      assert.deepEqual(profileValues(state), {
        age: 8,
        description: "Mia is eight years old and loves pandas.",
        name: "Mia",
      });

      const reviewed = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/review`,
        "PUT",
        {},
      );
      assert.equal(reviewed.status, 200);
      const profile = state.sqlite
        .prepare("SELECT * FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      assert.equal(profile.name, "Maya");
      assert.equal(profile.age, 9);
      assert.equal(profile.onboarding_status, "completed");
      assert.equal(
        JSON.parse(profile.answers_json).description,
        "Maya is nine years old and loves pandas.",
      );
    } finally {
      state.close();
    }
  });

  it("rejects private details at the reusable profile persistence boundary", async () => {
    const state = createSeededDatabase();
    try {
      await createGuardianAccessRepository(state.database).unlock("session-1");
      insertLearnerProfile(state);
      const started = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { purpose: "profile-edit" },
      );
      const { conversation } = await started.json();
      const agentOptions = {
        identity: null,
        headers: { Authorization: "Bearer agent-secret" },
      };

      const staged = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/facts`,
        "POST",
        {
          controllerState: {
            ...conversation.controllerState,
            profileSummary:
              "Mia attends Rainbow School and lives at 14 River Road.",
            profileName: "Mia",
            profileAge: 8,
            learnedName: true,
            learnedAge: true,
          },
        },
        agentOptions,
      );
      assert.equal(staged.status, 200);

      const ended = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/end`,
        "POST",
        { finishReason: "conversation_complete", status: "completed" },
        agentOptions,
      );

      assert.equal(ended.status, 200);
      const profile = state.sqlite
        .prepare("SELECT * FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      assert.equal(
        JSON.parse(profile.answers_json).description,
        "Mia is eight years old and loves pandas.",
      );

      const review = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/review`,
        "PUT",
        {},
      );
      assert.equal(review.status, 400);
      assert.deepEqual(await review.json(), {
        error: "private_profile_details",
      });
      const profileAfterReview = state.sqlite
        .prepare("SELECT * FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      assert.equal(
        JSON.parse(profileAfterReview.answers_json).description,
        "Mia is eight years old and loves pandas.",
      );

      const stagedSurnameSummary = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/facts`,
        "POST",
        {
          controllerState: {
            ...conversation.controllerState,
            profileSummary: "Mia Smith likes pandas.",
            profileName: "Mia",
            profileAge: 8,
            learnedName: true,
            learnedAge: true,
          },
        },
        agentOptions,
      );
      assert.equal(stagedSurnameSummary.status, 200);
      const surnameSummaryReview = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/review`,
        "PUT",
        {},
      );
      assert.equal(surnameSummaryReview.status, 400);
      assert.deepEqual(await surnameSummaryReview.json(), {
        error: "preferred_name_required",
      });

      const stagedFullName = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/facts`,
        "POST",
        {
          controllerState: {
            ...conversation.controllerState,
            profileSummary: "Mia likes pandas.",
            profileName: "Mia Smith",
            profileAge: 8,
            learnedName: true,
            learnedAge: true,
          },
        },
        agentOptions,
      );
      assert.equal(stagedFullName.status, 200);
      const fullNameReview = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/review`,
        "PUT",
        {},
      );
      assert.equal(fullNameReview.status, 400);
      assert.deepEqual(await fullNameReview.json(), {
        error: "preferred_name_required",
      });
    } finally {
      state.close();
    }
  });

  it("finishes without rewriting an unchanged legacy-private profile", async () => {
    const state = createSeededDatabase();
    try {
      await createGuardianAccessRepository(state.database).unlock("session-1");
      insertLearnerProfile(state, {
        description: "Mia attends Rainbow School.",
        name: "Mia Smith",
      });
      const profileStatement = state.sqlite.prepare(
        "SELECT name, age, answers_json, onboarding_status, completed_at, updated_at FROM learner_profile WHERE auth_user_id = ?",
      );
      const before = profileStatement.get("user-1");
      const started = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { purpose: "profile-edit" },
      );
      const { conversation } = await started.json();
      const agentOptions = {
        identity: null,
        headers: { Authorization: "Bearer agent-secret" },
      };

      const ended = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/end`,
        "POST",
        { finishReason: "conversation_complete", status: "completed" },
        agentOptions,
      );
      assert.equal(ended.status, 200);
      assert.deepEqual(profileStatement.get("user-1"), before);

      const reviewed = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/review`,
        "PUT",
        {},
      );
      assert.equal(reviewed.status, 200);
      assert.deepEqual(await reviewed.json(), {
        bypassed: false,
        conversationId: conversation.id,
        profileCompleted: true,
      });
      assert.deepEqual(profileStatement.get("user-1"), before);
      assert.equal(
        state.sqlite
          .prepare("SELECT status FROM conversation_session WHERE id = ?")
          .get(conversation.id).status,
        "completed",
      );
    } finally {
      state.close();
    }
  });

  it("completes the learner profile only during browser review", async () => {
    const state = createSeededDatabase();
    try {
      const started = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
      );
      const { conversation } = await started.json();
      const agentOptions = {
        identity: null,
        headers: { Authorization: "Bearer agent-secret" },
      };
      const staged = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/facts`,
        "POST",
        {
          controllerState: {
            phase: "closing",
            activeObjective: null,
            rephraseCount: { name: 0, age: 0, interest: 0 },
            optionalExchangeCount: 1,
            profileSummary: "Mia is eight years old and loves pandas.",
            profileName: "Mia",
            profileAge: 8,
            learnedName: true,
            learnedAge: true,
            finishReason: "task_complete",
          },
        },
        agentOptions,
      );
      assert.equal(staged.status, 200);

      const ended = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/end`,
        "POST",
        { finishReason: "task_complete", status: "completed" },
        agentOptions,
      );

      assert.equal(ended.status, 200);
      assert.equal(storedProfile(state, "profile-1").profileStatus, "not_started");

      const reviewed = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/review`,
        "PUT",
        {},
      );
      assert.equal(reviewed.status, 200);
      const profile = state.sqlite
        .prepare("SELECT * FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      assert.equal(profile.name, "Mia");
      assert.equal(profile.age, 8);
      assert.equal(profile.onboarding_status, "completed");
      assert.equal(
        JSON.parse(profile.answers_json).description,
        "Mia is eight years old and loves pandas.",
      );
    } finally {
      state.close();
    }
  });

  it("ignores unrelated controller-state request properties", async () => {
    const state = createSeededDatabase();
    try {
      const started = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
      );
      const { conversation } = await started.json();
      const factsResponse = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/facts`,
        "POST",
        {
          controllerState: { checkpoint: "stored-owner" },
          unrelated: "ignored",
        },
        {
          identity: null,
          headers: { Authorization: "Bearer agent-secret" },
        },
      );
      assert.equal(factsResponse.status, 200);
      assert.deepEqual(await factsResponse.json(), {
        conversationId: conversation.id,
      });
      const stored = state.sqlite
        .prepare("SELECT controller_state FROM conversation_session WHERE id = ?")
        .get(conversation.id);
      assert.deepEqual(JSON.parse(stored.controller_state), {
        checkpoint: "stored-owner",
      });
    } finally {
      state.close();
    }
  });

  it("finalizes the saved prose profile without a client review payload", async () => {
    const state = createSeededDatabase();
    try {
      const started = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
      );
      const { conversation } = await started.json();
      const controllerState = {
        phase: "closing",
        activeObjective: null,
        rephraseCount: { name: 0, age: 0, interest: 0 },
        optionalExchangeCount: 1,
        profileSummary: "Mia is thirty years old and likes pandas.",
        profileName: "Mia",
        profileAge: 30,
        learnedName: true,
        learnedAge: true,
        finishReason: "task_complete",
      };
      const stateResponse = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/facts`,
        "POST",
        { controllerState },
        {
          identity: null,
          headers: { Authorization: "Bearer agent-secret" },
        },
      );
      assert.equal(stateResponse.status, 200);

      const review = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/review`,
        "PUT",
        {},
      );

      assert.equal(review.status, 200);
      assert.deepEqual(await review.json(), {
        conversationId: conversation.id,
        profileCompleted: true,
        bypassed: false,
      });
      const profile = state.sqlite
        .prepare("SELECT * FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      assert.equal(profile.name, "Mia");
      assert.equal(profile.age, 30);
      assert.equal(profile.onboarding_status, "completed");
      const answers = JSON.parse(profile.answers_json);
      assert.equal(
        answers.description,
        "Mia is thirty years old and likes pandas.",
      );
      const stored = state.sqlite
        .prepare("SELECT controller_state FROM conversation_session WHERE id = ?")
        .get(conversation.id);
      assert.deepEqual(JSON.parse(stored.controller_state), {
        ...controllerState,
      });
    } finally {
      state.close();
    }
  });

  it("blocks repeated onboarding after finalization creates an exact-session bypass", async () => {
    const state = createSeededDatabase();
    try {
      const started = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
      );
      const { conversation } = await started.json();
      await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/facts`,
        "POST",
        {
          controllerState: {
            phase: "closing",
            activeObjective: null,
            rephraseCount: { name: 1, age: 1, interest: 0 },
            optionalExchangeCount: 0,
            profileSummary: "Mia shared her name.",
            profileName: "Mia",
            profileAge: null,
            learnedName: true,
            learnedAge: false,
            finishReason: "child_stopped",
          },
        },
        {
          identity: null,
          headers: { Authorization: "Bearer agent-secret" },
        },
      );

      const review = await callConversation(
        state.database,
        `/api/conversations/${conversation.id}/review`,
        "PUT",
        {},
      );

      assert.equal(review.status, 200);
      assert.deepEqual(await review.json(), {
        conversationId: conversation.id,
        profileCompleted: false,
        bypassed: true,
      });
      assert.equal(
        state.sqlite
          .prepare(
            "SELECT count(*) AS count FROM onboarding_session_bypass WHERE session_id = ? AND auth_user_id = ?",
          )
          .get("session-1", "user-1").count,
        1,
      );
      const profile = state.sqlite
        .prepare("SELECT * FROM learner_profile WHERE auth_user_id = ?")
        .get("user-1");
      assert.equal(profile.name, "Mia");
      assert.equal(profile.onboarding_status, "not_started");
      assert.equal(JSON.parse(profile.answers_json).description, "Mia shared her name.");

      const repeatedOnboarding = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        { purpose: "onboarding" },
      );
      assert.equal(repeatedOnboarding.status, 403);
      assert.deepEqual(await repeatedOnboarding.json(), {
        error: "guardian_required",
      });
    } finally {
      state.close();
    }
  });

  it("abandons an active conversation after its participant token has expired", async () => {
    const state = createSeededDatabase();
    const ids = ["conversation-1", "conversation-2"];
    const createId = () => ids.shift() ?? "generated-id";
    try {
      const first = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        undefined,
        {
          createId,
          now: () => new Date("2026-07-08T08:00:00.000Z"),
        },
      );
      const second = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        undefined,
        {
          createId,
          now: () => new Date("2026-07-08T08:10:01.000Z"),
        },
      );
      const firstPayload = await first.json();
      const secondPayload = await second.json();

      assert.notEqual(secondPayload.conversation.id, firstPayload.conversation.id);
      assert.equal(secondPayload.conversation.status, "starting");
      const expired = state.sqlite
        .prepare(
          "SELECT status, finish_reason FROM conversation_session WHERE id = ?",
        )
        .get(firstPayload.conversation.id);
      assert.equal(expired.status, "abandoned");
      assert.equal(
        expired.finish_reason,
        "participant_token_expired",
      );
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM conversation_session")
          .get().count,
        2,
      );
    } finally {
      state.close();
    }
  });
});

describe("LiveKit participant tokens", () => {
  it("scopes a learner token to one room for ten minutes without embedding secrets", async () => {
    const token = await createLiveKitParticipantToken({
      env: {
        LIVEKIT_API_KEY: "api-key",
        LIVEKIT_API_SECRET: "api-secret-api-secret-api-secret",
      },
      conversation: {
        id: "conversation-1",
        roomName: "learner-profile-room-1",
        scenarioKey: "profile-edit",
      },
      identity,
      initialState: createLearnerProfileConversationState({
        profileAge: 30,
        profileName: "Mia",
        profileSummary: "Mia is thirty and loves fast red cars.",
      }),
    });
    const [, encodedPayload] = token.split(".");
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString());

    assert.equal(payload.sub, "learner:user-1:conversation-1");
    assert.deepEqual(JSON.parse(payload.metadata), {
      conversationId: "conversation-1",
      learnerProfile: {
        age: 30,
        name: "Mia",
        summary: "Mia is thirty and loves fast red cars.",
      },
      scenarioKey: "profile-edit",
    });
    assert.equal(payload.video.room, "learner-profile-room-1");
    assert.equal(payload.video.roomJoin, true);
    assert.equal(payload.roomConfig, undefined);
    assert.equal(payload.exp - payload.nbf, 600);
    assert.equal(token.includes("api-secret"), false);
  });

  it("targets an explicitly named agent for isolated local development", async () => {
    const token = await createLiveKitParticipantToken({
      env: {
        LIVEKIT_AGENT_NAME: "parrot-local",
        LIVEKIT_API_KEY: "api-key",
        LIVEKIT_API_SECRET: "api-secret-api-secret-api-secret",
      },
      conversation: {
        id: "conversation-2",
        roomName: "learner-profile-room-2",
        scenarioKey: "small-chat",
      },
      identity,
      promptStyle: "playful-pal",
    });
    const [, encodedPayload] = token.split(".");
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString());

    assert.equal(payload.roomConfig.agents.length, 1);
    assert.equal(payload.roomConfig.agents[0].agentName, "parrot-local");
    assert.equal(JSON.parse(payload.metadata).promptStyle, "playful-pal");
  });
});
