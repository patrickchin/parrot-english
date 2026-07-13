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
        tag: "api1234",
        timestamp: "2026-07-14T01:02:03.000Z",
      },
      CONVERSATION_AGENT_SECRET: "agent-secret",
      DB: state.d1,
      PARROT_BACKEND_COMMIT_SHA: "api1234",
      PARROT_BACKEND_VERSION: "0.1.276",
    },
  };
}

describe("deployment build information", () => {
  it("reports the Worker deployment and the last agent build", async () => {
    const { env, state } = buildEnvironment();
    state.sqlite.exec(
      `INSERT INTO deployment_component
        (component, version, commit_sha, details_json, reported_at)
       VALUES
        ('conversation-agent', '0.1.275', 'agent12',
         '{"models":{"llm":"openai/gpt-4.1-mini","stt":"elevenlabs/scribe_v2_realtime","tts":"inworld/inworld-tts-2"}}',
         1783991045000)`,
    );
    const worker = createWorker();

    const response = await worker.fetch(
      new Request("https://example.test/api/build-info"),
      env,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      backend: {
        commitSha: "api1234",
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
              llm: "openai/gpt-4.1-mini",
              stt: "elevenlabs/scribe_v2_realtime",
              tts: "inworld/inworld-tts-2",
            },
          },
          reportedAt: "2026-07-14T01:04:05.000Z",
          version: "0.1.275",
        },
      ],
    });
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  });

  it("accepts bounded agent build reports with service authentication", async () => {
    const { env, state } = buildEnvironment();
    const worker = createWorker();
    const response = await worker.fetch(
      new Request("https://example.test/api/build-info/components/conversation-agent", {
        body: JSON.stringify({
          commitSha: "agent99",
          details: {
            models: {
              llm: "openai/gpt-4.1-mini",
              stt: "elevenlabs/scribe_v2_realtime",
              tts: "inworld/inworld-tts-2",
            },
          },
          version: "0.1.279",
        }),
        headers: {
          Authorization: "Bearer agent-secret",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
      env,
    );

    assert.equal(response.status, 204);
    assert.deepEqual(
      state.sqlite
        .prepare(
          "SELECT component, version, commit_sha, details_json FROM deployment_component",
        )
        .get(),
      {
        commit_sha: "agent99",
        component: "conversation-agent",
        details_json:
          '{"models":{"llm":"openai/gpt-4.1-mini","stt":"elevenlabs/scribe_v2_realtime","tts":"inworld/inworld-tts-2"}}',
        version: "0.1.279",
      },
    );
  });

  it("rejects unauthenticated component reports", async () => {
    const { env } = buildEnvironment();
    const worker = createWorker();
    const response = await worker.fetch(
      new Request("https://example.test/api/build-info/components/conversation-agent", {
        body: "{}",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      env,
    );

    assert.equal(response.status, 401);
  });
});
