import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createDatabase } from "../worker/database.ts";
import * as guardianAccess from "../worker/guardian-access.ts";
import {
  GUARDIAN_ACCESS_TTL_MS,
  createGuardianAccessRepository,
  handleGuardianAccessRequest,
  requireGuardianAccess,
} from "../worker/guardian-access.ts";
import { createWorker } from "../worker/index.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const GUARDED_REQUESTS = [
  ["GET", "/api/profile"],
  ["PUT", "/api/profile"],
  ["PUT", "/api/profile/preferences"],
  ["PUT", "/api/profile/lesson-recording-consent"],
  ["POST", "/api/lessons/my"],
  ["POST", "/api/lessons/my/generate"],
  ["DELETE", "/api/lessons/my/lesson-1"],
  ["POST", "/api/stories/the-red-ball/personalized-art"],
  ["DELETE", "/api/stories/the-red-ball/personalized-art"],
  ["PUT", "/api/dubs/five-little-ducks-v2/consent"],
  ["DELETE", "/api/dubs/five-little-ducks-v2"],
];

const LEARNER_SAFE_REQUESTS = [
  ["GET", "/api/learner-profile"],
  ["GET", "/api/lesson-recordings/consent"],
  ["GET", "/api/lessons/my"],
  ["GET", "/api/lessons/my/lesson-1"],
  ["PUT", "/api/lessons/my/lesson-1"],
  ["GET", "/api/stories/the-red-ball/personalized-art"],
  ["GET", "/api/stories/the-red-ball/personalized-art/asset"],
  ["GET", "/api/dubs/five-little-ducks-v2"],
  ["PUT", "/api/dubs/five-little-ducks-v2/lines/line-1"],
  ["GET", "/api/dubs/five-little-ducks-v2/lines/line-1/audio"],
  ["PUT", "/api/dubs/five-little-ducks-v1/consent"],
  ["DELETE", "/api/dubs/five-little-ducks-v1"],
];

const TARGETABLE_LEARNER_REQUESTS = [
  ["GET", "/api/learner-profile"],
  ["GET", "/api/profile/preferences"],
  ["GET", "/api/lesson-recordings/consent"],
  ["GET", "/api/lessons/my"],
  ["GET", "/api/stories/the-red-ball/personalized-art"],
  ["GET", "/api/stories/the-red-ball/personalized-art/asset"],
  ["GET", "/api/dubs/five-little-ducks-v2"],
  ["GET", "/api/dubs/five-little-ducks-v2/lines/line-1/audio"],
];

function insertIdentity(sqlite, sessionId, userId = `user-for-${sessionId}`) {
  const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
  sqlite.prepare(
    `INSERT INTO user
      (id, name, email, email_verified, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ).run(userId, "Guardian", `${userId}@example.test`, timestamp, timestamp);
  sqlite.prepare(
    `INSERT INTO session
      (id, expires_at, token, created_at, updated_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    sessionId,
    timestamp + 86_400_000,
    `token-for-${sessionId}`,
    timestamp,
    timestamp,
    userId,
  );
}

function insertLearner(
  sqlite,
  learnerProfileId,
  userId,
  { legacyStorageOwner = false, name = "Leo" } = {},
) {
  const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
  sqlite
    .prepare(
      `INSERT INTO learner_profile
        (id, auth_user_id, legacy_storage_owner, name, onboarding_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'not_started', ?, ?)`,
    )
    .run(
      learnerProfileId,
      userId,
      legacyStorageOwner ? 1 : 0,
      name,
      timestamp,
      timestamp,
    );
}

function insertSelection(sqlite, sessionId, userId, learnerProfileId) {
  const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
  sqlite
    .prepare(
      `INSERT INTO session_learner_selection
        (session_id, auth_user_id, learner_profile_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(sessionId, userId, learnerProfileId, timestamp, timestamp);
}

function guardianRequest(method = "GET", body) {
  return new Request("https://example.test/api/guardian-access", {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body,
        }),
  });
}

describe("guardian access repository", () => {
  let state;
  let database;

  beforeEach(() => {
    state = createTestD1Database();
    insertIdentity(state.sqlite, "session-1", "user-1");
    insertIdentity(state.sqlite, "session-2", "user-2");
    database = createDatabase(state.d1);
  });

  afterEach(() => state.close());

  it("expires guardian access at exactly fifteen minutes", async () => {
    const now = new Date("2026-08-25T08:00:00.000Z");
    const repository = createGuardianAccessRepository(database, {
      now: () => now,
    });

    assert.deepEqual(await repository.unlock("session-1"), {
      mode: "guardian",
      expiresAt: "2026-08-25T08:15:00.000Z",
    });

    now.setMilliseconds(now.getMilliseconds() + GUARDIAN_ACCESS_TTL_MS);
    assert.deepEqual(await repository.status("session-1"), {
      mode: "learner",
    });
    assert.equal(
      state.sqlite
        .prepare("SELECT COUNT(*) AS count FROM guardian_session_unlock")
        .get().count,
      0,
    );
  });

  it("isolates unlock and lock state by session", async () => {
    const repository = createGuardianAccessRepository(database);

    await repository.unlock("session-1");
    assert.equal((await repository.status("session-2")).mode, "learner");
    await repository.lock("session-1");
    assert.equal((await repository.status("session-1")).mode, "learner");
  });

  it("lazily deletes expired rows when access is required", async () => {
    const now = new Date("2026-08-25T08:00:00.000Z");
    const repository = createGuardianAccessRepository(database, {
      now: () => now,
    });
    await repository.unlock("session-1");

    now.setMilliseconds(now.getMilliseconds() + GUARDIAN_ACCESS_TTL_MS);
    assert.equal(await repository.require("session-1"), false);
    assert.equal(
      state.sqlite
        .prepare("SELECT COUNT(*) AS count FROM guardian_session_unlock")
        .get().count,
      0,
    );
  });

  it("returns a no-store guardian-required response from the central guard", async () => {
    const denied = await requireGuardianAccess({
      database,
      sessionId: "session-1",
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await denied.json(), { error: "guardian_required" });
  });
});

describe("guardian management authorization", () => {
  it("classifies only the management method and path combinations", () => {
    assert.equal(typeof guardianAccess.requiresGuardianAccess, "function");
    const requiresGuardianAccess = guardianAccess.requiresGuardianAccess;

    for (const [method, path] of GUARDED_REQUESTS) {
      assert.equal(requiresGuardianAccess(path, method), true, `${method} ${path}`);
    }
    for (const [method, path] of LEARNER_SAFE_REQUESTS) {
      assert.equal(requiresGuardianAccess(path, method), false, `${method} ${path}`);
    }
  });

  it("blocks every locked management request before rate limits and handlers", async () => {
    const state = createTestD1Database();
    try {
      insertIdentity(state.sqlite, "session-1", "user-1");
      let handlerCalls = 0;
      let limiterCalls = 0;
      const routed = async () => {
        handlerCalls += 1;
        return Response.json({ routed: true });
      };
      const worker = createWorker({
        createAuth: () => ({
          api: {
            async getSession() {
              return {
                session: { id: "session-1" },
                user: { id: "user-1", name: "Guardian" },
              };
            },
          },
          async handler() {
            return new Response("auth");
          },
        }),
        async checkLessonGenerationRateLimit() {
          limiterCalls += 1;
          return null;
        },
        async checkLearnerProfileEnrichmentRateLimit() {
          limiterCalls += 1;
          return null;
        },
        async checkPersonalizedStoryArtRateLimit() {
          limiterCalls += 1;
          return null;
        },
        handleLearnerProfileRequest: routed,
        handleMyLessonRequest: routed,
        handlePersonalizedStoryArtRequest: routed,
        handleDubRequest: routed,
      });
      const env = {
        ASSETS: { async fetch() { return new Response("asset"); } },
        DB: state.d1,
      };

      for (const [method, path] of GUARDED_REQUESTS) {
        const response = await worker.fetch(
          new Request(`https://example.test${path}`, { method }),
          env,
        );
        assert.equal(response.status, 403, `${method} ${path}`);
        assert.deepEqual(await response.json(), { error: "guardian_required" });
      }
      assert.equal(handlerCalls, 0);
      assert.equal(limiterCalls, 0);

      await createGuardianAccessRepository(createDatabase(state.d1)).unlock(
        "session-1",
      );
      for (const [method, path] of GUARDED_REQUESTS) {
        const response = await worker.fetch(
          new Request(`https://example.test${path}`, { method }),
          env,
        );
        assert.equal(response.status, 200, `${method} ${path}`);
        assert.deepEqual(await response.json(), { routed: true });
      }
      assert.equal(handlerCalls, GUARDED_REQUESTS.length);
      assert.equal(limiterCalls, 3);
    } finally {
      state.close();
    }
  });

  it("blocks targeted learner reads while locked before validating the target", async () => {
    const state = createTestD1Database();
    try {
      insertIdentity(state.sqlite, "session-1", "user-1");
      let handlerCalls = 0;
      const routed = async () => {
        handlerCalls += 1;
        return Response.json({ routed: true });
      };
      const worker = createWorker({
        createAuth: () => ({
          api: {
            async getSession() {
              return {
                session: { id: "session-1" },
                user: { id: "user-1", name: "Guardian" },
              };
            },
          },
          async handler() {
            return new Response("auth");
          },
        }),
        handleLearnerProfileRequest: routed,
        handleMyLessonRequest: routed,
        handleLessonRecordingRequest: routed,
        handlePersonalizedStoryArtRequest: routed,
        handleDubRequest: routed,
      });
      const env = {
        ASSETS: { async fetch() { return new Response("asset"); } },
        DB: state.d1,
      };

      for (const [method, path] of [
        ...TARGETABLE_LEARNER_REQUESTS,
        ["GET", "/api/lessons/my?learnerProfileId="],
        ["GET", "/api/lessons/my?learnerProfileId=foreign"],
      ]) {
        const separator = path.includes("?") ? "&" : "?";
        const targetPath = path.includes("learnerProfileId=")
          ? path
          : `${path}${separator}learnerProfileId=learner-b`;
        const response = await worker.fetch(
          new Request(`https://example.test${targetPath}`, { method }),
          env,
        );
        assert.equal(response.status, 403, `${method} ${targetPath}`);
        assert.deepEqual(await response.json(), { error: "guardian_required" });
      }
      assert.equal(handlerCalls, 0);
    } finally {
      state.close();
    }
  });

  it("routes every targeted learner request with the owned identity without changing selection", async () => {
    const state = createTestD1Database();
    try {
      insertIdentity(state.sqlite, "session-1", "user-1");
      insertLearner(state.sqlite, "learner-a", "user-1", {
        legacyStorageOwner: true,
        name: "Mia",
      });
      insertLearner(state.sqlite, "learner-b", "user-1");
      insertSelection(state.sqlite, "session-1", "user-1", "learner-a");
      const calls = [];
      const routed = async (input) => {
        calls.push(input);
        return Response.json({ routed: true });
      };
      const worker = createWorker({
        createAuth: () => ({
          api: {
            async getSession() {
              return {
                session: { id: "session-1" },
                user: { id: "user-1", name: "Guardian" },
              };
            },
          },
          async handler() {
            return new Response("auth");
          },
        }),
        handleLearnerProfileRequest: routed,
        handleMyLessonRequest: routed,
        handleLessonRecordingRequest: routed,
        handlePersonalizedStoryArtRequest: routed,
        handleDubRequest: routed,
      });
      const env = {
        ASSETS: { async fetch() { return new Response("asset"); } },
        DB: state.d1,
      };
      await createGuardianAccessRepository(createDatabase(state.d1)).unlock(
        "session-1",
      );

      for (const [method, path] of TARGETABLE_LEARNER_REQUESTS) {
        const response = await worker.fetch(
          new Request(
            `https://example.test${path}?learnerProfileId=learner-b`,
            { method },
          ),
          env,
        );
        assert.equal(response.status, 200, `${method} ${path}`);
      }
      assert.equal(calls.length, TARGETABLE_LEARNER_REQUESTS.length);
      for (const call of calls) {
        assert.deepEqual(call.identity, {
          sessionId: "session-1",
          userId: "user-1",
          userName: "Guardian",
          learnerProfileId: "learner-b",
          learnerName: "Leo",
          legacyStorageOwner: false,
        });
      }
      assert.equal(
        state.sqlite
          .prepare(
            `SELECT learner_profile_id FROM session_learner_selection
             WHERE session_id = 'session-1'`,
          )
          .get().learner_profile_id,
        "learner-a",
      );
    } finally {
      state.close();
    }
  });

  it("returns the same no-store 404 for invalid and unowned targets", async () => {
    const state = createTestD1Database();
    try {
      insertIdentity(state.sqlite, "session-1", "user-1");
      insertIdentity(state.sqlite, "session-2", "user-2");
      insertLearner(state.sqlite, "foreign", "user-2");
      let handlerCalls = 0;
      const worker = createWorker({
        createAuth: () => ({
          api: {
            async getSession() {
              return {
                session: { id: "session-1" },
                user: { id: "user-1", name: "Guardian" },
              };
            },
          },
          async handler() {
            return new Response("auth");
          },
        }),
        async handleMyLessonRequest() {
          handlerCalls += 1;
          return Response.json({ routed: true });
        },
      });
      const env = {
        ASSETS: { async fetch() { return new Response("asset"); } },
        DB: state.d1,
      };
      await createGuardianAccessRepository(createDatabase(state.d1)).unlock(
        "session-1",
      );

      for (const query of [
        "learnerProfileId=missing",
        "learnerProfileId=foreign",
        "learnerProfileId=",
        "learnerProfileId=%20%20",
        "learnerProfileId=one&learnerProfileId=two",
        `learnerProfileId=${"p".repeat(129)}`,
      ]) {
        const response = await worker.fetch(
          new Request(`https://example.test/api/lessons/my?${query}`),
          env,
        );
        assert.equal(response.status, 404, query);
        assert.equal(response.headers.get("Cache-Control"), "no-store", query);
        assert.deepEqual(await response.json(), { error: "not_found" }, query);
      }
      assert.equal(handlerCalls, 0);
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM session_learner_selection")
          .get().count,
        0,
      );
    } finally {
      state.close();
    }
  });
});

describe("guardian access request handler", () => {
  let state;
  let database;

  beforeEach(() => {
    state = createTestD1Database();
    insertIdentity(state.sqlite, "session-1", "user-1");
    database = createDatabase(state.d1);
  });

  afterEach(() => state.close());

  function handle(request, verifyPassword = async () => true) {
    return handleGuardianAccessRequest({
      database,
      identity: { sessionId: "session-1", userId: "user-1" },
      request,
      verifyPassword,
    });
  }

  it("unlocks only after server-side password verification", async () => {
    const passwords = [];
    const response = await handle(
      guardianRequest("POST", JSON.stringify({ password: "guardian-secret" })),
      async (password) => (passwords.push(password), true),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(passwords, ["guardian-secret"]);
    assert.equal((await response.json()).mode, "guardian");
  });

  it("rejects an empty password without creating a Guardian unlock", async () => {
    let verificationCalls = 0;
    const response = await handle(
      guardianRequest("POST", JSON.stringify({ password: "" })),
      async () => {
        verificationCalls += 1;
        return false;
      },
    );

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), {
      error: "invalid_password",
      message: "The password did not match this account.",
    });
    assert.equal(verificationCalls, 1);
    assert.equal(
      state.sqlite
        .prepare("SELECT COUNT(*) AS count FROM guardian_session_unlock")
        .get().count,
      0,
    );
  });

  it("uses one generic response for an invalid password", async () => {
    const response = await handle(
      guardianRequest("POST", JSON.stringify({ password: "wrong" })),
      async () => false,
    );

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), {
      error: "invalid_password",
      message: "The password did not match this account.",
    });
    assert.equal(
      state.sqlite
        .prepare("SELECT COUNT(*) AS count FROM guardian_session_unlock")
        .get().count,
      0,
    );
  });

  it("accepts exactly one string password key", async () => {
    const rejectedBodies = [
      "{}",
      JSON.stringify({ password: 42 }),
      JSON.stringify({ password: "secret", userId: "user-2" }),
      "[]",
      "not-json",
    ];
    let verificationCalls = 0;

    for (const body of rejectedBodies) {
      const response = await handle(guardianRequest("POST", body), async () => {
        verificationCalls += 1;
        return true;
      });
      assert.equal(response.status, 400, body);
    }
    assert.equal(verificationCalls, 0);
  });

  it("enforces an 8 KiB request-body ceiling", async () => {
    const prefixBytes = new globalThis.TextEncoder().encode(
      '{"password":"',
    ).byteLength;
    const suffixBytes = new globalThis.TextEncoder().encode('"}').byteLength;
    const acceptedPassword = "a".repeat(8 * 1024 - prefixBytes - suffixBytes);
    const accepted = await handle(
      guardianRequest("POST", JSON.stringify({ password: acceptedPassword })),
    );
    assert.equal(accepted.status, 200);

    let verificationCalls = 0;
    const oversized = await handle(
      guardianRequest("POST", JSON.stringify({ password: `${acceptedPassword}a` })),
      async () => {
        verificationCalls += 1;
        return true;
      },
    );
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { error: "payload_too_large" });
    assert.equal(verificationCalls, 0);
  });

  it("returns no-store status and lock responses", async () => {
    const initial = await handle(guardianRequest());
    assert.equal(initial.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await initial.json(), { mode: "learner" });

    await handle(
      guardianRequest("POST", JSON.stringify({ password: "guardian-secret" })),
    );
    const locked = await handle(guardianRequest("DELETE"));
    assert.equal(locked.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await locked.json(), { mode: "learner" });
    assert.deepEqual(await handle(guardianRequest()).then((response) => response.json()), {
      mode: "learner",
    });
  });
});
