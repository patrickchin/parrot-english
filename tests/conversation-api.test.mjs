import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ConversationApiError,
  finalizeConversation,
  finishConversation,
  loadConversation,
  startConversation,
} from "../src/conversation/conversation-api.ts";

function createJsonFetch(payload = { ok: true }, status = 200) {
  const calls = [];
  return {
    calls,
    async fetch(...args) {
      calls.push(args);
      return Response.json(payload, { status });
    },
  };
}

describe("conversation browser API", () => {
  it("uses exact same-origin routes for start, load, finish, and finalization", async () => {
    const fake = createJsonFetch();

    await startConversation(
      { promptStyle: "gentle-guide", purpose: "small-chat" },
      { fetch: fake.fetch },
    );
    await loadConversation("conversation-1", { fetch: fake.fetch });
    await finishConversation("conversation-1", "finished_by_learner", {
      fetch: fake.fetch,
    });
    await finalizeConversation("conversation-1", { fetch: fake.fetch });

    assert.deepEqual(
      fake.calls.map(([path, init]) => [path, init.method]),
      [
        ["/api/conversations", "POST"],
        ["/api/conversations/conversation-1", "GET"],
        ["/api/conversations/conversation-1/finish", "POST"],
        ["/api/conversations/conversation-1/review", "PUT"],
      ],
    );
    assert.deepEqual(JSON.parse(fake.calls[2][1].body), {
      reason: "finished_by_learner",
    });
    assert.deepEqual(JSON.parse(fake.calls[0][1].body), {
      promptStyle: "gentle-guide",
      purpose: "small-chat",
    });
    assert.deepEqual(JSON.parse(fake.calls[3][1].body), {});
  });

  it("forwards cancellation and safely parses failed responses", async () => {
    const controller = new AbortController();
    const fake = createJsonFetch({ error: "not_found", message: "Gone" }, 404);

    await assert.rejects(
      loadConversation("missing", {
        fetch: fake.fetch,
        signal: controller.signal,
      }),
      (error) => {
        assert.ok(error instanceof ConversationApiError);
        assert.equal(error.status, 404);
        assert.equal(error.code, "not_found");
        assert.equal(error.message, "Gone");
        return true;
      },
    );
    assert.equal(fake.calls[0][1].signal, controller.signal);

    const successful = createJsonFetch();
    await startConversation(
      { promptStyle: "gentle-guide", purpose: "small-chat" },
      { fetch: successful.fetch, signal: controller.signal },
    );
    await finishConversation("conversation-1", "finished_by_learner", {
      fetch: successful.fetch,
      signal: controller.signal,
    });
    await finalizeConversation("conversation-1", {
      fetch: successful.fetch,
      signal: controller.signal,
    });
    assert.deepEqual(
      successful.calls.map(([, init]) => init.signal),
      [controller.signal, controller.signal, controller.signal],
    );

    const invalid = {
      async fetch() {
        return new Response("not json", { status: 503 });
      },
    };
    await assert.rejects(
      startConversation({ purpose: "onboarding" }, { fetch: invalid.fetch }),
      (error) =>
        error instanceof ConversationApiError &&
        error.code === "request_failed" &&
        error.status === 503,
    );
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
      const failed = createJsonFetch({ error: "guardian_required" }, 403);
      await assert.rejects(
        startConversation(
          { promptStyle: "gentle-guide", purpose: "small-chat" },
          { fetch: failed.fetch },
        ),
        (error) => {
          order.push("error");
          assert.ok(error instanceof ConversationApiError);
          assert.equal(error.status, 403);
          assert.equal(error.code, "guardian_required");
          return true;
        },
      );
      assert.deepEqual(order, ["notification", "error"]);
    } finally {
      if (previousDocument === undefined) Reflect.deleteProperty(globalThis, "document");
      else Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: previousDocument,
      });
    }
  });
});
