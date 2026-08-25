import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { TextEncoder } from "node:util";
import { createDatabase } from "../worker/database.ts";
import {
  isAccountDeletionPending,
  prepareAccountDeletion,
} from "../worker/account-deletion.ts";
import { handleDubRequest } from "../worker/dubs.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const USER_ID = "user-1";
const USER_PREFIX = "personalized-story-art/user-1/";
const DELETION_REQUESTED_AT = "2026-08-25T10:00:00.000Z";
const DELETION_GENERATION = `account-deletion-v1:${createHash("sha256")
  .update(USER_ID)
  .digest("hex")}:${Date.parse(DELETION_REQUESTED_AT)}`;
const DUB_PATH = "/api/dubs/five-little-ducks-v2";
const DUB_PREFIX = `${USER_PREFIX}learner-dubs/five-little-ducks-v2/`;
const MARKER_KEY = `${DUB_PREFIX}.dub-generation`;
const LINE_IDS = Array.from({ length: 24 }, (_, index) => `line-${index + 1}`);
const slotKey = (lineId) => `${DUB_PREFIX}${lineId}.audio`;
const LEGACY_DUB_PREFIX = `${USER_PREFIX}learner-dubs/five-little-ducks-v1/`;
const LEGACY_MARKER_KEY = `${LEGACY_DUB_PREFIX}.dub-generation`;
const LEGACY_LINE_IDS = Array.from(
  { length: 9 },
  (_, index) => `line-${index + 1}`,
);
const legacySlotKey = (lineId) => `${LEGACY_DUB_PREFIX}${lineId}.audio`;
const CLOSURE_KEYS = [
  MARKER_KEY,
  ...LINE_IDS.map(slotKey),
  LEGACY_MARKER_KEY,
  ...LEGACY_LINE_IDS.map(legacySlotKey),
];

function encoded(value) {
  return new TextEncoder().encode(JSON.stringify(value));
}

function fenceBytes(kind, generation, state) {
  return encoded(["parrot-dub-fence-v1", kind, generation, state]);
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

function createBucket(seed = []) {
  let version = 0;
  const stored = new Map(seed.map((item, index) => [
    item.key,
    {
      bytes: item.bytes ?? new Uint8Array(),
      etag: item.etag ?? createHash("md5")
        .update(item.bytes ?? new Uint8Array())
        .digest("hex"),
      options: {
        customMetadata: item.customMetadata ?? {},
        httpMetadata: item.httpMetadata,
      },
      uploaded: item.uploaded ?? new Date("2026-08-25T10:00:00.000Z"),
      version: item.version ?? `seed-${index + 1}`,
    },
  ]));
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

function assertDeletionFences(bucket, generation) {
  assert.deepEqual(
    bucket.stored.get(MARKER_KEY)?.bytes,
    fenceBytes("marker", generation, "account-deleting"),
  );
  assert.deepEqual(bucket.stored.get(MARKER_KEY)?.options.customMetadata, {
    generation,
    state: "account-deleting",
  });
  for (const lineId of LINE_IDS) {
    const item = bucket.stored.get(slotKey(lineId));
    assert.deepEqual(
      item?.bytes,
      fenceBytes("slot", generation, "account-deleting"),
      lineId,
    );
    assert.deepEqual(item?.options.customMetadata, {
      generation,
      state: "account-deleting",
    }, lineId);
  }
  assert.deepEqual(
    bucket.stored.get(LEGACY_MARKER_KEY)?.bytes,
    fenceBytes("marker", generation, "account-deleting"),
  );
  assert.deepEqual(
    bucket.stored.get(LEGACY_MARKER_KEY)?.options.customMetadata,
    { generation, state: "account-deleting" },
  );
  for (const lineId of LEGACY_LINE_IDS) {
    const item = bucket.stored.get(legacySlotKey(lineId));
    assert.deepEqual(
      item?.bytes,
      fenceBytes("slot", generation, "account-deleting"),
      `legacy ${lineId}`,
    );
    assert.deepEqual(
      item?.options.customMetadata,
      { generation, state: "account-deleting" },
      `legacy ${lineId}`,
    );
  }
}

function assertNoClosureDeletes(bucket) {
  const closureKeys = new Set(CLOSURE_KEYS);
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
  method,
  path,
  pending = async () => false,
}) {
  const body = method === "PUT"
    ? new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1])
    : undefined;
  return handleDubRequest({
    database,
    env: { PERSONALIZED_STORY_ART_BUCKET: bucket },
    identity: { sessionId: "session-1", userId: USER_ID, userName: "Parent" },
    request: new Request(`https://example.test${path}`, {
      ...(body === undefined ? {} : { body }),
      headers: body === undefined
        ? {}
        : {
            "Content-Type": "audio/webm",
            "X-Parrot-Guardian-Consent-Version": "guardian-voice-r2-v1",
          },
      method,
    }),
  }, {
    createGeneration: generation,
    createUploadNonce: () => "upload-1",
    isDeletionPending: pending,
    now: () => new Date("2026-08-25T10:00:00.000Z"),
    wait: async () => {},
  });
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
  state.sqlite.prepare(
    `INSERT INTO guardian_dub_consent
      (auth_user_id, consent_version, grant_generation, state, granted_at, updated_at)
     VALUES (?, 'guardian-voice-r2-v2', 'consent-1', 'granted', ?, ?)`,
  ).run(USER_ID, 1_000, 1_000);
  const insertArt = state.sqlite.prepare(
    `INSERT INTO personalized_story_art (
      id, auth_user_id, story_id, status, r2_object_key, content_type,
      guardian_consent_version, guardian_consent_at, provider,
      prompt_version, created_at, updated_at
    ) VALUES (?, ?, ?, 'ready', ?, 'image/webp', 'guardian-photo-cloudflare-v1', ?,
      'cloudflare-workers-ai', 'red-ball-v1', ?, ?)`,
  );
  insertArt.run(
    "art-1",
    USER_ID,
    "the-red-ball",
    `${USER_PREFIX}the-red-ball/versions/one.webp`,
    1_000,
    1_000,
    1_000,
  );
  insertArt.run(
    "art-2",
    USER_ID,
    "future-story",
    `${USER_PREFIX}future-story/versions/two.webp`,
    1_000,
    1_000,
    1_000,
  );
  return { ...state, database: createDatabase(state.d1) };
}

describe("account deletion personalized-art lifecycle", () => {
  it("tombstones the account and art, purges every R2 object, and retains only dub deletion fences", async () => {
    const state = seedDatabase();
    const events = [];
    try {
      const pages = new Map([
        [
          "",
          {
            cursor: "page-2",
            objects: [
              { key: `${USER_PREFIX}the-red-ball/versions/one.webp` },
              { key: `${USER_PREFIX}untracked/orphan.webp` },
            ],
            truncated: true,
          },
        ],
        [
          "page-2",
          {
            objects: [
              { key: `${USER_PREFIX}future-story/versions/two.webp` },
            ],
            truncated: false,
          },
        ],
      ]);
      const bucket = createBucket();
      bucket.list = async ({ cursor = "", prefix }) => {
        assert.equal(prefix, USER_PREFIX);
        return pages.get(cursor);
      };
      bucket.delete = async (keys) => {
        const tombstoneCount = state.sqlite
          .prepare("SELECT count(*) AS count FROM account_deletion_tombstone")
          .get().count;
        const statuses = state.sqlite
          .prepare(
            "SELECT status FROM personalized_story_art WHERE auth_user_id = ? ORDER BY id",
          )
          .all(USER_ID)
          .map(({ status }) => status);
        const userCount = state.sqlite
          .prepare("SELECT count(*) AS count FROM user WHERE id = ?")
          .get(USER_ID).count;
        events.push({ keys, statuses, tombstoneCount, userCount });
      };

      await prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
      });

      assert.equal(await isAccountDeletionPending(state.database, USER_ID), true);
      assert.deepEqual(events, [
        {
          keys: [
            `${USER_PREFIX}the-red-ball/versions/one.webp`,
            `${USER_PREFIX}untracked/orphan.webp`,
          ],
          statuses: ["deleting", "deleting"],
          tombstoneCount: 1,
          userCount: 1,
        },
        {
          keys: [`${USER_PREFIX}future-story/versions/two.webp`],
          statuses: ["deleting", "deleting"],
          tombstoneCount: 1,
          userCount: 1,
        },
      ]);
      assertDeletionFences(bucket, DELETION_GENERATION);
      assert.equal(
        [...bucket.stored.values()].every(
          (item) => item.options.customMetadata.state !== "audio",
        ),
        true,
      );

      state.sqlite.prepare("DELETE FROM user WHERE id = ?").run(USER_ID);
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM personalized_story_art")
          .get().count,
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

  it("keeps the user and tombstoned rows recoverable when R2 purge fails, then retries safely", async () => {
    const state = seedDatabase();
    let failDelete = true;
    try {
      const bucket = createBucket([{
        key: `${USER_PREFIX}the-red-ball/versions/one.webp`,
      }]);
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
      assert.equal(await isAccountDeletionPending(state.database, USER_ID), true);
      assert.equal(
        state.sqlite.prepare("SELECT count(*) AS count FROM user WHERE id = ?").get(USER_ID)
          .count,
        1,
      );
      assert.deepEqual(
        state.sqlite
          .prepare(
            "SELECT status FROM personalized_story_art WHERE auth_user_id = ? ORDER BY id",
          )
          .all(USER_ID)
          .map(({ status }) => status),
        ["deleting", "deleting"],
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
        state.sqlite.prepare("SELECT count(*) AS count FROM user WHERE id = ?").get(USER_ID)
          .count,
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
      assert.equal(finalWrites[0].key, MARKER_KEY, "The marker fence must land first");
      assertNoClosureDeletes(bucket);

      state.sqlite.prepare("DELETE FROM user WHERE id = ?").run(USER_ID);
      await put(
        `${USER_PREFIX}orphan.webp`,
        new Uint8Array([1]),
        { customMetadata: { state: "art" } },
      );
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
        [...CLOSURE_KEYS, `${USER_PREFIX}orphan.webp`].sort(),
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
        state.sqlite.prepare("SELECT count(*) AS count FROM user WHERE id = ?")
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

  it("converges concurrent hooks on the persisted deletion generation", async () => {
    const state = seedDatabase();
    const bucket = createBucket([
      {
        bytes: new Uint8Array([1, 2, 3]),
        customMetadata: { generation: "reset-1", state: "audio" },
        key: slotKey("line-1"),
      },
      { key: `${USER_PREFIX}orphan.webp` },
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

      assertDeletionFences(bucket, DELETION_GENERATION);
      assertNoClosureDeletes(bucket);
      assert.deepEqual(
        new Set(CLOSURE_KEYS.map(
          (key) => bucket.stored.get(key).options.customMetadata.generation,
        )),
        new Set([DELETION_GENERATION]),
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
      await assert.rejects(prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
        wait: async () => {},
      }), /final fence failed/);
      assert.equal(failedFenceAttempts, 1, "Non-rate failures are not retried");
      assert.equal(await isAccountDeletionPending(state.database, USER_ID), true);
      assert.equal(
        state.sqlite.prepare("SELECT count(*) AS count FROM user WHERE id = ?")
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
    const bucket = createBucket([{ key: `${USER_PREFIX}orphan.webp` }]);
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
        wait: async (delay) => { waits.push(delay); },
      });
      assert.equal(attempts, 3);
      assert.equal(waits.length, 2);
      assert.equal(waits.every((delay) => delay >= 1_000), true);
      assertDeletionFences(bucket, DELETION_GENERATION);
    } finally {
      state.close();
    }
  });

  it("stops retrying a persistent 10058 prefix delete and retains the user", async () => {
    const state = seedDatabase();
    const bucket = createBucket([{ key: `${USER_PREFIX}orphan.webp` }]);
    const waits = [];
    let attempts = 0;
    bucket.delete = async () => {
      attempts += 1;
      throw new Error("delete: TooManyRequests (10058)");
    };

    try {
      await assert.rejects(prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
        wait: async (delay) => { waits.push(delay); },
      }), /10058/);
      assert.equal(attempts, 3);
      assert.equal(waits.length, 2);
      assert.equal(bucket.calls.put.length, 0);
      assert.equal(
        state.sqlite.prepare("SELECT count(*) AS count FROM user WHERE id = ?")
          .get(USER_ID).count,
        1,
      );
    } finally {
      state.close();
    }
  });

  it("retries 10058 marker and slot fence writes with injected pacing", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    const put = bucket.put.bind(bucket);
    const waits = [];
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
      return put(key, bytes, options);
    };

    try {
      await prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
        wait: async (delay) => { waits.push(delay); },
      });
      assert.equal(markerAttempts, 3);
      assert.equal(lineThreeAttempts, 2);
      assert.equal(waits.length, 3);
      assert.equal(waits.every((delay) => delay >= 1_000), true);
      assertDeletionFences(bucket, DELETION_GENERATION);
    } finally {
      state.close();
    }
  });

  it("stops retrying a persistent 10058 marker fence and retains the user", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    const waits = [];
    let attempts = 0;
    bucket.put = async (key) => {
      if (key === MARKER_KEY) {
        attempts += 1;
        throw new Error("put marker: TooManyRequests (10058)");
      }
      throw new Error("slot fence must not start before the marker");
    };

    try {
      await assert.rejects(prepareDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
        wait: async (delay) => { waits.push(delay); },
      }), /10058/);
      assert.equal(attempts, 3);
      assert.equal(waits.length, 2);
      assert.equal(
        state.sqlite.prepare("SELECT count(*) AS count FROM user WHERE id = ?")
          .get(USER_ID).count,
        1,
      );
    } finally {
      state.close();
    }
  });
});
