import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorker } from "../worker/index.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

function buildEnvironment() {
  const state = createTestD1Database();
  return {
    state,
    env: {
      ASSETS: { fetch: async () => new Response("asset") },
      CF_VERSION_METADATA: {
        id: "worker-deployment-123",
        tag: "v0.1.276-abc1234",
        timestamp: "2026-07-14T01:02:03.000Z",
      },
      DB: state.d1,
      PARROT_BACKEND_COMMIT_SHA: "local",
      PARROT_BACKEND_VERSION: "local",
    },
  };
}

describe("deployment build information", () => {
  it("reports the Worker deployment and the last agent build", async () => {
    const { env, state } = buildEnvironment();
    state.sqlite.exec(
      `INSERT INTO user (id, name, email)
       VALUES ('user-1', 'Mia', 'mia@example.test');
       INSERT INTO conversation_session
        (id, auth_user_id, scenario_key, scenario_version, room_name, status, controller_state)
       VALUES
        ('conversation-1', 'user-1', 'small-chat', 1, 'room-1', 'active',
         '{"_buildInfo":{"agent":{"commitSha":"agent12","details":{"models":{"realtime":"gpt-realtime-2.1-mini","transcription":"gpt-4o-mini-transcribe"}},"reportedAt":"2026-07-14T01:04:05.000Z","version":"0.1.275"}}}')`,
    );
    const worker = createWorker();

    const response = await worker.fetch(
      new Request("https://example.test/api/build-info"),
      env,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      backend: {
        commitSha: "abc1234",
        details: {
          models: {
            lessonScript: "openai/gpt-oss-20b",
          },
        },
        deploymentId: "worker-deployment-123",
        deployedAt: "2026-07-14T01:02:03.000Z",
        version: "0.1.276",
      },
      components: [
        {
          commitSha: "agent12",
          component: "conversation-agent",
          details: {
            models: {
              realtime: "gpt-realtime-2.1-mini",
              transcription: "gpt-4o-mini-transcribe",
            },
          },
          reportedAt: "2026-07-14T01:04:05.000Z",
          version: "0.1.275",
        },
      ],
    });
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  });

  it("returns no agent component before one has reported", async () => {
    const { env } = buildEnvironment();
    const worker = createWorker();
    const response = await worker.fetch(
      new Request("https://example.test/api/build-info"),
      env,
    );

    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).components, []);
  });

  it("keeps build information read-only", async () => {
    const { env } = buildEnvironment();
    const worker = createWorker();
    const response = await worker.fetch(
      new Request("https://example.test/api/build-info", { method: "POST" }),
      env,
    );

    assert.equal(response.status, 405);
  });
});
