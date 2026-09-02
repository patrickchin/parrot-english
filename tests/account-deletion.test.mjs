import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createDatabase } from "../worker/database.ts";
import {
  isAccountDeletionPending,
  prepareAccountDeletion,
} from "../worker/account-deletion.ts";
import { handleDubRequest } from "../worker/dubs.ts";
import { DUB_DEFINITIONS } from "../src/dubbing/rhyme-catalog.ts";
import {
  createDubStorageKeys,
  dubStorageClosureKeys,
  fenceBody,
} from "../worker/dub-storage.ts";
import { lessonRecordingObjectKey } from "../worker/lesson-recording-storage.ts";
import {
  accountPrivateMediaPrefix,
  learnerPrivateMediaPrefix,
} from "../worker/private-media-storage.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const USER_ID = "user-1";
const DEFAULT_LEARNER_ID = "learner-a";
const USER_PREFIX = accountPrivateMediaPrefix(USER_ID);
const DELETION_REQUESTED_AT = "2026-08-25T10:00:00.000Z";
const DELETION_GENERATION = `account-deletion-v1:${createHash("sha256")
  .update(USER_ID)
  .digest("hex")}:${Date.parse(DELETION_REQUESTED_AT)}`;
const DUB_PATH = "/api/dubs/five-little-ducks-v2";
const learnerOwner = (learnerProfileId = DEFAULT_LEARNER_ID) => ({
  learnerProfileId,
  userId: USER_ID,
});
const learnerDubStorage = (
  learnerProfileId = DEFAULT_LEARNER_ID,
  dubId = DUB_DEFINITIONS[0].id,
) => createDubStorageKeys(learnerOwner(learnerProfileId), dubId);
const defaultDubStorage = learnerDubStorage();
const MARKER_KEY = defaultDubStorage.markerKey;
const slotKey = (lineId) => defaultDubStorage.objectKey(lineId);
const learnerLessonRecordingKey = (learnerProfileId) =>
  lessonRecordingObjectKey(learnerOwner(learnerProfileId), {
    lessonId: "01-peppas-high-ball",
    sceneIndex: 0,
    stepIndex: 2,
  });
const LESSON_RECORDING_KEY = learnerLessonRecordingKey(DEFAULT_LEARNER_ID);
const closureKeysFor = (learnerProfileId) =>
  DUB_DEFINITIONS.flatMap(({ id }) => {
    const closure = dubStorageClosureKeys(
      learnerDubStorage(learnerProfileId, id),
    );
    return [...closure.markerKeys, ...closure.slotKeys];
  });
const CATALOG_MARKER_KEYS = DUB_DEFINITIONS.map(({ id }) =>
  learnerDubStorage(DEFAULT_LEARNER_ID, id).markerKey,
);
const CLOSURE_KEYS = closureKeysFor(DEFAULT_LEARNER_ID);

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function delayD1ReadWhen(d1, predicate, { beforeRead, release }) {
  let delayed = false;

  function wrapStatement(statement, sql) {
    return new Proxy(statement, {
      get(target, property) {
        if (property === "bind") {
          return (...parameters) =>
            wrapStatement(target.bind(...parameters), sql);
        }
        if (
          !delayed &&
          ["all", "first", "raw"].includes(property) &&
          predicate(sql)
        ) {
          return async (...parameters) => {
            delayed = true;
            beforeRead();
            await release;
            return target[property](...parameters);
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
      return wrapStatement(d1.prepare(sql), sql);
    },
  };
}

function createBucket(seed = []) {
  let version = 0;
  const stored = new Map(
    seed.map((item, index) => [
      item.key,
      {
        bytes: item.bytes ?? new Uint8Array(),
        etag:
          item.etag ??
          createHash("md5")
            .update(item.bytes ?? new Uint8Array())
            .digest("hex"),
        options: {
          customMetadata: item.customMetadata ?? {},
          httpMetadata: item.httpMetadata,
        },
        uploaded: item.uploaded ?? new Date("2026-08-25T10:00:00.000Z"),
        version: item.version ?? `seed-${index + 1}`,
      },
    ]),
  );
  const calls = { delete: [], head: [], list: [], put: [] };

  function object(key, item) {
    return {
      customMetadata: item.options.customMetadata,
      etag: item.etag,
      key,
      size: item.bytes.byteLength,
      uploaded: item.uploaded,
      version: item.version,
      writeHttpMetadata(headers) {
        const contentType = item.options.httpMetadata?.contentType;
        if (contentType) headers.set("Content-Type", contentType);
      },
    };
  }

  return {
    calls,
    stored,
    async delete(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      calls.delete.push(list);
      for (const key of list) stored.delete(key);
    },
    async head(key) {
      calls.head.push(key);
      const item = stored.get(key);
      return item ? object(key, item) : null;
    },
    async list(options) {
      calls.list.push(options);
      return {
        objects: [...stored]
          .filter(([key]) => key.startsWith(options.prefix))
          .map(([key, item]) => object(key, item)),
        truncated: false,
      };
    },
    async put(key, bytes, options = {}) {
      calls.put.push({ bytes, key, options });
      const current = stored.get(key);
      if (
        options.onlyIf?.etagMatches !== undefined &&
        current?.etag !== options.onlyIf.etagMatches
      ) {
        return null;
      }
      if (options.onlyIf?.etagDoesNotMatch === "*" && current !== undefined) {
        return null;
      }
      const body = new Uint8Array(bytes ?? new Uint8Array());
      const item = {
        bytes: body,
        etag: createHash("md5").update(body).digest("hex"),
        options,
        uploaded: new Date("2026-08-25T10:00:00.000Z"),
        version: `version-${++version}`,
      };
      stored.set(key, item);
      return object(key, item);
    },
  };
}

function assertLearnerDeletionFences(bucket, learnerProfileId, generation) {
  for (const definition of DUB_DEFINITIONS) {
    const storage = learnerDubStorage(learnerProfileId, definition.id);
    const marker = bucket.stored.get(storage.markerKey);
    assert.deepEqual(
      marker?.bytes,
      fenceBody("marker", generation, "account-deleting"),
      `${learnerProfileId} ${definition.id}`,
    );
    assert.deepEqual(
      marker?.options.customMetadata,
      { generation, state: "account-deleting" },
      `${learnerProfileId} ${definition.id}`,
    );
    for (const { id } of definition.lines) {
      const item = bucket.stored.get(storage.objectKey(id));
      assert.deepEqual(
        item?.bytes,
        fenceBody("slot", generation, "account-deleting"),
        `${learnerProfileId} ${id}`,
      );
      assert.deepEqual(
        item?.options.customMetadata,
        { generation, state: "account-deleting" },
        `${learnerProfileId} ${id}`,
      );
    }
  }
}

function assertDeletionFences(
  bucket,
  generation,
  learnerProfileIds = [DEFAULT_LEARNER_ID],
) {
  for (const learnerProfileId of learnerProfileIds) {
    assertLearnerDeletionFences(bucket, learnerProfileId, generation);
  }
}

function assertNoClosureDeletes(
  bucket,
  learnerProfileIds = [DEFAULT_LEARNER_ID],
) {
  const closureKeys = new Set(learnerProfileIds.flatMap(closureKeysFor));
  assert.equal(
    bucket.calls.delete.flat().some((key) => closureKeys.has(key)),
    false,
    "A prefix sweep must never delete a canonical closure key",
  );
}

async function callDub({
  bucket,
  database,
  generation = () => "reset-1",
  identity,
  method,
  path,
  pending = async () => false,
}) {
  const body =
    method === "PUT" ? new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1]) : undefined;
  return handleDubRequest(
    {
      database,
      env: { PRIVATE_MEDIA_BUCKET: bucket },
      identity: identity ?? {
        learnerName: "Mary",
        learnerProfileId: DEFAULT_LEARNER_ID,
        sessionId: "session-1",
        userId: USER_ID,
        userName: "Parent",
      },
      request: new Request(`https://example.test${path}`, {
        ...(body === undefined ? {} : { body }),
        headers:
          body === undefined
            ? {}
            : {
                "Content-Type": "audio/webm",
              },
        method,
      }),
    },
    {
      createGeneration: generation,
      createUploadNonce: () => "upload-1",
      isDeletionPending: pending,
      now: () => new Date("2026-08-25T10:00:00.000Z"),
      wait: async () => {},
    },
  );
}

function prepareDeletion(input) {
  return prepareAccountDeletion({
    now: () => new Date(DELETION_REQUESTED_AT),
    ...input,
  });
}

function seedDatabase() {
  const state = createTestD1Database();
  state.sqlite
    .prepare(
      "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    )
    .run(USER_ID, "Parent One", "one@example.test", 1_000, 1_000);
  state.sqlite
    .prepare(
      `INSERT INTO learner_profile
        (id, auth_user_id, name, onboarding_status, legacy_storage_owner)
       VALUES (?, ?, 'Mary', 'completed', 0)`,
    )
    .run(DEFAULT_LEARNER_ID, USER_ID);
  state.sqlite
    .prepare(
      `INSERT INTO learner_dub_consent
        (learner_profile_id, auth_user_id, consent_version, grant_generation,
         state, granted_at, updated_at)
       VALUES (?, ?, 'guardian-voice-r2-v2', 'consent-1', 'granted', ?, ?)`,
    )
    .run(DEFAULT_LEARNER_ID, USER_ID, 1_000, 1_000);
  return { ...state, database: createDatabase(state.d1) };
}

describe("account deletion private-media cleanup", () => {
  it("bounds final fence writes while closing every learner subtree", async () => {
    const state = seedDatabase();
    const siblingRecordingKey = learnerLessonRecordingKey("learner-b");
    const bucket = createBucket([
      { key: LESSON_RECORDING_KEY },
      { key: siblingRecordingKey },
    ]);
    const put = bucket.put.bind(bucket);
    let activeWrites = 0;
    let maxActiveWrites = 0;

    try {
      const insertLearner = state.sqlite.prepare(
        `INSERT INTO learner_profile
          (id, auth_user_id, name, onboarding_status, legacy_storage_owner)
         VALUES (?, ?, ?, 'not_started', 0)`,
      );
      insertLearner.run("learner-b", USER_ID, "Bob");
      insertLearner.run("learner-c", USER_ID, "Rose");

      bucket.put = async (key, bytes, options) => {
        activeWrites += 1;
        maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
        try {
          await Promise.resolve();
          return await put(key, bytes, options);
        } finally {
          activeWrites -= 1;
        }
      };

      await prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
        wait: async () => {},
      });

      assert.ok(
        maxActiveWrites > 1,
        "Fence writes should make bounded progress in parallel",
      );
      assert.ok(
        maxActiveWrites <= 4,
        "Fence write concurrency must stay bounded",
      );
      assertDeletionFences(
        bucket,
        DELETION_GENERATION,
        [DEFAULT_LEARNER_ID, "learner-b", "learner-c"],
      );
      for (const key of [LESSON_RECORDING_KEY, siblingRecordingKey]) {
        assert.deepEqual(bucket.stored.get(key)?.options.customMetadata, {
          generation: DELETION_GENERATION,
          state: "account-deleting",
        });
      }
    } finally {
      state.close();
    }
  });

  it("fences in-flight uploads in every learner subtree", async () => {
    const state = seedDatabase();
    const allAudioPutsStarted = deferred();
    const releaseAudioPuts = deferred();
    const bucket = createBucket();
    const put = bucket.put.bind(bucket);
    let audioPuts = 0;
    bucket.put = async (key, bytes, options) => {
      if (options?.customMetadata?.state === "audio") {
        audioPuts += 1;
        if (audioPuts === 3) allAudioPutsStarted.resolve();
        await releaseAudioPuts.promise;
      }
      return put(key, bytes, options);
    };
    let uploads = [];

    try {
      const insertLearner = state.sqlite.prepare(
        `INSERT INTO learner_profile
          (id, auth_user_id, name, onboarding_status, legacy_storage_owner)
         VALUES (?, ?, ?, 'not_started', 0)`,
      );
      insertLearner.run("learner-b", USER_ID, "Bob");
      insertLearner.run("learner-c", USER_ID, "Rose");
      const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
      const insertConsent = state.sqlite.prepare(
        `INSERT INTO learner_dub_consent
          (learner_profile_id, auth_user_id, consent_version, grant_generation,
           state, granted_at, updated_at)
         VALUES (?, ?, 'guardian-voice-r2-v2', 'consent-1', 'granted', ?, ?)`,
      );
      insertConsent.run("learner-b", USER_ID, timestamp, timestamp);
      insertConsent.run("learner-c", USER_ID, timestamp, timestamp);
      const identities = [
        {
          learnerName: "Mary",
          learnerProfileId: DEFAULT_LEARNER_ID,
          sessionId: "session-a",
          userId: USER_ID,
          userName: "Parent",
        },
        {
          learnerName: "Bob",
          learnerProfileId: "learner-b",
          sessionId: "session-b",
          userId: USER_ID,
          userName: "Parent",
        },
        {
          learnerName: "Rose",
          learnerProfileId: "learner-c",
          sessionId: "session-c",
          userId: USER_ID,
          userName: "Parent",
        },
      ];
      uploads = identities.map((identity) =>
        callDub({
          bucket,
          database: state.database,
          identity,
          method: "PUT",
          path: `${DUB_PATH}/lines/line-1`,
        }),
      );
      await allAudioPutsStarted.promise;

      await prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
        wait: async () => {},
      });

      assertDeletionFences(
        bucket,
        DELETION_GENERATION,
        [DEFAULT_LEARNER_ID, "learner-b", "learner-c"],
      );
      assert.equal(
        [...bucket.stored.values()].some(
          (item) => item.options.customMetadata.state === "audio",
        ),
        false,
      );
      releaseAudioPuts.resolve();
      const responses = await Promise.all(uploads);
      assert.deepEqual(
        responses.map(({ status }) => status),
        [409, 409, 409],
      );
      assert.equal(
        [...bucket.stored.values()].some(
          (item) => item.options.customMetadata.state === "audio",
        ),
        false,
      );
    } finally {
      releaseAudioPuts.resolve();
      await Promise.allSettled(uploads);
      state.close();
    }
  });

  it("tombstones the account, paginates its prefix, and retains recording fences", async () => {
    const state = seedDatabase();
    const events = [];
    const firstOrphan = `${USER_PREFIX}temporary/orphan-one.bin`;
    const secondOrphan = `${USER_PREFIX}temporary/orphan-two.bin`;
    const otherAccountObject =
      `${accountPrivateMediaPrefix("user-2")}learners/learner-z/recordings/keep.audio`;
    try {
      const pages = new Map([
        [
          "",
          {
            cursor: "page-2",
            objects: [
              { key: firstOrphan },
              { key: slotKey("line-1") },
            ],
            truncated: true,
          },
        ],
        [
          "page-2",
          {
            objects: [
              { key: secondOrphan },
              { key: LESSON_RECORDING_KEY },
            ],
            truncated: false,
          },
        ],
      ]);
      const bucket = createBucket([{ key: otherAccountObject }]);
      bucket.list = async ({ cursor = "", prefix }) => {
        assert.equal(prefix, USER_PREFIX);
        return pages.get(cursor);
      };
      bucket.delete = async (keys) => {
        const tombstoneCount = state.sqlite
          .prepare("SELECT count(*) AS count FROM account_deletion_tombstone")
          .get().count;
        const userCount = state.sqlite
          .prepare("SELECT count(*) AS count FROM user WHERE id = ?")
          .get(USER_ID).count;
        events.push({ keys, tombstoneCount, userCount });
      };

      await prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
      });

      assert.equal(
        await isAccountDeletionPending(state.database, USER_ID),
        true,
      );
      assert.deepEqual(events, [
        {
          keys: [firstOrphan],
          tombstoneCount: 1,
          userCount: 1,
        },
        {
          keys: [secondOrphan],
          tombstoneCount: 1,
          userCount: 1,
        },
      ]);
      assertDeletionFences(bucket, DELETION_GENERATION);
      assert.deepEqual(
        bucket.stored.get(LESSON_RECORDING_KEY)?.bytes,
        fenceBody("slot", DELETION_GENERATION, "account-deleting"),
      );
      assert.deepEqual(
        bucket.stored.get(LESSON_RECORDING_KEY)?.options.customMetadata,
        {
          generation: DELETION_GENERATION,
          state: "account-deleting",
        },
      );
      assert.equal(
        bucket.stored.has(otherAccountObject),
        true,
        "Deleting one account must not touch another account prefix",
      );

      state.sqlite.prepare("DELETE FROM user WHERE id = ?").run(USER_ID);
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM user WHERE id = ?")
          .get(USER_ID).count,
        0,
      );
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM account_deletion_tombstone")
          .get().count,
        1,
        "The opaque tombstone must outlive the user row to fence in-flight uploads",
      );
    } finally {
      state.close();
    }
  });

  it("adopts an unfinished learner deletion closure after its profile is gone", async () => {
    const state = seedDatabase();
    const removedLearnerId = "learner-removed";
    const removedOwner = learnerOwner(removedLearnerId);
    const removedStorage = learnerDubStorage(removedLearnerId);
    const removedLineKey = removedStorage.objectKey(DUB_DEFINITIONS[0].lines[0].id);
    const removedLessonKey = learnerLessonRecordingKey(removedLearnerId);
    const bucket = createBucket([
      { key: removedLineKey },
      { key: removedLessonKey },
    ]);
    state.sqlite.prepare(
      `INSERT INTO learner_profile_deletion_tombstone
        (learner_profile_id, user_id_hash, legacy_storage_owner, generation,
         requested_at, storage_keys_json)
       VALUES (?, ?, 0, 1, ?, ?)`,
    ).run(
      removedLearnerId,
      createHash("sha256").update(USER_ID).digest("hex"),
      Date.parse(DELETION_REQUESTED_AT),
      JSON.stringify({
        markerKeys: [removedStorage.markerKey],
        prefixes: [learnerPrivateMediaPrefix(removedOwner)],
        slotKeys: [removedLineKey, removedLessonKey],
        version: 1,
      }),
    );

    try {
      await prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
        wait: async () => {},
      });

      assertDeletionFences(
        bucket,
        DELETION_GENERATION,
        [DEFAULT_LEARNER_ID, removedLearnerId],
      );
      assert.deepEqual(
        bucket.stored.get(removedLessonKey)?.options.customMetadata,
        { generation: DELETION_GENERATION, state: "account-deleting" },
      );
      assert.deepEqual(
        JSON.parse(
          state.sqlite.prepare(
            `SELECT learner_storage_identities_json
             FROM account_deletion_tombstone`,
          ).get().learner_storage_identities_json,
        ),
        [
          { learnerProfileId: DEFAULT_LEARNER_ID },
          { learnerProfileId: removedLearnerId },
        ],
      );
    } finally {
      state.close();
    }
  });

  it("keeps the user recoverable when R2 purge fails, then retries safely", async () => {
    const state = seedDatabase();
    let failDelete = true;
    try {
      const bucket = createBucket([
        {
          key: `${USER_PREFIX}temporary/orphan.bin`,
        },
      ]);
      const remove = bucket.delete.bind(bucket);
      bucket.delete = async (keys) => {
        if (failDelete) throw new Error("temporary R2 failure");
        return remove(keys);
      };

      await assert.rejects(
        prepareDeletion({
          bucket,
          database: state.database,
          userId: USER_ID,
        }),
        /temporary R2 failure/,
      );
      assert.equal(
        await isAccountDeletionPending(state.database, USER_ID),
        true,
      );
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM user WHERE id = ?")
          .get(USER_ID).count,
        1,
      );
      failDelete = false;
      await prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
      });
      assertDeletionFences(bucket, DELETION_GENERATION);
      state.sqlite.prepare("DELETE FROM user WHERE id = ?").run(USER_ID);
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM user WHERE id = ?")
          .get(USER_ID).count,
        0,
      );
    } finally {
      state.close();
    }
  });

  it("keeps hook A closure when hook B sweeps before a held upload settles", async () => {
    const state = seedDatabase();
    const d1Error = new Error("post-store D1 read failed");
    const audioPutStarted = deferred();
    const releaseAudioPut = deferred();
    const secondListStarted = deferred();
    const releaseSecondList = deferred();
    const secondDeleteFinished = deferred();
    const releaseSecondDelete = deferred();
    const bucket = createBucket();
    const put = bucket.put.bind(bucket);
    let cleanupAttempts = 0;
    bucket.put = async (key, bytes, options) => {
      if (options?.customMetadata?.state === "audio") {
        audioPutStarted.resolve();
        await releaseAudioPut.promise;
      }
      if (
        options?.customMetadata?.state === "account-deleting" &&
        options.customMetadata.generation === "upload-cleanup"
      ) {
        cleanupAttempts += 1;
        throw new Error("upload-side R2 cleanup failed");
      }
      return put(key, bytes, options);
    };
    const list = bucket.list.bind(bucket);
    let holdSecondList = true;
    let secondHookKeys = [];
    bucket.list = async (options) => {
      const held = holdSecondList;
      if (held) {
        holdSecondList = false;
        secondListStarted.resolve();
        await releaseSecondList.promise;
      }
      const page = await list(options);
      if (held) secondHookKeys = page.objects.map(({ key }) => key);
      return page;
    };
    const remove = bucket.delete.bind(bucket);
    bucket.delete = async (keys) => {
      await remove(keys);
      secondDeleteFinished.resolve();
      await releaseSecondDelete.promise;
    };
    let pendingChecks = 0;

    try {
      const uploadOutcome = callDub({
        bucket,
        database: state.database,
        generation: () => "upload-cleanup",
        method: "PUT",
        path: `${DUB_PATH}/lines/line-1`,
        pending: async () => {
          if (++pendingChecks === 1) return false;
          throw d1Error;
        },
      }).then(
        (response) => ({ response }),
        (error) => ({ error }),
      );
      await audioPutStarted.promise;

      const secondHook = prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
        wait: async () => {},
      });
      await secondListStarted.promise;

      await prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
        wait: async () => {},
      });
      assertDeletionFences(bucket, DELETION_GENERATION);
      assert.equal(bucket.stored.size, CLOSURE_KEYS.length);
      const finalWrites = bucket.calls.put.filter(
        ({ options }) =>
          options.customMetadata?.generation === DELETION_GENERATION,
      );
      assert.equal(
        finalWrites[0].key,
        MARKER_KEY,
        "The marker fence must land first",
      );
      assertNoClosureDeletes(bucket);

      state.sqlite.prepare("DELETE FROM user WHERE id = ?").run(USER_ID);
      await put(`${USER_PREFIX}temporary/orphan.bin`, new Uint8Array([1]), {
        customMetadata: { state: "temporary" },
      });
      releaseSecondList.resolve();
      await secondDeleteFinished.promise;

      releaseAudioPut.resolve();
      const settledUpload = await uploadOutcome;
      const head = bucket.head.bind(bucket);
      let failSecondHook = true;
      bucket.head = async (key) => {
        if (failSecondHook) {
          failSecondHook = false;
          throw new Error("second hook failed after listing");
        }
        return head(key);
      };
      releaseSecondDelete.resolve();
      await assert.rejects(secondHook, /second hook failed after listing/);

      assert.deepEqual(
        secondHookKeys.sort(),
        [...CLOSURE_KEYS, `${USER_PREFIX}temporary/orphan.bin`].sort(),
      );
      assert.equal(settledUpload.error, undefined);
      assert.equal(settledUpload.response.status, 409);
      assert.equal(pendingChecks, 1);
      assert.equal(cleanupAttempts, 0);
      assertDeletionFences(bucket, DELETION_GENERATION);
      assertNoClosureDeletes(bucket);
      assert.equal(
        [...bucket.stored.values()].some(
          (item) => item.options.customMetadata.state === "audio",
        ),
        false,
      );
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM user WHERE id = ?")
          .get(USER_ID).count,
        0,
      );
    } finally {
      releaseAudioPut.resolve();
      releaseSecondList.resolve();
      releaseSecondDelete.resolve();
      state.close();
    }
  });

  it("reuses the durable learner closure when a concurrent hook snapshots after cascade", async () => {
    const state = seedDatabase();
    const snapshotStarted = deferred();
    const releaseSnapshot = deferred();
    const audioPutStarted = deferred();
    const releaseAudioPut = deferred();
    const bucket = createBucket();
    const put = bucket.put.bind(bucket);
    let cleanupAttempts = 0;
    let pendingChecks = 0;
    let uploadOutcome;
    let hookB;

    bucket.put = async (key, bytes, options) => {
      if (options?.customMetadata?.state === "audio") {
        audioPutStarted.resolve();
        await releaseAudioPut.promise;
      }
      if (
        options?.customMetadata?.state === "account-deleting" &&
        options.customMetadata.generation === "upload-cleanup"
      ) {
        cleanupAttempts += 1;
        throw new Error("upload-side R2 cleanup failed");
      }
      return put(key, bytes, options);
    };

    try {
      const insertLearner = state.sqlite.prepare(
        `INSERT INTO learner_profile
          (id, auth_user_id, name, onboarding_status, legacy_storage_owner)
         VALUES (?, ?, ?, 'not_started', 0)`,
      );
      insertLearner.run("learner-b", USER_ID, "Bob");
      insertLearner.run("learner-c", USER_ID, "Rose");
      const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
      const insertConsent = state.sqlite.prepare(
        `INSERT INTO learner_dub_consent
          (learner_profile_id, auth_user_id, consent_version, grant_generation,
           state, granted_at, updated_at)
         VALUES (?, ?, 'guardian-voice-r2-v2', 'consent-1', 'granted', ?, ?)`,
      );
      insertConsent.run("learner-b", USER_ID, timestamp, timestamp);
      insertConsent.run("learner-c", USER_ID, timestamp, timestamp);

      uploadOutcome = callDub({
        bucket,
        database: state.database,
        generation: () => "upload-cleanup",
        identity: {
          learnerName: "Bob",
          learnerProfileId: "learner-b",
          sessionId: "session-b",
          userId: USER_ID,
          userName: "Parent",
        },
        method: "PUT",
        path: `${DUB_PATH}/lines/line-1`,
        pending: async () => {
          if (++pendingChecks === 1) return false;
          throw new Error("post-store D1 read failed");
        },
      }).then(
        (response) => ({ response }),
        (error) => ({ error }),
      );
      await audioPutStarted.promise;

      const hookBDatabase = createDatabase(
        delayD1ReadWhen(
          state.d1,
          (sql) => /from "learner_profile"/i.test(sql),
          {
            beforeRead: () => snapshotStarted.resolve(),
            release: releaseSnapshot.promise,
          },
        ),
      );
      hookB = prepareDeletion({
        bucket,
        database: hookBDatabase,
        userId: USER_ID,
        wait: async () => {},
      });
      await snapshotStarted.promise;

      await prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
        wait: async () => {},
      });
      assertDeletionFences(
        bucket,
        DELETION_GENERATION,
        [DEFAULT_LEARNER_ID, "learner-b", "learner-c"],
      );
      assert.deepEqual(
        JSON.parse(
          state.sqlite
            .prepare(
              `SELECT learner_storage_identities_json
             FROM account_deletion_tombstone`,
            )
            .get().learner_storage_identities_json,
        ),
        [
          { learnerProfileId: DEFAULT_LEARNER_ID },
          { learnerProfileId: "learner-b" },
          { learnerProfileId: "learner-c" },
        ],
      );

      state.sqlite.prepare("DELETE FROM user WHERE id = ?").run(USER_ID);
      assert.equal(
        state.sqlite
          .prepare(
            "SELECT count(*) AS count FROM learner_profile WHERE auth_user_id = ?",
          )
          .get(USER_ID).count,
        0,
      );
      releaseSnapshot.resolve();
      await hookB;

      releaseAudioPut.resolve();
      const settledUpload = await uploadOutcome;

      assert.equal(settledUpload.error, undefined);
      assert.equal(settledUpload.response.status, 409);
      assert.equal(pendingChecks, 1);
      assert.equal(cleanupAttempts, 0);
      assertDeletionFences(
        bucket,
        DELETION_GENERATION,
        [DEFAULT_LEARNER_ID, "learner-b", "learner-c"],
      );
      assert.equal(
        [...bucket.stored.values()].some(
          (item) => item.options.customMetadata.state === "audio",
        ),
        false,
      );
    } finally {
      releaseSnapshot.resolve();
      releaseAudioPut.resolve();
      await Promise.allSettled([hookB, uploadOutcome].filter(Boolean));
      state.close();
    }
  });

  it("converges concurrent hooks on the persisted deletion generation", async () => {
    const state = seedDatabase();
    const bucket = createBucket([
      {
        bytes: new Uint8Array([1, 2, 3]),
        customMetadata: { generation: "reset-1", state: "audio" },
        key: slotKey("line-1"),
      },
      { key: `${USER_PREFIX}temporary/orphan.bin` },
    ]);

    try {
      await Promise.all([
        prepareDeletion({
          bucket,
          database: state.database,
          userId: USER_ID,
          wait: async () => {},
        }),
        prepareDeletion({
          bucket,
          database: state.database,
          now: () => new Date("2030-01-01T00:00:00.000Z"),
          userId: USER_ID,
          wait: async () => {},
        }),
      ]);

      const tombstone = state.sqlite
        .prepare(
          `SELECT user_id_hash, requested_at FROM account_deletion_tombstone`,
        )
        .get();
      const persistedGeneration = `account-deletion-v1:${tombstone.user_id_hash}:${tombstone.requested_at}`;
      assertDeletionFences(bucket, persistedGeneration);
      assertNoClosureDeletes(bucket);
      assert.deepEqual(
        new Set(
          CLOSURE_KEYS.map(
            (key) => bucket.stored.get(key).options.customMetadata.generation,
          ),
        ),
        new Set([persistedGeneration]),
      );
    } finally {
      state.close();
    }
  });

  it("makes an in-flight reset lose to the durable account-deletion generation", async () => {
    const state = seedDatabase();
    const resetSlotStarted = deferred();
    const releaseResetSlot = deferred();
    const bucket = createBucket();
    const put = bucket.put.bind(bucket);
    let heldResetSlot = false;
    bucket.put = async (key, bytes, options) => {
      if (
        !heldResetSlot &&
        key === slotKey("line-1") &&
        options?.customMetadata?.state === "tombstone"
      ) {
        heldResetSlot = true;
        resetSlotStarted.resolve();
        await releaseResetSlot.promise;
      }
      return put(key, bytes, options);
    };

    try {
      const reset = callDub({
        bucket,
        database: state.database,
        generation: () => "reset-1",
        method: "DELETE",
        path: DUB_PATH,
      });
      await resetSlotStarted.promise;

      await prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
        wait: async () => {},
      });
      releaseResetSlot.resolve();

      assert.equal((await reset).status, 409);
      assertDeletionFences(bucket, DELETION_GENERATION);
    } finally {
      releaseResetSlot.resolve();
      state.close();
    }
  });

  it("does not let a reset paused before marker read mutate a complete account closure", async () => {
    const state = seedDatabase();
    const markerReadStarted = deferred();
    const releaseMarkerRead = deferred();
    const bucket = createBucket();
    const head = bucket.head.bind(bucket);
    let heldMarkerRead = false;
    bucket.head = async (key) => {
      if (!heldMarkerRead && key === MARKER_KEY) {
        heldMarkerRead = true;
        markerReadStarted.resolve();
        await releaseMarkerRead.promise;
      }
      return head(key);
    };

    try {
      const reset = callDub({
        bucket,
        database: state.database,
        generation: () => "reset-1",
        method: "DELETE",
        path: DUB_PATH,
        pending: () => isAccountDeletionPending(state.database, USER_ID),
      });
      await markerReadStarted.promise;

      await prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
        wait: async () => {},
      });
      const writesAtClosure = bucket.calls.put.length;
      releaseMarkerRead.resolve();

      const response = await reset;
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error, "account_deletion_pending");
      assert.equal(
        bucket.calls.put.length,
        writesAtClosure,
        "A delayed reset must not write over the terminal account marker",
      );
      assertDeletionFences(bucket, DELETION_GENERATION);
    } finally {
      releaseMarkerRead.resolve();
      state.close();
    }
  });

  it("fails closed on a partial final fence and converges on retry", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    const put = bucket.put.bind(bucket);
    let failLineFive = true;
    let failedFenceAttempts = 0;
    bucket.put = async (key, bytes, options) => {
      if (
        failLineFive &&
        key === slotKey("line-5") &&
        options?.customMetadata?.state === "account-deleting"
      ) {
        failedFenceAttempts += 1;
        throw new Error("final fence failed");
      }
      return put(key, bytes, options);
    };

    try {
      await assert.rejects(
        prepareDeletion({
          bucket,
          database: state.database,
          userId: USER_ID,
          wait: async () => {},
        }),
        /final fence failed/,
      );
      assert.equal(failedFenceAttempts, 1, "Non-rate failures are not retried");
      assert.equal(
        await isAccountDeletionPending(state.database, USER_ID),
        true,
      );
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM user WHERE id = ?")
          .get(USER_ID).count,
        1,
      );
      assert.equal(
        bucket.stored.get(MARKER_KEY).options.customMetadata.state,
        "account-deleting",
      );
      assert.equal(
        bucket.stored.get(slotKey("line-1")).options.customMetadata.state,
        "account-deleting",
      );
      assert.equal(bucket.stored.has(slotKey("line-5")), false);

      failLineFive = false;
      const markerVersion = bucket.stored.get(MARKER_KEY).version;
      await prepareDeletion({
        bucket,
        database: state.database,
        now: () => new Date("2030-01-01T00:00:00.000Z"),
        userId: USER_ID,
        wait: async () => {},
      });
      assertDeletionFences(bucket, DELETION_GENERATION);
      assert.equal(
        bucket.stored.get(MARKER_KEY).version,
        markerVersion,
        "A retry must retain an already-correct stable marker",
      );
    } finally {
      state.close();
    }
  });

  it("retries a 10058 prefix delete with paced, bounded attempts", async () => {
    const state = seedDatabase();
    const bucket = createBucket([{ key: `${USER_PREFIX}temporary/orphan.bin` }]);
    const remove = bucket.delete.bind(bucket);
    const waits = [];
    let attempts = 0;
    bucket.delete = async (keys) => {
      attempts += 1;
      if (attempts < 3) throw new Error("delete: TooManyRequests (10058)");
      return remove(keys);
    };

    try {
      await prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
        wait: async (delay) => {
          waits.push(delay);
        },
      });
      assert.equal(attempts, 3);
      assert.equal(waits.length, 2);
      assert.equal(
        waits.every((delay) => delay >= 1_000),
        true,
      );
      assertDeletionFences(bucket, DELETION_GENERATION);
    } finally {
      state.close();
    }
  });

  it("stops retrying a persistent 10058 prefix delete and retains the user", async () => {
    const state = seedDatabase();
    const bucket = createBucket([{ key: `${USER_PREFIX}temporary/orphan.bin` }]);
    const waits = [];
    let attempts = 0;
    bucket.delete = async () => {
      attempts += 1;
      throw new Error("delete: TooManyRequests (10058)");
    };

    try {
      await assert.rejects(
        prepareDeletion({
          bucket,
          database: state.database,
          userId: USER_ID,
          wait: async (delay) => {
            waits.push(delay);
          },
        }),
        /10058/,
      );
      assert.equal(attempts, 3);
      assert.equal(waits.length, 2);
      assert.equal(bucket.calls.put.length, 0);
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM user WHERE id = ?")
          .get(USER_ID).count,
        1,
      );
    } finally {
      state.close();
    }
  });

  it("retries 10058 marker, dub, and lesson fence writes with injected pacing", async () => {
    const state = seedDatabase();
    const bucket = createBucket([{ key: LESSON_RECORDING_KEY }]);
    const put = bucket.put.bind(bucket);
    const waits = [];
    let lessonAttempts = 0;
    let markerAttempts = 0;
    let lineThreeAttempts = 0;
    bucket.put = async (key, bytes, options) => {
      if (key === MARKER_KEY) {
        markerAttempts += 1;
        if (markerAttempts < 3) {
          throw new Error("put marker: TooManyRequests (10058)");
        }
      }
      if (key === slotKey("line-3")) {
        lineThreeAttempts += 1;
        if (lineThreeAttempts < 2) {
          throw new Error("put slot: TooManyRequests (10058)");
        }
      }
      if (key === LESSON_RECORDING_KEY) {
        lessonAttempts += 1;
        if (lessonAttempts < 3) {
          throw new Error("put lesson: TooManyRequests (10058)");
        }
      }
      return put(key, bytes, options);
    };

    try {
      await prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
        wait: async (delay) => {
          waits.push(delay);
        },
      });
      assert.equal(markerAttempts, 3);
      assert.equal(lineThreeAttempts, 2);
      assert.equal(lessonAttempts, 3);
      assert.equal(waits.length, 5);
      assert.equal(waits.every((delay) => delay >= 1_000), true);
      assertDeletionFences(bucket, DELETION_GENERATION);
      assert.deepEqual(
        bucket.stored.get(LESSON_RECORDING_KEY)?.options.customMetadata,
        {
          generation: DELETION_GENERATION,
          state: "account-deleting",
        },
      );
    } finally {
      state.close();
    }
  });

  it("stops retrying a persistent 10058 marker fence and retains the user", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    const waits = [];
    const attemptedKeys = [];
    const attemptedMarkerKeys = CATALOG_MARKER_KEYS.slice(0, 4);
    const attempts = new Map(attemptedMarkerKeys.map((key) => [key, 0]));
    bucket.put = async (key) => {
      if (attempts.has(key)) {
        attemptedKeys.push(key);
        attempts.set(key, attempts.get(key) + 1);
        throw new Error("put marker: TooManyRequests (10058)");
      }
      throw new Error("slot fence must not start before the marker");
    };

    try {
      await assert.rejects(
        prepareDeletion({
          bucket,
          database: state.database,
          userId: USER_ID,
          wait: async (delay) => {
            waits.push(delay);
          },
        }),
        /10058/,
      );
      assert.deepEqual(
        [...attempts.entries()],
        attemptedMarkerKeys.map((key) => [key, 3]),
      );
      assert.equal(waits.length, attemptedMarkerKeys.length * 2);
      assert.deepEqual(
        attemptedKeys.toSorted(),
        attemptedMarkerKeys.flatMap((key) => [key, key, key]).toSorted(),
      );
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM user WHERE id = ?")
          .get(USER_ID).count,
        1,
      );
    } finally {
      state.close();
    }
  });
});

it("account deletion exposes one stable failure code across client and guest actions", async () => {
  const { createServer } = await import("vite");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true },
  });
  try {
    const { deleteAccountSession } = await vite.ssrLoadModule(
      "/src/auth/AuthGate.tsx",
    );
    const passwords = [];
    const client = {
      async deleteUser(fields) {
        passwords.push(fields.password);
        return { error: { status: 500 } };
      },
    };
    assert.equal(
      await deleteAccountSession({
        client,
        password: "guardian-password",
        refetch: async () => assert.fail("A failed deletion must not refetch."),
      }),
      "account-delete-failed",
    );
    assert.deepEqual(passwords, ["guardian-password"]);

    assert.equal(
      await deleteAccountSession({
        client,
        deleteGuestAccountAction: async () => {
          throw new Error("SERVER DELETE SENTENCE");
        },
        isAnonymous: true,
        password: "",
        refetch: async () => assert.fail("A failed deletion must not refetch."),
      }),
      "account-delete-failed",
    );
  } finally {
    await vite.close();
  }
});
