import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDatabase } from "../worker/database.ts";
import { createGuardianAccessRepository } from "../worker/guardian-access.ts";
import { createWorker } from "../worker/index.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const STORY_ID = "the-red-ball";
const METADATA_PATH = `/api/stories/${STORY_ID}/personalized-art`;
const ASSET_PATH = `${METADATA_PATH}/asset`;

function authStub(session) {
  return {
    api: {
      async getSession() {
        return session;
      },
    },
    async handler() {
      return new Response("auth");
    },
  };
}

function environment() {
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
      PERSONALIZED_STORY_ART_ENABLED: "1",
      PERSONALIZED_STORY_ART_DATA_APPROVED: "1",
    },
    getAssetCalls: () => assetCalls,
  };
}

function authenticatedEnvironment() {
  const state = createTestD1Database();
  const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
  state.sqlite
    .prepare(
      "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
    )
    .run("user-1", "Parent", "parent@example.test", timestamp, timestamp);
  state.sqlite
    .prepare(
      "INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      "session-1",
      timestamp + 86_400_000,
      "token-1",
      timestamp,
      timestamp,
      "user-1",
    );
  state.sqlite
    .prepare(
      `INSERT INTO learner_profile (
        id, auth_user_id, legacy_storage_owner, name, onboarding_status,
        created_at, updated_at
      ) VALUES (?, ?, 1, ?, 'completed', ?, ?)`,
    )
    .run("learner-a", "user-1", "Mia", timestamp, timestamp);
  state.sqlite
    .prepare(
      `INSERT INTO session_learner_selection (
        session_id, auth_user_id, learner_profile_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)`,
    )
    .run("session-1", "user-1", "learner-a", timestamp, timestamp);
  const base = environment();
  return {
    state,
    env: { ...base.env, DB: state.d1 },
    getAssetCalls: base.getAssetCalls,
    database: createDatabase(state.d1),
  };
}

describe("personalized story art Worker routing", () => {
  it("rejects anonymous metadata, upload, asset, and delete requests before static assets run", async () => {
    const worker = createWorker({
      createAuth: () => authStub(null),
    });
    const { env, getAssetCalls } = environment();

    for (const [method, path] of [
      ["GET", METADATA_PATH],
      ["POST", METADATA_PATH],
      ["GET", ASSET_PATH],
      ["DELETE", METADATA_PATH],
    ]) {
      const response = await worker.fetch(
        new Request(`https://example.test${path}`, { method }),
        env,
      );

      assert.equal(response.status, 401, `${method} ${path}`);
      assert.deepEqual(await response.json(), { error: "unauthorized" });
    }

    assert.equal(getAssetCalls(), 0);
  });

  it("passes the server-resolved learner identity into personalized art handling", async () => {
    const { state, env } = authenticatedEnvironment();
    let observedIdentity = null;
    try {
      const worker = createWorker({
        createAuth: () =>
          authStub({
            session: { id: "session-1" },
            user: { id: "user-1", name: "Parent" },
          }),
        async handlePersonalizedStoryArtRequest({ identity }) {
          observedIdentity = identity;
          return new Response(null, { status: 204 });
        },
      });

      const response = await worker.fetch(
        new Request(`https://example.test${METADATA_PATH}`),
        env,
      );

      assert.equal(response.status, 204);
      assert.deepEqual(observedIdentity, {
        learnerName: "Mia",
        learnerProfileId: "learner-a",
        legacyStorageOwner: true,
        sessionId: "session-1",
        userId: "user-1",
        userName: "Parent",
      });
    } finally {
      state.close();
    }
  });

  it("rate limits authenticated uploads before any personalized-art handler work", async () => {
    let limiterCalls = 0;
    const { state, env, getAssetCalls, database } = authenticatedEnvironment();
    try {
      const worker = createWorker({
        createAuth: () =>
          authStub({
            session: { id: "session-1" },
            user: { id: "user-1", name: "Parent" },
          }),
        async checkPersonalizedStoryArtRateLimit(_request, _env, userId) {
          limiterCalls += 1;
          assert.equal(userId, "user-1");
          return Response.json({ error: "rate_limited" }, { status: 429 });
        },
      });
      const uploadRequest = () => {
        const formData = new FormData();
        formData.set(
          "source",
          new File([new Uint8Array([137, 80, 78, 71])], "source.png", {
            type: "image/png",
          }),
        );
        formData.set("guardianConsentVersion", "guardian-photo-cloudflare-v1");
        formData.set("guardianConsentAccepted", "yes");
        return new Request(`https://example.test${METADATA_PATH}`, {
          method: "POST",
          body: formData,
        });
      };

      const locked = await worker.fetch(uploadRequest(), env);
      assert.equal(locked.status, 403);
      assert.deepEqual(await locked.json(), { error: "guardian_required" });
      assert.equal(limiterCalls, 0);

      await createGuardianAccessRepository(database).unlock("session-1");
      const response = await worker.fetch(uploadRequest(), env);

      assert.equal(response.status, 429);
      assert.deepEqual(await response.json(), { error: "rate_limited" });
      assert.equal(limiterCalls, 1);
      assert.equal(getAssetCalls(), 0);
    } finally {
      state.close();
    }
  });

  it("treats malformed encoded story ids as not found instead of crashing", async () => {
    const { state, env, getAssetCalls } = authenticatedEnvironment();
    try {
      const worker = createWorker({
        createAuth: () =>
          authStub({
            session: { id: "session-1" },
            user: { id: "user-1", name: "Parent" },
          }),
      });

      const response = await worker.fetch(
        new Request("https://example.test/api/stories/%E0%A4%A/personalized-art"),
        env,
      );

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "not_found" });
      assert.equal(getAssetCalls(), 0);
    } finally {
      state.close();
    }
  });
});
