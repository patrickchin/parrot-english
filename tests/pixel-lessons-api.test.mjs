import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generatePixelLesson,
  PixelLessonsApiError,
} from "../src/games/pixel-lessons-api.ts";

function jsonFetch(payload, status = 200) {
  const calls = [];
  return {
    calls,
    async fetch(...args) {
      calls.push(args);
      return Response.json(payload, { status });
    },
  };
}

describe("pixel lessons browser API", () => {
  it("generates a typed preview with a same-origin JSON request", async () => {
    const payload = {
      lesson: {
        schemaVersion: 1,
        title: "Garden Greetings",
        learnerName: "Mia",
        summary: "Practise a greeting.",
        worldId: "lesson-garden",
        intro: "Find the tree.",
        missions: [
          {
            targetId: "lesson-tree",
            instruction: "Walk to the tree.",
            phrase: "Hello, tree!",
            success: "Great greeting!",
            emote: "happy",
          },
        ],
        completion: "Complete!",
      },
      warnings: ["Draft warning"],
    };
    const request = jsonFetch(payload);

    assert.deepEqual(
      await generatePixelLesson("garden greetings", { fetch: request.fetch }),
      payload,
    );
    assert.equal(request.calls[0][0], "/api/pixel-lessons/generate");
    assert.deepEqual(request.calls[0][1], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"topic":"garden greetings"}',
      signal: undefined,
    });
  });

  it("exposes safe structured API errors", async () => {
    const failed = jsonFetch(
      { error: "invalid_topic", message: "Please describe a topic." },
      400,
    );
    await assert.rejects(
      generatePixelLesson("", { fetch: failed.fetch }),
      (error) => {
        assert.ok(error instanceof PixelLessonsApiError);
        assert.equal(error.status, 400);
        assert.equal(error.code, "invalid_topic");
        assert.equal(error.message, "Please describe a topic.");
        return true;
      },
    );
  });

  it("does not expose a malformed error body", async () => {
    const calls = [];
    await assert.rejects(
      generatePixelLesson("greetings", {
        async fetch(...args) {
          calls.push(args);
          return new Response("upstream internals", { status: 502 });
        },
      }),
      (error) => {
        assert.ok(error instanceof PixelLessonsApiError);
        assert.equal(error.code, "request_failed");
        assert.equal(
          error.message,
          "The pixel lesson request could not be completed.",
        );
        return true;
      },
    );
    assert.equal(calls.length, 1);
  });

  it("rejects malformed successful JSON instead of trusting its type", async () => {
    const malformed = jsonFetch({ lesson: { title: "No missions" } });
    await assert.rejects(
      generatePixelLesson("greetings", { fetch: malformed.fetch }),
      (error) => {
        assert.ok(error instanceof PixelLessonsApiError);
        assert.equal(error.status, 502);
        assert.equal(error.code, "invalid_response");
        assert.equal(
          error.message,
          "The pixel lesson service returned an invalid response.",
        );
        return true;
      },
    );
  });

  it("replaces network internals with a safe typed error", async () => {
    await assert.rejects(
      generatePixelLesson("greetings", {
        async fetch() {
          throw new Error("private connection detail");
        },
      }),
      (error) => {
        assert.ok(error instanceof PixelLessonsApiError);
        assert.equal(error.status, 0);
        assert.equal(error.code, "network_error");
        assert.equal(
          error.message,
          "The pixel lesson request could not be completed.",
        );
        return true;
      },
    );
  });
});
