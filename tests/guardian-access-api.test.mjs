import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GuardianAccessApiError,
  loadGuardianAccess,
  lockGuardianAccess,
  unlockGuardianAccess,
} from "../src/auth/guardian-access-api.ts";

function createFetchRecorder(payload, status = 200) {
  const calls = [];
  return {
    calls,
    async fetch(path, init = {}) {
      calls.push({ body: init.body, cache: init.cache, method: init.method, path });
      return Response.json(payload, { status });
    },
  };
}

describe("guardian access browser API", () => {
  it("switches guardian mode without sending a password", async () => {
    const request = createFetchRecorder({
      mode: "guardian",
      expiresAt: "2026-08-25T08:15:00.000Z",
    });
    const lockRequest = createFetchRecorder({ mode: "learner" });

    await loadGuardianAccess({ fetch: request.fetch });
    await unlockGuardianAccess(undefined, { fetch: request.fetch });
    await lockGuardianAccess({ fetch: lockRequest.fetch });

    assert.deepEqual(
      [...request.calls, ...lockRequest.calls].map(({ path, method }) => [
        method,
        path,
      ]),
      [
        ["GET", "/api/guardian-access"],
        ["POST", "/api/guardian-access"],
        ["DELETE", "/api/guardian-access"],
      ],
    );
    assert.equal(request.calls[1].body, undefined);
    assert.deepEqual([...request.calls, ...lockRequest.calls].map(({ cache }) => cache), [
      "no-store",
      "no-store",
      "no-store",
    ]);
  });

  it("preserves typed server diagnostics with a safe message", async () => {
    const request = createFetchRecorder(
      {
        error: "switch_failed",
        message: "Guardian mode could not be opened.",
      },
      401,
    );

    await assert.rejects(
      unlockGuardianAccess(undefined, { fetch: request.fetch }),
      (error) => {
        assert.ok(error instanceof GuardianAccessApiError);
        assert.equal(error.status, 401);
        assert.equal(error.code, "switch_failed");
        assert.equal(error.message, "Guardian mode could not be opened.");
        return true;
      },
    );
  });

  it("maps malformed JSON and invalid access states to one retryable error", async () => {
    const invalidResponses = [
      async () => new Response("not json", { status: 200 }),
      createFetchRecorder({ mode: "guardian" }).fetch,
      createFetchRecorder({ mode: "guardian", expiresAt: "not-a-date" }).fetch,
      createFetchRecorder({ mode: "unknown" }).fetch,
    ];

    for (const fetch of invalidResponses) {
      await assert.rejects(loadGuardianAccess({ fetch }), (error) => {
        assert.ok(error instanceof GuardianAccessApiError);
        assert.equal(error.status, 200);
        assert.equal(error.code, "invalid_response");
        assert.equal(error.message, "Guardian access could not be checked. Please try again.");
        return true;
      });
    }
  });

  it("fails closed when a lock response claims guardian mode", async () => {
    await assert.rejects(
      lockGuardianAccess({
        fetch: createFetchRecorder({
          mode: "guardian",
          expiresAt: "2026-08-25T08:15:00.000Z",
        }).fetch,
      }),
      (error) => {
        assert.ok(error instanceof GuardianAccessApiError);
        assert.equal(error.status, 200);
        assert.equal(error.code, "invalid_response");
        assert.equal(
          error.message,
          "Guardian access could not be checked. Please try again.",
        );
        return true;
      },
    );
  });
});
