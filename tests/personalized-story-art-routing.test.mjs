import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorker } from "../worker/index.ts";

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

  it("rate limits authenticated uploads before any personalized-art handler work", async () => {
    let limiterCalls = 0;
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
    const { env, getAssetCalls } = environment();
    const formData = new FormData();
    formData.set(
      "source",
      new File([new Uint8Array([137, 80, 78, 71])], "source.png", {
        type: "image/png",
      }),
    );
    formData.set("guardianConsentVersion", "2026-08-09");
    formData.set("guardianConsentAccepted", "yes");

    const response = await worker.fetch(
      new Request(`https://example.test${METADATA_PATH}`, {
        method: "POST",
        body: formData,
      }),
      env,
    );

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: "rate_limited" });
    assert.equal(limiterCalls, 1);
    assert.equal(getAssetCalls(), 0);
  });

  it("treats malformed encoded story ids as not found instead of crashing", async () => {
    const worker = createWorker({
      createAuth: () =>
        authStub({
          session: { id: "session-1" },
          user: { id: "user-1", name: "Parent" },
        }),
    });
    const { env, getAssetCalls } = environment();

    const response = await worker.fetch(
      new Request("https://example.test/api/stories/%E0%A4%A/personalized-art"),
      env,
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
    assert.equal(getAssetCalls(), 0);
  });
});
