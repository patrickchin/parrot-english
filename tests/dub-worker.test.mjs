import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { TextEncoder } from "node:util";

const DUB_PATH = "/api/dubs/five-little-ducks-v1";
const CONSENT_HEADERS = {
  "Content-Type": "audio/webm",
  "X-Parrot-Guardian-Consent-Version": "guardian-voice-r2-v1",
};
const LINE_IDS = Array.from({ length: 9 }, (_, index) => `line-${index + 1}`);
const OWNER_PREFIX = "personalized-story-art/user-1/learner-dubs/five-little-ducks-v1/";
const MARKER_KEY = `${OWNER_PREFIX}.dub-generation`;
const slotKey = (lineId) => `${OWNER_PREFIX}${lineId}.audio`;

function encoded(value) {
  return new TextEncoder().encode(JSON.stringify(value));
}

function fenceBytes(kind, generation, state) {
  return encoded(["parrot-dub-fence-v1", kind, generation, state]);
}

function envelopedAudio(generation, audio) {
  const prefix = encoded(["parrot-dub-audio-v1", generation]);
  const bytes = new Uint8Array(prefix.byteLength + audio.byteLength);
  bytes.set(prefix);
  bytes.set(audio, prefix.byteLength);
  return { bytes, payloadOffset: prefix.byteLength };
}

function storedAudio(item) {
  return item.bytes.subarray(Number(item.options.customMetadata.payloadOffset ?? 0));
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

function assertResetTombstones(bucket, generation) {
  const marker = bucket.stored.get(MARKER_KEY);
  assert.deepEqual(marker?.bytes, fenceBytes("marker", generation, "ready"));
  assert.deepEqual(marker?.options.customMetadata, {
    generation,
    state: "ready",
  });
  for (const lineId of LINE_IDS) {
    const item = bucket.stored.get(slotKey(lineId));
    assert.deepEqual(item?.bytes, fenceBytes("slot", generation, "tombstone"), lineId);
    assert.deepEqual(item?.options.customMetadata, {
      generation,
      state: "tombstone",
    }, lineId);
  }
}

function contentEtag(bytes) {
  return createHash("md5").update(bytes).digest("hex");
}

function createBucket(seed = []) {
  const stored = new Map(seed.map(([key, value], index) => [
    key,
    {
      ...value,
      bytes: value.bytes ?? new Uint8Array(),
      etag: value.etag ?? contentEtag(value.bytes ?? new Uint8Array()),
      version: value.version ?? `seed-version-${index + 1}`,
    },
  ]));
  const calls = { delete: [], get: [], head: [], list: [], put: [] };
  let versionSequence = 0;

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
      calls.delete.push(keys);
      for (const key of Array.isArray(keys) ? keys : [keys]) stored.delete(key);
    },
    async get(key) {
      calls.get.push(key);
      const item = stored.get(key);
      if (!item) return null;
      return {
        ...object(key, item),
        body: new Response(item.bytes).body,
      };
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
          .map(([key, value]) => ({
            customMetadata: value.options.customMetadata,
            key,
            uploaded: value.uploaded,
          })),
        truncated: false,
      };
    },
    async put(key, bytes, options) {
      calls.put.push({ bytes, key, options });
      const current = stored.get(key);
      if (
        options?.onlyIf?.etagMatches !== undefined &&
        current?.etag !== options.onlyIf.etagMatches
      ) {
        return null;
      }
      if (
        options?.onlyIf?.etagDoesNotMatch === "*" &&
        current !== undefined
      ) {
        return null;
      }
      const item = {
        bytes: bytes === null ? new Uint8Array() : new Uint8Array(bytes),
        etag: contentEtag(bytes === null ? new Uint8Array() : new Uint8Array(bytes)),
        options,
        uploaded: new Date("2026-08-25T10:00:00.000Z"),
        version: `version-${++versionSequence}`,
      };
      stored.set(key, item);
      return object(key, item);
    },
  };
}

async function callDub({
  body,
  bucket = createBucket(),
  headers = {},
  method,
  path,
  pending = async () => false,
  generation = () => "generation-1",
  userId = "user-1",
}) {
  const { handleDubRequest } = await import("../worker/dubs.ts");
  const init = body === undefined
    ? { headers, method }
    : { body, headers, method };
  return handleDubRequest({
    database: {},
    env: { PERSONALIZED_STORY_ART_BUCKET: bucket },
    identity: { sessionId: "session-1", userId, userName: "Parent" },
    request: new Request(`https://example.test${path}`, init),
  }, {
    createGeneration: generation,
    isDeletionPending: pending,
    now: () => new Date("2026-08-25T10:00:00.000Z"),
  });
}

describe("private learner dub API", () => {
  it("stores and privately streams one encoded owner-scoped WebM slot", async () => {
    const bucket = createBucket();
    const body = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2]);
    const envelope = envelopedAudio("legacy", body);

    const upload = await callDub({
      body,
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
      userId: "user/one",
    });

    assert.equal(upload.status, 201);
    assert.equal(upload.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await upload.json(), {
      lineId: "line-1",
      recordedAt: "2026-08-25T10:00:00.000Z",
    });
    assert.equal(bucket.calls.put.length, 1);
    assert.deepEqual(bucket.calls.put[0], {
      bytes: envelope.bytes,
      key: "personalized-story-art/user%2Fone/learner-dubs/five-little-ducks-v1/line-1.audio",
      options: {
        customMetadata: {
          generation: "legacy",
          guardianConsentVersion: "guardian-voice-r2-v1",
          lineId: "line-1",
          payloadOffset: String(envelope.payloadOffset),
          recordedAt: "2026-08-25T10:00:00.000Z",
          state: "audio",
        },
        httpMetadata: { contentType: "audio/webm" },
        onlyIf: { etagDoesNotMatch: "*" },
      },
    });

    const asset = await callDub({
      bucket,
      method: "GET",
      path: `${DUB_PATH}/lines/line-1/audio`,
      userId: "user/one",
    });
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get("Cache-Control"), "private, no-store");
    assert.equal(asset.headers.get("Content-Type"), "audio/webm");
    assert.equal(asset.headers.get("X-Content-Type-Options"), "nosniff");
    assert.deepEqual(new Uint8Array(await asset.arrayBuffer()), body);

    const status = await callDub({
      bucket,
      method: "GET",
      path: DUB_PATH,
      userId: "user/one",
    });
    const statusPayload = await status.json();
    assert.equal(statusPayload.lines[0].saved, true);
    assert.equal(statusPayload.lines[0].recordedAt, "2026-08-25T10:00:00.000Z");
  });

  it("returns all nine canonical status rows and safely derives recorded times", async () => {
    const prefix = "personalized-story-art/user-1/learner-dubs/five-little-ducks-v1/";
    const bucket = createBucket([
      [`${prefix}line-1.audio`, {
        bytes: new Uint8Array([1]),
        options: {
          customMetadata: { recordedAt: "2026-08-25T09:00:00.000Z" },
          httpMetadata: { contentType: "audio/webm" },
        },
        uploaded: new Date("2026-08-25T09:01:00.000Z"),
      }],
      [`${prefix}line-2.audio`, {
        bytes: new Uint8Array([2]),
        options: {
          customMetadata: { recordedAt: "not-a-date" },
          httpMetadata: { contentType: "audio/webm" },
        },
        uploaded: new Date("2026-08-25T09:02:00.000Z"),
      }],
      [`${prefix}line-99.audio`, {
        bytes: new Uint8Array([99]),
        options: { customMetadata: {}, httpMetadata: { contentType: "audio/webm" } },
        uploaded: new Date("2026-08-25T09:03:00.000Z"),
      }],
    ]);

    const response = await callDub({ bucket, method: "GET", path: DUB_PATH });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await response.json(), {
      complete: false,
      dubId: "five-little-ducks-v1",
      guardianConsentVersion: "guardian-voice-r2-v1",
      lines: LINE_IDS.map((id, index) => ({
        id,
        recordedAt: index === 0
          ? "2026-08-25T09:00:00.000Z"
          : index === 1
            ? "2026-08-25T09:02:00.000Z"
            : null,
        saved: index < 2,
      })),
    });
    assert.deepEqual(bucket.calls.list, [{
      include: ["customMetadata"],
      prefix,
    }]);
  });

  it("reports complete only when all nine fixed slots exist", async () => {
    const prefix = "personalized-story-art/user-1/learner-dubs/five-little-ducks-v1/";
    const bucket = createBucket(LINE_IDS.map((id, index) => [
      `${prefix}${id}.audio`,
      {
        bytes: new Uint8Array([index]),
        options: { customMetadata: {}, httpMetadata: { contentType: "audio/webm" } },
        uploaded: new Date(`2026-08-25T09:0${index}:00.000Z`),
      },
    ]));

    const response = await callDub({ bucket, method: "GET", path: DUB_PATH });
    assert.equal((await response.json()).complete, true);
  });

  it("resets all nine fixed slots to current-generation tombstones", async () => {
    const bucket = createBucket();

    const response = await callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(bucket.calls.delete, []);
    assertResetTombstones(bucket, "reset-1");
  });

  it("makes a held old upload lose to reset without stale cleanup", async () => {
    const bucket = createBucket();
    const linePutStarted = deferred();
    const releaseLinePut = deferred();
    const put = bucket.put.bind(bucket);
    bucket.put = async (key, bytes, options) => {
      if (
        key === slotKey("line-1") &&
        options?.customMetadata?.state !== "tombstone"
      ) {
        linePutStarted.resolve();
        await releaseLinePut.promise;
      }
      return put(key, bytes, options);
    };

    const uploadPromise = callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
    });
    await linePutStarted.promise;
    const reset = await callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
    });
    releaseLinePut.resolve();
    const upload = await uploadPromise;

    assert.equal(reset.status, 204);
    assert.equal(upload.status, 409);
    assert.deepEqual(bucket.calls.delete, []);
    assertResetTombstones(bucket, "reset-1");
  });

  it("preserves a newer post-reset take when stale same-line upload A settles later", async () => {
    const repeatedBytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1]);
    const bucket = createBucket([[slotKey("line-1"), {
      bytes: repeatedBytes,
      options: {
        customMetadata: {},
        httpMetadata: { contentType: "audio/webm" },
      },
      uploaded: new Date("2026-08-25T09:00:00.000Z"),
    }]]);
    const stalePutStarted = deferred();
    const releaseStalePut = deferred();
    const put = bucket.put.bind(bucket);
    let held = false;
    bucket.put = async (key, bytes, options) => {
      if (
        key === slotKey("line-1") &&
        options?.customMetadata?.state !== "tombstone" &&
        !held
      ) {
        held = true;
        stalePutStarted.resolve();
        await releaseStalePut.promise;
      }
      return put(key, bytes, options);
    };

    const stalePromise = callDub({
      body: repeatedBytes,
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
    });
    await stalePutStarted.promise;
    assert.equal((await callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
    })).status, 204);

    const newerEnvelope = envelopedAudio("reset-1", repeatedBytes);
    const newer = await callDub({
      body: repeatedBytes,
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
    });
    releaseStalePut.resolve();
    const stale = await stalePromise;

    assert.equal(newer.status, 201);
    assert.equal(stale.status, 409);
    assert.deepEqual(bucket.calls.delete, []);
    assert.deepEqual(storedAudio(bucket.stored.get(slotKey("line-1"))), repeatedBytes);
    assert.deepEqual(
      bucket.stored.get(slotKey("line-1")).options.customMetadata,
      {
        generation: "reset-1",
        guardianConsentVersion: "guardian-voice-r2-v1",
        lineId: "line-1",
        payloadOffset: String(newerEnvelope.payloadOffset),
        recordedAt: "2026-08-25T10:00:00.000Z",
        state: "audio",
      },
    );
  });

  it("does not depend on a cleanup delete when stale upload loses", async () => {
    const bucket = createBucket();
    const stalePutStarted = deferred();
    const releaseStalePut = deferred();
    const put = bucket.put.bind(bucket);
    bucket.put = async (key, bytes, options) => {
      if (
        key === slotKey("line-1") &&
        options?.customMetadata?.state !== "tombstone"
      ) {
        stalePutStarted.resolve();
        await releaseStalePut.promise;
      }
      return put(key, bytes, options);
    };
    const remove = bucket.delete.bind(bucket);
    bucket.delete = async (keys) => {
      if (!Array.isArray(keys)) throw new Error("cleanup delete failed");
      return remove(keys);
    };

    const stalePromise = callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
    });
    await stalePutStarted.promise;
    assert.equal((await callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
    })).status, 204);
    releaseStalePut.resolve();

    assert.equal((await stalePromise).status, 409);
    assertResetTombstones(bucket, "reset-1");
  });

  it("rejects reset that starts after PUT marker read but before conditional slot put", async () => {
    const bucket = createBucket();
    const secondMarkerRead = deferred();
    const releaseMarkerRead = deferred();
    const head = bucket.head.bind(bucket);
    let markerReads = 0;
    bucket.head = async (key) => {
      const object = await head(key);
      if (key === MARKER_KEY && ++markerReads === 2) {
        secondMarkerRead.resolve();
        await releaseMarkerRead.promise;
      }
      return object;
    };

    const uploadPromise = callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
    });
    await secondMarkerRead.promise;
    const reset = await callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
    });
    releaseMarkerRead.resolve();

    assert.equal(reset.status, 204);
    assert.equal((await uploadPromise).status, 409);
    assertResetTombstones(bucket, "reset-1");
  });

  it("keeps reset tombstones when PUT stored audio before its final marker recheck", async () => {
    const bucket = createBucket();
    const audioStored = deferred();
    const releaseAudioPut = deferred();
    const put = bucket.put.bind(bucket);
    bucket.put = async (key, bytes, options) => {
      const result = await put(key, bytes, options);
      if (
        key === slotKey("line-1") &&
        options?.customMetadata?.state !== "tombstone"
      ) {
        audioStored.resolve();
        await releaseAudioPut.promise;
      }
      return result;
    };

    const uploadPromise = callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
    });
    await audioStored.promise;
    const reset = await callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
    });
    releaseAudioPut.resolve();

    assert.equal(reset.status, 204);
    assert.equal((await uploadPromise).status, 409);
    assertResetTombstones(bucket, "reset-1");
  });

  it("rejects uploads during reset and permits a conditioned take after ready", async () => {
    const bucket = createBucket();
    const resetPaused = deferred();
    const releaseReset = deferred();
    const put = bucket.put.bind(bucket);
    bucket.put = async (key, bytes, options) => {
      if (
        key === slotKey("line-1") &&
        options?.customMetadata?.state === "tombstone"
      ) {
        resetPaused.resolve();
        await releaseReset.promise;
      }
      return put(key, bytes, options);
    };

    const resetPromise = callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
    });
    await resetPaused.promise;
    const duringReset = await callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
    });
    releaseReset.resolve();
    assert.equal((await resetPromise).status, 204);
    assert.equal(duringReset.status, 409);

    const afterReset = await callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
    });
    assert.equal(afterReset.status, 201);
    assert.equal(
      bucket.stored.get(slotKey("line-1")).options.customMetadata.generation,
      "reset-1",
    );
  });

  it("lets a newer concurrent reset take over without late old-generation writes", async () => {
    const bucket = createBucket();
    const firstResetPaused = deferred();
    const releaseFirstReset = deferred();
    const put = bucket.put.bind(bucket);
    bucket.put = async (key, bytes, options) => {
      if (
        key === slotKey("line-1") &&
        options?.customMetadata?.generation === "reset-1" &&
        options?.customMetadata?.state === "tombstone"
      ) {
        firstResetPaused.resolve();
        await releaseFirstReset.promise;
      }
      return put(key, bytes, options);
    };

    const firstResetPromise = callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
    });
    await firstResetPaused.promise;
    const secondReset = await callDub({
      bucket,
      generation: () => "reset-2",
      method: "DELETE",
      path: DUB_PATH,
    });
    releaseFirstReset.resolve();
    const firstReset = await firstResetPromise;

    assert.equal(secondReset.status, 204);
    assert.equal(firstReset.status, 409);
    assertResetTombstones(bucket, "reset-2");
  });

  it("prevents content-etag ABA from a retired reset slot write", async () => {
    const bucket = createBucket([
      [MARKER_KEY, {
        bytes: new Uint8Array(),
        options: {
          customMetadata: { generation: "reset-0", state: "ready" },
        },
        uploaded: new Date("2026-08-25T09:00:00.000Z"),
      }],
      ...LINE_IDS.map((lineId) => [slotKey(lineId), {
        bytes: new Uint8Array(),
        options: {
          customMetadata: { generation: "reset-0", state: "tombstone" },
        },
        uploaded: new Date("2026-08-25T09:00:00.000Z"),
      }]),
    ]);
    const oldSlotPutStarted = deferred();
    const releaseOldSlotPut = deferred();
    const put = bucket.put.bind(bucket);
    bucket.put = async (key, bytes, options) => {
      if (
        key === slotKey("line-1") &&
        options?.customMetadata?.generation === "reset-1" &&
        options?.customMetadata?.state === "tombstone"
      ) {
        oldSlotPutStarted.resolve();
        await releaseOldSlotPut.promise;
      }
      return put(key, bytes, options);
    };

    const oldResetPromise = callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
    });
    await oldSlotPutStarted.promise;
    const newReset = await callDub({
      bucket,
      generation: () => "reset-2",
      method: "DELETE",
      path: DUB_PATH,
    });
    releaseOldSlotPut.resolve();
    const oldReset = await oldResetPromise;

    assert.equal(newReset.status, 204);
    assert.equal(oldReset.status, 409);
    assertResetTombstones(bucket, "reset-2");
  });

  it("prevents content-etag ABA from a retired reset marker finalize", async () => {
    const bucket = createBucket();
    const oldReadyPutStarted = deferred();
    const releaseOldReadyPut = deferred();
    const put = bucket.put.bind(bucket);
    bucket.put = async (key, bytes, options) => {
      if (
        key === MARKER_KEY &&
        options?.customMetadata?.generation === "reset-1" &&
        options?.customMetadata?.state === "ready"
      ) {
        oldReadyPutStarted.resolve();
        await releaseOldReadyPut.promise;
      }
      return put(key, bytes, options);
    };

    const oldResetPromise = callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
    });
    await oldReadyPutStarted.promise;
    const newReset = await callDub({
      bucket,
      generation: () => "reset-2",
      method: "DELETE",
      path: DUB_PATH,
    });
    releaseOldReadyPut.resolve();
    const oldReset = await oldResetPromise;

    assert.equal(newReset.status, 204);
    assert.equal(oldReset.status, 409);
    assertResetTombstones(bucket, "reset-2");
  });

  it("stops a retired reset from heading and tombstoning a newer valid take", async () => {
    const bucket = createBucket();
    const oldSlotHeadStarted = deferred();
    const releaseOldSlotHead = deferred();
    const head = bucket.head.bind(bucket);
    let held = false;
    bucket.head = async (key) => {
      if (key === slotKey("line-1") && !held) {
        held = true;
        oldSlotHeadStarted.resolve();
        await releaseOldSlotHead.promise;
      }
      return head(key);
    };

    const oldResetPromise = callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
    });
    await oldSlotHeadStarted.promise;
    assert.equal((await callDub({
      bucket,
      generation: () => "reset-2",
      method: "DELETE",
      path: DUB_PATH,
    })).status, 204);
    const newerBytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 2]);
    const newerEnvelope = envelopedAudio("reset-2", newerBytes);
    const newer = await callDub({
      body: newerBytes,
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
    });
    releaseOldSlotHead.resolve();
    const oldReset = await oldResetPromise;

    assert.equal(newer.status, 201);
    assert.equal(oldReset.status, 409);
    assert.deepEqual(storedAudio(bucket.stored.get(slotKey("line-1"))), newerBytes);
    assert.deepEqual(
      bucket.stored.get(slotKey("line-1")).options.customMetadata,
      {
        generation: "reset-2",
        guardianConsentVersion: "guardian-voice-r2-v1",
        lineId: "line-1",
        payloadOffset: String(newerEnvelope.payloadOffset),
        recordedAt: "2026-08-25T10:00:00.000Z",
        state: "audio",
      },
    );
  });

  it("retries a transient slot-tombstone failure to a complete reset", async () => {
    const bucket = createBucket();
    const put = bucket.put.bind(bucket);
    let failTombstone = true;
    bucket.put = async (key, bytes, options) => {
      if (
        failTombstone &&
        key === slotKey("line-5") &&
        options?.customMetadata?.state === "tombstone"
      ) {
        throw new Error("tombstone write failed");
      }
      return put(key, bytes, options);
    };

    await assert.rejects(callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
    }), /tombstone write failed/);
    assert.equal(bucket.stored.get(MARKER_KEY).options.customMetadata.state, "deleting");

    failTombstone = false;
    const retry = await callDub({
      bucket,
      generation: () => "reset-2",
      method: "DELETE",
      path: DUB_PATH,
    });
    assert.equal(retry.status, 204);
    assertResetTombstones(bucket, "reset-2");
  });

  it("retries a transient ready-marker failure to a complete reset", async () => {
    const bucket = createBucket();
    const put = bucket.put.bind(bucket);
    let failReady = true;
    bucket.put = async (key, bytes, options) => {
      if (
        failReady &&
        key === MARKER_KEY &&
        options?.customMetadata?.state === "ready"
      ) {
        throw new Error("marker write failed");
      }
      return put(key, bytes, options);
    };

    await assert.rejects(callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
    }), /marker write failed/);
    assert.equal(bucket.stored.get(MARKER_KEY).options.customMetadata.state, "deleting");

    failReady = false;
    const retry = await callDub({
      bucket,
      generation: () => "reset-2",
      method: "DELETE",
      path: DUB_PATH,
    });
    assert.equal(retry.status, 204);
    assertResetTombstones(bucket, "reset-2");
  });

  it("recovers deleting and malformed markers through a fresh reset generation", async () => {
    for (const customMetadata of [
      { generation: "old-reset", state: "deleting" },
      { state: "unknown" },
    ]) {
      const bucket = createBucket([[MARKER_KEY, {
        bytes: new Uint8Array(),
        options: { customMetadata },
        uploaded: new Date("2026-08-25T10:00:00.000Z"),
      }]]);

      const response = await callDub({
        bucket,
        generation: () => "reset-2",
        method: "DELETE",
        path: DUB_PATH,
      });
      assert.equal(response.status, 204, JSON.stringify(customMetadata));
      assertResetTombstones(bucket, "reset-2");
    }
  });

  it("counts and serves only current-generation audio while preserving legacy mode", async () => {
    const bucket = createBucket();
    assert.equal((await callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
    })).status, 204);
    assert.equal((await callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1]),
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
    })).status, 201);
    await bucket.put(slotKey("line-2"), new Uint8Array([1]), {
      customMetadata: { recordedAt: "2026-08-25T09:00:00.000Z" },
      httpMetadata: { contentType: "audio/webm" },
    });
    await bucket.put(slotKey("line-3"), new Uint8Array([1]), {
      customMetadata: { generation: "old-reset", state: "audio" },
      httpMetadata: { contentType: "audio/webm" },
    });

    const status = await callDub({ bucket, method: "GET", path: DUB_PATH });
    const payload = await status.json();
    assert.deepEqual(
      payload.lines.filter(({ saved }) => saved).map(({ id }) => id),
      ["line-1"],
    );
    assert.equal((await callDub({
      bucket,
      method: "GET",
      path: `${DUB_PATH}/lines/line-1/audio`,
    })).status, 200);
    assert.equal((await callDub({
      bucket,
      method: "GET",
      path: `${DUB_PATH}/lines/line-2/audio`,
    })).status, 404);
    assert.equal((await callDub({
      bucket,
      method: "GET",
      path: `${DUB_PATH}/lines/line-3/audio`,
    })).status, 404);
  });

  it("keeps marker and tombstones private, purge-scoped, and outside status rows", async () => {
    const bucket = createBucket();
    assert.equal((await callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
    })).status, 204);

    const status = await callDub({ bucket, method: "GET", path: DUB_PATH });
    const payload = await status.json();
    assert.equal(payload.lines.length, 9);
    assert.equal(payload.lines.every(({ saved }) => !saved), true);
    const accountObjects = await bucket.list({
      prefix: "personalized-story-art/user-1/",
    });
    assert.equal(accountObjects.objects.length, 10);
    assert.equal(accountObjects.objects.some(({ key }) => key === MARKER_KEY), true);
    assert.equal(accountObjects.objects.every(({ key }) =>
      key.startsWith("personalized-story-art/user-1/")), true);
    await bucket.delete(accountObjects.objects.map(({ key }) => key));
    assert.equal(bucket.stored.size, 0);
  });

  it("removes a new deleting marker when account purge begins during reset", async () => {
    const bucket = createBucket();
    let checks = 0;
    const response = await callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
      pending: async () => ++checks > 1,
    });

    assert.equal(response.status, 409);
    assert.equal(checks, 2);
    assert.equal(bucket.stored.has(MARKER_KEY), false);
    assert.equal(bucket.stored.size, 0);
  });

  it("normalizes type parameters and accepts WebM, MP4, and Ogg signatures", async () => {
    const bucket = createBucket();
    const uploads = [
      ["line-1", "audio/webm; codecs=opus", [0x1a, 0x45, 0xdf, 0xa3]],
      ["line-2", "audio/mp4; codecs=mp4a.40.2", [0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70]],
      ["line-3", "audio/ogg; codecs=opus", [0x4f, 0x67, 0x67, 0x53]],
    ];

    for (const [lineId, contentType, signature] of uploads) {
      const response = await callDub({
        body: new Uint8Array(signature),
        bucket,
        headers: {
          "Content-Type": contentType,
          "X-Parrot-Guardian-Consent-Version": "guardian-voice-r2-v1",
        },
        method: "PUT",
        path: `${DUB_PATH}/lines/${lineId}`,
      });
      assert.equal(response.status, 201, contentType);
    }
    assert.deepEqual(
      bucket.calls.put.map(({ options }) => options.httpMetadata.contentType),
      ["audio/webm", "audio/mp4", "audio/ogg"],
    );
  });

  it("rejects missing consent, wrong types and mismatched signatures before R2 put", async () => {
    const bucket = createBucket();
    const base = { bucket, method: "PUT", path: `${DUB_PATH}/lines/line-1` };
    const cases = [
      {
        expected: 400,
        name: "missing consent",
        request: { body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), headers: { "Content-Type": "audio/webm" } },
      },
      {
        expected: 400,
        name: "wrong consent",
        request: { body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), headers: { ...CONSENT_HEADERS, "X-Parrot-Guardian-Consent-Version": "guardian-voice-r1-v1" } },
      },
      {
        expected: 415,
        name: "unsupported type",
        request: { body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), headers: { ...CONSENT_HEADERS, "Content-Type": "audio/wav" } },
      },
      {
        expected: 415,
        name: "WebM mismatch",
        request: { body: new Uint8Array([1, 2, 3, 4]), headers: CONSENT_HEADERS },
      },
      {
        expected: 415,
        name: "MP4 mismatch",
        request: { body: new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3, 4]), headers: { ...CONSENT_HEADERS, "Content-Type": "audio/mp4" } },
      },
      {
        expected: 415,
        name: "Ogg mismatch",
        request: { body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), headers: { ...CONSENT_HEADERS, "Content-Type": "audio/ogg" } },
      },
    ];

    for (const testCase of cases) {
      const response = await callDub({ ...base, ...testCase.request });
      assert.equal(response.status, testCase.expected, testCase.name);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    }
    assert.equal(bucket.calls.put.length, 0);
  });

  it("rejects unknown dub and line IDs, empty clips, and oversized clips before R2 put", async () => {
    const bucket = createBucket();
    const base = { bucket, headers: CONSENT_HEADERS, method: "PUT" };
    const cases = [
      [404, "/api/dubs/not-the-ducks/lines/line-1", new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])],
      [404, `${DUB_PATH}/lines/line-99`, new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])],
      [400, `${DUB_PATH}/lines/line-1`, new Uint8Array()],
      [413, `${DUB_PATH}/lines/line-1`, new Uint8Array(512 * 1024 + 1)],
    ];

    for (const [status, path, body] of cases) {
      const response = await callDub({ ...base, body, path });
      assert.equal(response.status, status, path);
    }
    assert.equal(bucket.calls.put.length, 0);
  });

  it("blocks uploads before R2 when account deletion is already pending", async () => {
    const bucket = createBucket();
    let checks = 0;

    const response = await callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
      pending: async () => {
        checks += 1;
        return true;
      },
    });

    assert.equal(response.status, 409);
    assert.equal(checks, 1);
    assert.equal(bucket.calls.put.length, 0);
  });

  it("deletes a just-written object when account deletion begins during put", async () => {
    const bucket = createBucket();
    let checks = 0;

    const response = await callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
      pending: async () => ++checks > 1,
    });

    assert.equal(response.status, 409);
    assert.equal(bucket.calls.put.length, 1);
    assert.deepEqual(bucket.calls.delete, [
      "personalized-story-art/user-1/learner-dubs/five-little-ducks-v1/line-1.audio",
    ]);
    assert.equal(bucket.stored.size, 0);
  });

  it("returns private 404s for missing audio and route mismatches", async () => {
    for (const path of [
      `${DUB_PATH}/lines/line-1/audio`,
      `${DUB_PATH}/lines/line-99/audio`,
      "/api/dubs/not-the-ducks",
      `${DUB_PATH}/extra`,
    ]) {
      const response = await callDub({ method: "GET", path });
      assert.equal(response.status, 404, path);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    }
  });

  it("returns 405 for unsupported methods on each supported route shape", async () => {
    for (const [method, path] of [
      ["POST", DUB_PATH],
      ["GET", `${DUB_PATH}/lines/line-1`],
      ["PUT", `${DUB_PATH}/lines/line-1/audio`],
      ["DELETE", `${DUB_PATH}/lines/line-1/audio`],
    ]) {
      const response = await callDub({ method, path });
      assert.equal(response.status, 405, `${method} ${path}`);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    }
  });
});
