import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { DUB_DEFINITIONS } from "../src/dubbing/rhyme-catalog.ts";
import { prepareAccountDeletion } from "../worker/account-deletion.ts";
import { createConversationRepository } from "../worker/conversation-repository.ts";
import { createDatabase } from "../worker/database.ts";
import { createDubStorageKeys } from "../worker/dub-storage.ts";
import { handleDubRequest } from "../worker/dubs.ts";
import { createGuardianAccessRepository } from "../worker/guardian-access.ts";
import { createWorker } from "../worker/index.ts";
import { prepareLearnerDeletion } from "../worker/learner-deletion.ts";
import { handleLessonRecordingRequest } from "../worker/lesson-recordings.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const TARGET_ID = "learner-a";
const SIBLING_ID = "learner-b";
const SESSION_ID = "session-1";
const OTHER_SESSION_ID = "session-2";
const NOW = Date.parse("2026-08-29T08:00:00.000Z");
const USER_EMAIL = "guardian@example.test";
const USER_PREFIX = `accounts/${USER_EMAIL}/`;
const TARGET_PREFIX = `${USER_PREFIX}learners/Mary/`;
const SIBLING_PREFIX = `${USER_PREFIX}learners/Bob/`;
const LESSON_RECORDING_CONSENT_VERSION = "lesson-join-in-recording-v1";
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1]);

const accountIdentity = {
  sessionId: SESSION_ID,
  userEmail: USER_EMAIL,
  userId: USER_ID,
  userName: "Guardian",
};

function learnerIdentity() {
  return {
    ...accountIdentity,
    learnerName: "Mary",
    learnerProfileId: TARGET_ID,
    legacyStorageOwner: false,
    privateMediaName: "Mary",
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function bytes(value) {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return new Uint8Array(value ?? []);
}

function createBucket(seed = []) {
  let version = 0;
  const stored = new Map();
  const calls = { delete: [], head: [], list: [], put: [] };
  const bucket = {
    beforeDelete: null,
    beforeList: null,
    beforePut: null,
    calls,
    deleteFailures: 0,
    putFailures: 0,
    stored,
    async delete(keys) {
      const deleting = Array.isArray(keys) ? [...keys] : [keys];
      calls.delete.push(deleting);
      await bucket.beforeDelete?.(deleting);
      if (bucket.deleteFailures > 0) {
        bucket.deleteFailures -= 1;
        throw new Error("R2 write rate limited (10058)");
      }
      for (const key of deleting) stored.delete(key);
    },
    async get(key, options = {}) {
      const item = stored.get(key);
      if (!item) return null;
      if (options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== item.object.etag) {
        return null;
      }
      const body = item.bytes;
      return {
        ...item.object,
        body: new Response(body).body,
        async arrayBuffer() {
          return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
        },
        async bytes() {
          return new Uint8Array(body);
        },
      };
    },
    async head(key) {
      calls.head.push(key);
      return stored.get(key)?.object ?? null;
    },
    async list(options = {}) {
      calls.list.push(options);
      await bucket.beforeList?.(options);
      return {
        objects: [...stored.entries()]
          .filter(([key]) => key.startsWith(options.prefix ?? ""))
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([, item]) => item.object),
        truncated: false,
      };
    },
    async put(key, value, options = {}) {
      const body = bytes(value);
      await bucket.beforePut?.({ body, key, options });
      if (bucket.putFailures > 0) {
        bucket.putFailures -= 1;
        throw new Error("R2 write rate limited (10058)");
      }
      const current = stored.get(key);
      if (
        options.onlyIf?.etagMatches !== undefined &&
        current?.object.etag !== options.onlyIf.etagMatches
      ) {
        calls.put.push({ key, options, stored: false });
        return null;
      }
      if (options.onlyIf?.etagDoesNotMatch === "*" && current !== undefined) {
        calls.put.push({ key, options, stored: false });
        return null;
      }
      const etag = createHash("md5").update(body).digest("hex");
      const object = {
        customMetadata: options.customMetadata ?? {},
        etag,
        key,
        size: body.byteLength,
        uploaded: new Date(NOW),
        version: `version-${++version}`,
        writeHttpMetadata(headers) {
          const contentType = options.httpMetadata?.contentType;
          if (contentType) headers.set("Content-Type", contentType);
        },
      };
      stored.set(key, { bytes: body, object, options });
      calls.put.push({ key, options, stored: true });
      return object;
    },
  };
  for (const item of seed) {
    const body = bytes(item.bytes);
    const options = {
      customMetadata: item.customMetadata ?? {},
      httpMetadata: item.httpMetadata,
    };
    const etag = item.etag ?? createHash("md5").update(body).digest("hex");
    stored.set(item.key, {
      bytes: body,
      object: {
        customMetadata: options.customMetadata,
        etag,
        key: item.key,
        size: body.byteLength,
        uploaded: new Date(NOW),
        version: item.version ?? `seed-${++version}`,
        writeHttpMetadata(headers) {
          const contentType = options.httpMetadata?.contentType;
          if (contentType) headers.set("Content-Type", contentType);
        },
      },
      options,
    });
  }
  return bucket;
}

function seedDatabase() {
  const state = createTestD1Database();
  const insertUser = state.sqlite.prepare(
    `INSERT INTO user
      (id, name, email, email_verified, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  );
  insertUser.run(USER_ID, "Guardian", "guardian@example.test", NOW, NOW);
  insertUser.run(OTHER_USER_ID, "Other", "other@example.test", NOW, NOW);
  const insertSession = state.sqlite.prepare(
    `INSERT INTO session
      (id, expires_at, token, created_at, updated_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insertSession.run(
    SESSION_ID,
    NOW + 86_400_000,
    "token-1",
    NOW,
    NOW,
    USER_ID,
  );
  insertSession.run(
    OTHER_SESSION_ID,
    NOW + 86_400_000,
    "token-2",
    NOW,
    NOW,
    USER_ID,
  );
  insertSession.run(
    "session-other",
    NOW + 86_400_000,
    "token-other",
    NOW,
    NOW,
    OTHER_USER_ID,
  );
  const insertLearner = state.sqlite.prepare(
    `INSERT INTO learner_profile
      (id, auth_user_id, legacy_storage_owner, name, private_media_name,
       name_key, age, onboarding_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 8, 'completed', ?, ?)`,
  );
  insertLearner.run(
    TARGET_ID,
    USER_ID,
    0,
    "Mary",
    "Mary",
    "mary",
    NOW,
    NOW,
  );
  insertLearner.run(
    SIBLING_ID,
    USER_ID,
    0,
    "Bob",
    "Bob",
    "bob",
    NOW + 1,
    NOW + 1,
  );
  insertLearner.run(
    "learner-foreign",
    OTHER_USER_ID,
    0,
    "Rose",
    "Rose",
    "rose",
    NOW,
    NOW,
  );
  return { ...state, database: createDatabase(state.d1) };
}

function selectLearner(state, profileId, sessionId = SESSION_ID) {
  state.sqlite.prepare(
    `INSERT INTO session_learner_selection
      (session_id, auth_user_id, learner_profile_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(sessionId, USER_ID, profileId, NOW, NOW);
}

function authStub(session = {
  session: { id: SESSION_ID },
  user: { email: USER_EMAIL, id: USER_ID, name: " Guardian " },
}) {
  return {
    api: { async getSession() { return session; } },
    async handler() { return new Response("auth"); },
  };
}

function deletionRequest(profileId = TARGET_ID) {
  return new Request(
    `https://example.test/api/learner-profiles/${profileId}`,
    { method: "DELETE" },
  );
}

function workerEnvironment(state, bucket) {
  return {
    ASSETS: { async fetch() { return new Response("asset"); } },
    DB: state.d1,
    MULTI_LEARNER_PROFILES_ENABLED: "1",
    PRIVATE_MEDIA_BUCKET: bucket,
  };
}

async function unlock(state) {
  await createGuardianAccessRepository(state.database).unlock(SESSION_ID);
}

function prepare(state, bucket, profileId = TARGET_ID, wait = async () => {}) {
  return prepareLearnerDeletion({
    bucket,
    database: state.database,
    identity: accountIdentity,
    profileId,
    wait,
  });
}

function tombstone(state, profileId = TARGET_ID) {
  return state.sqlite.prepare(
    `SELECT learner_profile_id, user_id_hash, generation, requested_at,
            private_media_name, storage_keys_json
     FROM learner_profile_deletion_tombstone
     WHERE learner_profile_id = ?`,
  ).get(profileId);
}

function profileCount(state, profileId = TARGET_ID) {
  return state.sqlite.prepare(
    "SELECT count(*) AS count FROM learner_profile WHERE id = ?",
  ).get(profileId).count;
}

function metadataState(bucket, key) {
  return bucket.stored.get(key)?.object.customMetadata?.state;
}

function plainRows(rows) {
  return rows.map((row) => ({ ...row }));
}

function firstDubStorage(identity = learnerIdentity()) {
  return createDubStorageKeys(identity, DUB_DEFINITIONS[0].id);
}

function insertConversation(state, profileId, status = "completed", id = `conversation-${profileId}`) {
  state.sqlite.prepare(
    `INSERT INTO conversation_session
      (id, auth_user_id, learner_profile_id, scenario_key, scenario_version,
       room_name, status, controller_state, started_at, created_at, updated_at)
     VALUES (?, ?, ?, 'small-chat', 2, ?, ?, '{}', ?, ?, ?)`,
  ).run(id, USER_ID, profileId, `room-${id}`, status, NOW, NOW, NOW);
}

function addDeletionGraph(state) {
  for (const profileId of [TARGET_ID, SIBLING_ID]) {
    state.sqlite.prepare(
      `INSERT INTO learner_dub_consent
        (learner_profile_id, auth_user_id, consent_version, grant_generation,
         state, granted_at, updated_at)
       VALUES (?, ?, 'guardian-voice-r2-v2', ?, 'granted', ?, ?)`,
    ).run(profileId, USER_ID, `grant-${profileId}`, NOW, NOW);
    state.sqlite.prepare(
      `INSERT INTO onboarding_learner_session_bypass
        (session_id, learner_profile_id, skipped_at)
       VALUES (?, ?, ?)`,
    ).run(
      profileId === TARGET_ID ? SESSION_ID : OTHER_SESSION_ID,
      profileId,
      NOW,
    );
    insertConversation(state, profileId);
    state.sqlite.prepare(
      `INSERT INTO conversation_turn
        (id, conversation_id, provider_item_id, sequence, role, text,
         input_mode, interrupted, created_at)
       VALUES (?, ?, ?, 0, 'user', 'Hello', 'text', 0, ?)`,
    ).run(
      `turn-${profileId}`,
      `conversation-${profileId}`,
      `provider-${profileId}`,
      NOW,
    );
  }
}

function assertOnlySiblingGraphRemains(state) {
  for (const [table, profileColumn] of [
    ["learner_dub_consent", "learner_profile_id"],
    ["onboarding_learner_session_bypass", "learner_profile_id"],
    ["conversation_session", "learner_profile_id"],
  ]) {
    assert.deepEqual(
      plainRows(state.sqlite.prepare(
        `SELECT ${profileColumn} AS profileId FROM ${table} ORDER BY ${profileColumn}`,
      ).all()),
      [{ profileId: SIBLING_ID }],
      table,
    );
  }
  assert.deepEqual(
    plainRows(state.sqlite.prepare(
      `SELECT conversation_id AS conversationId FROM conversation_turn`,
    ).all()),
    [{ conversationId: `conversation-${SIBLING_ID}` }],
  );
}

function delayRunWhen(d1, predicate, gate) {
  function wrap(statement, sql) {
    return new Proxy(statement, {
      get(target, property) {
        if (property === "bind") {
          return (...parameters) => wrap(target.bind(...parameters), sql);
        }
        if (property === "run" && predicate(sql)) {
          return async () => {
            gate.started.resolve();
            await gate.release.promise;
            return target.run();
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }
  return {
    ...d1,
    prepare(sql) {
      return wrap(d1.prepare(sql), sql);
    },
  };
}

function beforeStatementWhen(d1, predicate, before) {
  let triggered = false;
  const statementSql = new WeakMap();
  function wrap(statement, sql) {
    const wrapped = new Proxy(statement, {
      get(target, property) {
        if (property === "bind") {
          return (...parameters) => wrap(target.bind(...parameters), sql);
        }
        if (
          !triggered &&
          (property === "all" || property === "first" || property === "raw" || property === "run") &&
          predicate(sql)
        ) {
          return async (...parameters) => {
            triggered = true;
            await before();
            return target[property](...parameters);
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    statementSql.set(wrapped, sql);
    return wrapped;
  }
  return {
    ...d1,
    async batch(statements) {
      if (
        !triggered &&
        statements.some((statement) => predicate(statementSql.get(statement) ?? ""))
      ) {
        triggered = true;
        await before();
      }
      return d1.batch(statements);
    },
    prepare(sql) {
      return wrap(d1.prepare(sql), sql);
    },
  };
}

describe("learner deletion endpoint", () => {
  it("requires authentication and session-specific Guardian access", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    try {
      const anonymous = await createWorker({
        createAuth: () => authStub(null),
      }).fetch(deletionRequest(), workerEnvironment(state, bucket));
      assert.equal(anonymous.status, 401);
      assert.deepEqual(await anonymous.json(), { error: "unauthorized" });

      const locked = await createWorker({
        createAuth: () => authStub(),
      }).fetch(deletionRequest(), workerEnvironment(state, bucket));
      assert.equal(locked.status, 403);
      assert.deepEqual(await locked.json(), { error: "guardian_required" });
      assert.equal(profileCount(state), 1);
    } finally {
      state.close();
    }
  });

  it("returns indistinguishable 404s for malformed, foreign, absent, encoded-slash, and oversized IDs", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    try {
      await unlock(state);
      const worker = createWorker({ createAuth: () => authStub() });
      const oversized = encodeURIComponent("😀".repeat(33));
      for (const path of [
        "/api/learner-profiles/learner-foreign",
        "/api/learner-profiles/missing",
        "/api/learner-profiles/%E0%A4%A",
        "/api/learner-profiles/learner%2Fa",
        `/api/learner-profiles/${oversized}`,
        "/api/learner-profiles/learner-a/extra",
      ]) {
        const response = await worker.fetch(
          new Request(`https://example.test${path}`, { method: "DELETE" }),
          workerEnvironment(state, bucket),
        );
        assert.equal(response.status, 404, path);
        assert.deepEqual(await response.json(), { error: "not_found" }, path);
      }
      assert.equal(profileCount(state), 1);
      assert.equal(tombstone(state), undefined);
    } finally {
      state.close();
    }
  });

  it("rejects the final learner and a learner with a starting or active conversation before tombstoning", async () => {
    const finalState = seedDatabase();
    const bucket = createBucket();
    const busyStates = ["starting", "active"].map((status) => ({
      state: seedDatabase(),
      status,
    }));
    try {
      finalState.sqlite.prepare("DELETE FROM learner_profile WHERE id = ?").run(SIBLING_ID);
      await unlock(finalState);
      const finalResponse = await createWorker({ createAuth: () => authStub() }).fetch(
        deletionRequest(),
        workerEnvironment(finalState, bucket),
      );
      assert.equal(finalResponse.status, 409);
      assert.deepEqual(await finalResponse.json(), { error: "last_learner" });
      assert.equal(tombstone(finalState), undefined);

      for (const { state, status } of busyStates) {
        insertConversation(state, TARGET_ID, status, `busy-${status}`);
        await unlock(state);
        const busyResponse = await createWorker({ createAuth: () => authStub() }).fetch(
          deletionRequest(),
          workerEnvironment(state, bucket),
        );
        assert.equal(busyResponse.status, 409, status);
        assert.deepEqual(await busyResponse.json(), { error: "learner_busy" }, status);
        assert.equal(tombstone(state), undefined, status);
        assert.equal(profileCount(state), 1, status);
      }
    } finally {
      finalState.close();
      for (const { state } of busyStates) state.close();
    }
  });

  it("keeps the busy diagnostic stable when the conversation ends after the guarded insert", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    insertConversation(state, TARGET_ID, "active", "busy-transition");
    const delayedD1 = beforeStatementWhen(
      state.d1,
      (sql) => sql.includes("SELECT id FROM learner_profile WHERE id = ?"),
      async () => {
        state.sqlite.prepare(
          "UPDATE conversation_session SET status = 'completed' WHERE id = ?",
        ).run("busy-transition");
      },
    );
    try {
      await assert.rejects(
        prepareLearnerDeletion({
          bucket,
          database: createDatabase(delayedD1),
          identity: accountIdentity,
          profileId: TARGET_ID,
          wait: async () => {},
        }),
        (error) => error?.status === 409 && error?.code === "learner_busy",
      );
      assert.equal(tombstone(state), undefined);
    } finally {
      state.close();
    }
  });

  it("keeps the last-learner diagnostic stable when a sibling appears after the guarded insert", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    state.sqlite.prepare("DELETE FROM learner_profile WHERE id = ?").run(SIBLING_ID);
    const delayedD1 = beforeStatementWhen(
      state.d1,
      (sql) => sql.includes("SELECT id FROM learner_profile WHERE id = ?"),
      async () => {
        state.sqlite.prepare(
          `INSERT INTO learner_profile
            (id, auth_user_id, legacy_storage_owner, name, private_media_name,
             name_key, age, onboarding_status, created_at, updated_at)
           VALUES (?, ?, 0, 'Bob', 'Bob', 'bob', 8, 'completed', ?, ?)`,
        ).run(SIBLING_ID, USER_ID, NOW + 1, NOW + 1);
      },
    );
    try {
      await assert.rejects(
        prepareLearnerDeletion({
          bucket,
          database: createDatabase(delayedD1),
          identity: accountIdentity,
          profileId: TARGET_ID,
          wait: async () => {},
        }),
        (error) => error?.status === 409 && error?.code === "last_learner",
      );
      assert.equal(tombstone(state), undefined);
    } finally {
      state.close();
    }
  });

  it("clears an active deletion for every selecting session and returns no implicit sibling", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    try {
      selectLearner(state, TARGET_ID, SESSION_ID);
      selectLearner(state, TARGET_ID, OTHER_SESSION_ID);
      await unlock(state);
      const response = await createWorker({ createAuth: () => authStub() }).fetch(
        deletionRequest(),
        workerEnvironment(state, bucket),
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        activeProfileId: null,
        profiles: [{
          age: 8,
          createdAt: new Date(NOW + 1).toISOString(),
          deletionPending: false,
          id: SIBLING_ID,
          name: "Bob",
          profileStatus: "completed",
        }],
      });
      assert.equal(
        state.sqlite.prepare("SELECT count(*) AS count FROM session_learner_selection").get().count,
        0,
      );
      assert.deepEqual(
        plainRows(state.sqlite.prepare("SELECT session_id AS sessionId FROM learner_selection_required ORDER BY session_id").all()),
        [{ sessionId: SESSION_ID }, { sessionId: OTHER_SESSION_ID }],
      );
    } finally {
      state.close();
    }
  });

  it("preserves an inactive deletion's selected sibling", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    try {
      selectLearner(state, SIBLING_ID);
      await unlock(state);
      const response = await createWorker({ createAuth: () => authStub() }).fetch(
        deletionRequest(),
        workerEnvironment(state, bucket),
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).activeProfileId, SIBLING_ID);
      assert.deepEqual(
        plainRows(state.sqlite.prepare("SELECT learner_profile_id AS profileId FROM session_learner_selection").all()),
        [{ profileId: SIBLING_ID }],
      );
      assert.equal(
        state.sqlite.prepare("SELECT count(*) AS count FROM learner_selection_required").get().count,
        0,
      );
    } finally {
      state.close();
    }
  });

  it("atomically permits only one of concurrent last-two deletions", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    try {
      await unlock(state);
      const worker = createWorker({ createAuth: () => authStub() });
      const [left, right] = await Promise.all([
        worker.fetch(deletionRequest(TARGET_ID), workerEnvironment(state, bucket)),
        worker.fetch(deletionRequest(SIBLING_ID), workerEnvironment(state, bucket)),
      ]);
      const responses = [left, right];
      assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409]);
      const conflict = responses.find(({ status }) => status === 409);
      assert.deepEqual(await conflict.json(), { error: "last_learner" });
      assert.equal(
        state.sqlite.prepare("SELECT count(*) AS count FROM learner_profile WHERE auth_user_id = ?").get(USER_ID).count,
        1,
      );
    } finally {
      state.close();
    }
  });
});

describe("learner deletion lifecycle", () => {
  it("cascades the target SQL graph and removes only its R2 subtree", async () => {
    const state = seedDatabase();
    addDeletionGraph(state);
    const targetOrphan = `${TARGET_PREFIX}orphan.bin`;
    const siblingObject = `${SIBLING_PREFIX}keep.bin`;
    const bucket = createBucket([
      { key: targetOrphan, bytes: new Uint8Array([1]) },
      { key: siblingObject, bytes: new Uint8Array([2]) },
    ]);
    try {
      await prepare(state, bucket);
      assert.equal(profileCount(state), 0);
      assertOnlySiblingGraphRemains(state);
      assert.equal(bucket.stored.has(targetOrphan), false);
      assert.equal(bucket.stored.has(siblingObject), true);
      assert.equal(
        bucket.calls.list.some(({ prefix }) => prefix === SIBLING_PREFIX),
        false,
      );
      const storage = firstDubStorage();
      assert.equal(metadataState(bucket, storage.markerKey), "learner-deleting");
      assert.ok(tombstone(state)?.storage_keys_json.length > 2);
    } finally {
      state.close();
    }
  });

  it("fails closed before touching a sibling named by a tampered persisted closure", async () => {
    const state = seedDatabase();
    const siblingObject = `${SIBLING_PREFIX}keep.bin`;
    const siblingStorage = firstDubStorage({
      ...learnerIdentity(),
      learnerProfileId: SIBLING_ID,
      privateMediaName: "Bob",
    });
    const bucket = createBucket([
      { key: siblingObject, bytes: new Uint8Array([1]) },
    ]);
    state.sqlite.prepare(
      `INSERT INTO learner_profile_deletion_tombstone
        (learner_profile_id, user_id_hash, legacy_storage_owner,
         private_media_name, generation, requested_at, storage_keys_json)
       VALUES (?, ?, 0, 'Mary', 1, ?, ?)`,
    ).run(
      TARGET_ID,
      createHash("sha256").update(USER_ID).digest("hex"),
      NOW,
      JSON.stringify({
        markerKeys: [siblingStorage.markerKey],
        prefixes: [SIBLING_PREFIX],
        slotKeys: [siblingObject],
        version: 1,
      }),
    );

    try {
      await assert.rejects(
        prepare(state, bucket),
        /Learner deletion storage closure is invalid/,
      );
      assert.equal(profileCount(state), 1);
      assert.equal(profileCount(state, SIBLING_ID), 1);
      assert.equal(bucket.stored.has(siblingObject), true);
      assert.equal(
        bucket.calls.list.some(({ prefix }) => prefix === SIBLING_PREFIX),
        false,
      );
      assert.equal(
        [...bucket.calls.head, ...bucket.calls.put.map(({ key }) => key)]
          .some((key) => key.startsWith(SIBLING_PREFIX)),
        false,
      );
    } finally {
      state.close();
    }
  });

  it("preflights all unfinished learner closures before account deletion touches R2", async () => {
    const state = seedDatabase();
    const targetKey = `${TARGET_PREFIX}recordings/lessons/lesson/scene-0/step-0.audio`;
    const userIdHash = createHash("sha256").update(USER_ID).digest("hex");
    const bucket = createBucket([{ bytes: new Uint8Array([1]), key: targetKey }]);
    const insert = state.sqlite.prepare(
      `INSERT INTO learner_profile_deletion_tombstone
        (learner_profile_id, user_id_hash, legacy_storage_owner,
         private_media_name, generation, requested_at, storage_keys_json)
       VALUES (?, ?, 0, ?, 1, ?, ?)`,
    );
    insert.run(
      TARGET_ID,
      userIdHash,
      "Mary",
      NOW,
      JSON.stringify({
        markerKeys: [],
        prefixes: [TARGET_PREFIX],
        slotKeys: [targetKey],
        version: 1,
      }),
    );
    insert.run(
      SIBLING_ID,
      userIdHash,
      "Bob",
      NOW,
      JSON.stringify({
        markerKeys: [],
        prefixes: [SIBLING_PREFIX],
        slotKeys: [targetKey],
        version: 1,
      }),
    );

    try {
      await assert.rejects(
        prepareAccountDeletion({
          bucket,
          database: state.database,
          now: () => new Date(NOW),
          userId: USER_ID,
          wait: async () => {},
        }),
        /Learner deletion storage closure is invalid/,
      );
      assert.deepEqual(bucket.calls, {
        delete: [],
        head: [],
        list: [],
        put: [],
      });
      assert.equal(profileCount(state), 1);
      assert.equal(profileCount(state, SIBLING_ID), 1);
    } finally {
      state.close();
    }
  });

  it("retries transient R2 errors and leaves a persistent failure tombstoned for an idempotent retry", async () => {
    const transientState = seedDatabase();
    const transientBucket = createBucket([
      { key: `${TARGET_PREFIX}orphan.bin`, bytes: new Uint8Array([1]) },
    ]);
    const waits = [];
    transientBucket.deleteFailures = 2;
    try {
      await prepare(transientState, transientBucket, TARGET_ID, async (delay) => waits.push(delay));
      assert.equal(profileCount(transientState), 0);
      assert.equal(transientBucket.calls.delete.length, 3);
      assert.equal(waits.length, 2);
    } finally {
      transientState.close();
    }

    const persistentState = seedDatabase();
    selectLearner(persistentState, TARGET_ID);
    const persistentBucket = createBucket([
      { key: `${TARGET_PREFIX}orphan.bin`, bytes: new Uint8Array([1]) },
    ]);
    persistentBucket.deleteFailures = 3;
    try {
      await assert.rejects(
        prepare(persistentState, persistentBucket),
        /10058/,
      );
      assert.equal(profileCount(persistentState), 1);
      assert.ok(tombstone(persistentState));
      assert.equal(
        persistentState.sqlite.prepare("SELECT count(*) AS count FROM learner_selection_required WHERE session_id = ?").get(SESSION_ID).count,
        1,
      );
      assert.equal(
        persistentState.sqlite.prepare("SELECT count(*) AS count FROM session_learner_selection WHERE session_id = ?").get(SESSION_ID).count,
        0,
      );

      persistentBucket.deleteFailures = 0;
      await prepare(persistentState, persistentBucket);
      await prepare(persistentState, persistentBucket);
      assert.equal(profileCount(persistentState), 0);
      assert.equal(
        persistentState.sqlite.prepare("SELECT count(*) AS count FROM learner_profile WHERE id = ?").get(SIBLING_ID).count,
        1,
      );
    } finally {
      persistentState.close();
    }

    const fenceState = seedDatabase();
    const fenceBucket = createBucket();
    fenceBucket.putFailures = 100;
    try {
      await assert.rejects(prepare(fenceState, fenceBucket), /10058/);
      assert.equal(profileCount(fenceState), 1);
      assert.ok(tombstone(fenceState));

      fenceBucket.putFailures = 0;
      await prepare(fenceState, fenceBucket);
      assert.equal(profileCount(fenceState), 0);
      assert.equal(
        metadataState(fenceBucket, firstDubStorage().markerKey),
        "learner-deleting",
      );
    } finally {
      fenceState.close();
    }
  });

  it("keeps whole-account fences authoritative while learner and account deletion overlap", async () => {
    const state = seedDatabase();
    const lessonKey = `${TARGET_PREFIX}recordings/lessons/lesson-1/scene-0/step-0.audio`;
    const bucket = createBucket([{ key: lessonKey, bytes: new Uint8Array([1]) }]);
    const learnerFenceStarted = deferred();
    const releaseLearnerFence = deferred();
    let held = false;
    bucket.beforePut = async ({ options }) => {
      if (!held && options.customMetadata?.state === "learner-deleting") {
        held = true;
        learnerFenceStarted.resolve();
        await releaseLearnerFence.promise;
      }
    };
    try {
      const learnerDeletion = prepare(state, bucket);
      await learnerFenceStarted.promise;
      await prepareAccountDeletion({
        bucket,
        database: state.database,
        now: () => new Date(NOW),
        userId: USER_ID,
        wait: async () => {},
      });
      releaseLearnerFence.resolve();
      await learnerDeletion;
      assert.equal(metadataState(bucket, lessonKey), "account-deleting");
      assert.equal(
        metadataState(bucket, firstDubStorage().markerKey),
        "account-deleting",
      );
    } finally {
      releaseLearnerFence.resolve();
      state.close();
    }
  });

});

describe("tombstone write fences", () => {
  it("makes a conversation INSERT resolved before deletion lose at the final database boundary", async () => {
    const state = seedDatabase();
    const started = deferred();
    const release = deferred();
    const delayedD1 = delayRunWhen(
      state.d1,
      (sql) => /INSERT INTO conversation_session/i.test(sql),
      { started, release },
    );
    const delayedDatabase = createDatabase(delayedD1);
    const repository = createConversationRepository(delayedDatabase, {
      createId: () => "held-conversation",
      now: () => new Date(NOW),
    });
    const bucket = createBucket();
    try {
      const heldCreate = repository.createConversation(
        learnerIdentity(),
        { key: "small-chat", version: 2 },
      );
      await started.promise;
      await prepare(state, bucket);
      release.resolve();
      await assert.rejects(heldCreate, /learner_deletion_pending/);
      assert.equal(
        state.sqlite.prepare("SELECT count(*) AS count FROM conversation_session WHERE id = 'held-conversation'").get().count,
        0,
      );
    } finally {
      release.resolve();
      state.close();
    }
  });

  it("fences a held dub write whose identity resolved before tombstoning", async () => {
    const state = seedDatabase();
    state.sqlite.prepare(
      `INSERT INTO learner_dub_consent
        (learner_profile_id, auth_user_id, consent_version, grant_generation,
         state, granted_at, updated_at)
       VALUES (?, ?, 'guardian-voice-r2-v2', 'grant-1', 'granted', ?, ?)`,
    ).run(TARGET_ID, USER_ID, NOW, NOW);
    const bucket = createBucket();
    const audioPutStarted = deferred();
    const releaseAudioPut = deferred();
    let held = false;
    bucket.beforePut = async ({ options }) => {
      if (!held && options.customMetadata?.state === "audio") {
        held = true;
        audioPutStarted.resolve();
        await releaseAudioPut.promise;
      }
    };
    const definition = DUB_DEFINITIONS[0];
    const lineId = definition.lines[0].id;
    const identity = learnerIdentity();
    try {
      const upload = handleDubRequest(
        {
          database: state.database,
          env: { PRIVATE_MEDIA_BUCKET: bucket },
          identity,
          request: new Request(
            `https://example.test/api/dubs/${definition.id}/lines/${lineId}`,
            { body: WEBM, headers: { "Content-Type": "audio/webm" }, method: "PUT" },
          ),
        },
        { createUploadNonce: () => "held-dub", wait: async () => {} },
      );
      await audioPutStarted.promise;
      await prepare(state, bucket);
      releaseAudioPut.resolve();
      const response = await upload;
      assert.equal(response.status, 409);
      const key = createDubStorageKeys(identity, definition.id).objectKey(lineId);
      assert.equal(metadataState(bucket, key), "learner-deleting");
      assert.notEqual(metadataState(bucket, key), "audio");
    } finally {
      releaseAudioPut.resolve();
      state.close();
    }
  });

  it("fences a held lesson-recording write whose identity resolved before tombstoning", async () => {
    const state = seedDatabase();
    state.sqlite.prepare(
      `UPDATE learner_profile
       SET lesson_recording_consent_version = ?, lesson_recording_consent_at = ?
       WHERE id = ?`,
    ).run(LESSON_RECORDING_CONSENT_VERSION, NOW, TARGET_ID);
    const bucket = createBucket();
    const audioPutStarted = deferred();
    const releaseAudioPut = deferred();
    let held = false;
    bucket.beforePut = async ({ options }) => {
      if (!held && options.customMetadata?.state === "audio") {
        held = true;
        audioPutStarted.resolve();
        await releaseAudioPut.promise;
      }
    };
    try {
      const upload = handleLessonRecordingRequest(
        {
          database: state.database,
          env: { DB: state.d1, PRIVATE_MEDIA_BUCKET: bucket },
          identity: learnerIdentity(),
          request: new Request(
            "https://example.test/api/lesson-recordings/parrot/01-peppas-high-ball/scenes/0/steps/2",
            {
              body: WEBM,
              headers: {
                "Content-Type": "audio/webm",
                "X-Parrot-Expected-Learner-Profile": TARGET_ID,
              },
              method: "PUT",
            },
          ),
        },
        { createUploadNonce: () => "held-recording", wait: async () => {} },
      );
      await audioPutStarted.promise;
      await prepare(state, bucket);
      releaseAudioPut.resolve();
      const response = await upload;
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { error: "learner_deletion_pending" });
      const recording = [...bucket.stored.values()].find(
        ({ object }) => object.key.includes("/recordings/lessons/"),
      );
      assert.equal(recording?.object.customMetadata.state, "learner-deleting");
    } finally {
      releaseAudioPut.resolve();
      state.close();
    }
  });

  it("fences a lesson-recording reservation created after the deletion sweep", async () => {
    const state = seedDatabase();
    state.sqlite.prepare(
      `UPDATE learner_profile
       SET lesson_recording_consent_version = ?, lesson_recording_consent_at = ?
       WHERE id = ?`,
    ).run(LESSON_RECORDING_CONSENT_VERSION, NOW, TARGET_ID);
    const bucket = createBucket();
    let deletionStarted = false;
    bucket.beforePut = async ({ options }) => {
      if (!deletionStarted && options.customMetadata?.state === "uploading") {
        deletionStarted = true;
        await prepare(state, bucket);
      }
    };
    try {
      const response = await handleLessonRecordingRequest(
        {
          database: state.database,
          env: { DB: state.d1, PRIVATE_MEDIA_BUCKET: bucket },
          identity: learnerIdentity(),
          request: new Request(
            "https://example.test/api/lesson-recordings/parrot/01-peppas-high-ball/scenes/0/steps/2",
            {
              body: WEBM,
              headers: {
                "Content-Type": "audio/webm",
                "X-Parrot-Expected-Learner-Profile": TARGET_ID,
              },
              method: "PUT",
            },
          ),
        },
        { createUploadNonce: () => "late-reservation", wait: async () => {} },
      );
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        error: "learner_deletion_pending",
      });
      const recording = [...bucket.stored.values()].find(
        ({ object }) => object.key.includes("/recordings/lessons/"),
      );
      assert.equal(recording?.object.customMetadata.state, "learner-deleting");
    } finally {
      state.close();
    }
  });
});
