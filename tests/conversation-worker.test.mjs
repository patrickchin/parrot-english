import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { describe, it } from "node:test";
import { createOnboardingConversationState } from "../lib/conversation-scenario.js";
import { createDatabase } from "../worker/database.ts";
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
    REALTIME_ONBOARDING_ENABLED: "1",
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

function createSeededDatabase() {
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
    REALTIME_ONBOARDING_ENABLED: "1",
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
      now: options.now ?? (() => new Date("2026-07-08T08:00:00.000Z")),
    },
  );
}

describe("conversation persistence and API", () => {
  it("does not mint a conversation token while realtime rollout is disabled", async () => {
    const state = createSeededDatabase();
    try {
      const response = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        undefined,
        { env: { REALTIME_ONBOARDING_ENABLED: "0" } },
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
      assert.equal(JSON.parse(stored.controller_state).activeObjective, "name");
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

  it("seeds redo onboarding and its signed agent handoff from the saved profile", async () => {
    const state = createSeededDatabase();
    const tokenCalls = [];
    try {
      state.sqlite
        .prepare(
          "INSERT INTO learner_profile (id, auth_user_id, name, age, answers_json, onboarding_status, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          "profile-1",
          "user-1",
          "Mia",
          30,
          JSON.stringify({
            schemaVersion: 2,
            questionnaireVersion: 2,
            responses: {},
            legacyAnswers: null,
            description: "Mia is thirty and loves fast red cars.",
          }),
          "completed",
          2_000,
          1_000,
          2_000,
        );

      const response = await callConversation(
        state.database,
        "/api/conversations",
        "POST",
        undefined,
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

  it("rejects legacy structured fact candidates without storing them", async () => {
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
          controllerState: { profileSummary: "Mia likes pandas." },
          candidates: [
            { id: "fact-name", key: "name", value: "Mia", sourceTurnIds: [] },
          ],
        },
        {
          identity: null,
          headers: { Authorization: "Bearer agent-secret" },
        },
      );
      assert.equal(factsResponse.status, 400);
      assert.deepEqual(await factsResponse.json(), { error: "invalid_facts" });
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM conversation_fact")
          .get().count,
        0,
      );
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
        { controllerState, candidates: [] },
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
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM conversation_fact")
          .get().count,
        0,
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

  it("creates an exact-session bypass when finalization lacks a required detail", async () => {
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
          candidates: [],
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
      conversation: { id: "conversation-1", roomName: "onboarding-room-1" },
      identity,
      initialState: createOnboardingConversationState({
        profileAge: 30,
        profileName: "Mia",
        profileSummary: "Mia is thirty and loves fast red cars.",
      }),
      now: new Date("2026-07-08T08:00:00.000Z"),
    });
    const [, encodedPayload] = token.split(".");
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString());

    assert.equal(payload.sub, "learner:user-1:conversation-1");
    assert.deepEqual(JSON.parse(payload.metadata), {
      conversationId: "conversation-1",
      onboardingProfile: {
        age: 30,
        name: "Mia",
        summary: "Mia is thirty and loves fast red cars.",
      },
      scenarioKey: "onboarding",
    });
    assert.equal(payload.video.room, "onboarding-room-1");
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
      conversation: { id: "conversation-2", roomName: "onboarding-room-2" },
      identity,
    });
    const [, encodedPayload] = token.split(".");
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString());

    assert.equal(payload.roomConfig.agents.length, 1);
    assert.equal(payload.roomConfig.agents[0].agentName, "parrot-local");
  });
});
