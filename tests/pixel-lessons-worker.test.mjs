import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDatabase } from "../worker/database.ts";
import { handlePixelLessonRequest } from "../worker/pixel-lessons.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

function lesson(learnerName = "Mia") {
  return {
    schemaVersion: 1,
    title: "Garden Greetings",
    learnerName,
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
    completion: "Garden lesson complete!",
  };
}

function seedDatabase({ withName = true } = {}) {
  const state = createTestD1Database();
  state.sqlite
    .prepare(
      "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    )
    .run("user-1", "Parent", "parent@example.test", 1_000, 1_000);
  if (withName) {
    state.sqlite
      .prepare(
        "INSERT INTO learner_profile (id, auth_user_id, name, onboarding_status, created_at, updated_at) VALUES (?, ?, ?, 'completed', ?, ?)",
      )
      .run("profile-1", "user-1", "Mia", 1_000, 1_000);
  }
  return { ...state, database: createDatabase(state.d1) };
}

function request(body, headers = {}) {
  return new Request("https://example.test/api/pixel-lessons/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function call(state, body, generatePixelLesson, headers) {
  return handlePixelLessonRequest(
    {
      database: state.database,
      env: { DB: state.d1, OPENAI_API_KEY: "test-key" },
      identity: {
        sessionId: "session-1",
        userId: "user-1",
        userName: "Parent",
      },
      request: request(body, headers),
    },
    { generatePixelLesson },
  );
}

describe("pixel lesson preview API", () => {
  it("uses the canonical D1 learner name and does not persist the preview", async () => {
    const state = seedDatabase();
    const calls = [];
    try {
      const response = await call(
        state,
        { topic: "  garden greetings  " },
        async (input) => {
          calls.push(input);
          return {
            lesson: lesson("Invented Model Name"),
            warnings: ["Generator warning"],
          };
        },
      );

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.lesson.learnerName, "Mia");
      assert.equal(payload.warnings[0], "Generator warning");
      assert.ok(
        payload.warnings.some((warning) => /learnerName was overridden/i.test(warning)),
      );
      assert.equal(calls[0].learnerName, "Mia");
      assert.equal(calls[0].topic, "garden greetings");
      assert.equal(
        state.sqlite.prepare("SELECT count(*) AS count FROM learner_lesson").get()
          .count,
        0,
      );
    } finally {
      state.close();
    }
  });

  it("rejects missing, blank, and overlong topics before generation", async () => {
    const state = seedDatabase();
    let calls = 0;
    try {
      for (const body of [{}, { topic: "   " }, { topic: "x".repeat(501) }]) {
        const response = await call(state, body, async () => {
          calls += 1;
          return { lesson: lesson(), warnings: [] };
        });
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error, "invalid_topic");
      }
      assert.equal(calls, 0);
    } finally {
      state.close();
    }
  });

  it("requires a canonical profile name instead of using the account name", async () => {
    const state = seedDatabase({ withName: false });
    try {
      const response = await call(state, { topic: "greetings" }, async () => ({
        lesson: lesson("Parent"),
        warnings: [],
      }));
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, "learner_name_required");
    } finally {
      state.close();
    }
  });

  it("bounds JSON request bodies at 256KB", async () => {
    const state = seedDatabase();
    try {
      const oversized = JSON.stringify({ topic: "x".repeat(256 * 1024) });
      const response = await call(
        state,
        oversized,
        async () => ({ lesson: lesson(), warnings: [] }),
        { "Content-Length": String(oversized.length) },
      );
      assert.equal(response.status, 413);
      assert.deepEqual(await response.json(), { error: "payload_too_large" });
    } finally {
      state.close();
    }
  });
});
