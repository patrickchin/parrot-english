import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ReadableStream } from "node:stream/web";
import { describe, it } from "node:test";
import { TextEncoder } from "node:util";
import { createDatabase } from "../worker/database.ts";
import { createDubConsentRepository } from "../worker/dub-consent.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";
import { DUB_DEFINITIONS } from "../src/dubbing/rhyme-catalog.ts";

const DUB_PATH = "/api/dubs/five-little-ducks-v2";
const OLD_DUB_PATH = "/api/dubs/old-macdonald-v1";
const CURRENT_CONSENT_VERSION = "guardian-voice-r2-v2";
const CONSENT_HEADERS = {
  "Content-Type": "audio/webm",
};
const LINE_IDS = Array.from({ length: 24 }, (_, index) => `line-${index + 1}`);
const OLD_LINE_IDS = Array.from(
  { length: 35 },
  (_, index) => `old-macdonald-v1-line-${index + 1}`,
);
const ACCOUNT_PREFIX = "accounts/guardian@example.test/";
const OWNER_RECORDINGS_PREFIX =
  `${ACCOUNT_PREFIX}learners/Mary/recordings/`;
const OWNER_PREFIX =
  `${OWNER_RECORDINGS_PREFIX}nursery-rhymes/five-little-ducks-v2/`;
const MARKER_KEY = `${OWNER_PREFIX}.dub-generation`;
const slotKey = (lineId) => `${OWNER_PREFIX}${lineId}.audio`;
const OLD_OWNER_PREFIX =
  `${OWNER_RECORDINGS_PREFIX}nursery-rhymes/old-macdonald-v1/`;
const OLD_MARKER_KEY = `${OLD_OWNER_PREFIX}.dub-generation`;
const oldSlotKey = (lineId) => `${OLD_OWNER_PREFIX}${lineId}.audio`;
const catalogMarkerKey = (dubId) =>
  `${OWNER_RECORDINGS_PREFIX}nursery-rhymes/${dubId}/.dub-generation`;
const SIBLING_PREFIX =
  `${ACCOUNT_PREFIX}learners/Rose/recordings/nursery-rhymes/five-little-ducks-v2/`;
const siblingSlotKey = (lineId) => `${SIBLING_PREFIX}${lineId}.audio`;
const DEFAULT_IDENTITY = {
  learnerName: "Mia",
  learnerProfileId: "learner-a",
  legacyStorageOwner: true,
  privateMediaName: "Mary",
  sessionId: "session-1",
  userEmail: "guardian@example.test",
  userId: "user-1",
  userName: "Parent",
};

function encoded(value) {
  return new TextEncoder().encode(JSON.stringify(value));
}

function fenceBytes(kind, generation, state) {
  return encoded(["parrot-dub-fence-v1", kind, generation, state]);
}

function envelopedAudio(generation, audio, uploadNonce = "upload-1") {
  const prefix = encoded(["parrot-dub-audio-v2", generation, uploadNonce]);
  const bytes = new Uint8Array(prefix.byteLength + audio.byteLength);
  bytes.set(prefix);
  bytes.set(audio, prefix.byteLength);
  return { bytes, payloadOffset: prefix.byteLength };
}

function readyMarker(generation = "consent-1") {
  return {
    bytes: fenceBytes("marker", generation, "ready"),
    options: { customMetadata: { generation, state: "ready" } },
    uploaded: new Date("2026-08-25T09:00:00.000Z"),
  };
}

function v2AudioObject({
  audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1]),
  consentGeneration = "consent-1",
  generation = consentGeneration,
  lineId,
  recordedAt = "2026-08-25T09:00:00.000Z",
  uploadNonce = `upload-${lineId}`,
} = {}) {
  const envelope = envelopedAudio(generation, audio, uploadNonce);
  return {
    bytes: envelope.bytes,
    options: {
      customMetadata: {
        generation,
        guardianConsentGeneration: consentGeneration,
        guardianConsentVersion: CURRENT_CONSENT_VERSION,
        lineId,
        payloadOffset: String(envelope.payloadOffset),
        recordedAt,
        state: "audio",
        uploadNonce,
      },
      httpMetadata: { contentType: "audio/webm" },
    },
    uploaded: new Date("2026-08-25T09:00:00.000Z"),
  };
}

function storedAudio(item) {
  return item.bytes.subarray(Number(item.options.customMetadata.payloadOffset ?? 0));
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

function createClock(iso = "2026-08-25T10:00:00.000Z") {
  let milliseconds = Date.parse(iso);
  const waits = [];
  return {
    advance(delay) {
      milliseconds += delay;
    },
    now: () => new Date(milliseconds),
    waits,
    wait: async (delay) => {
      waits.push(delay);
      milliseconds += delay;
    },
  };
}

function createConsentRepository(
  initial = {
    state: "granted",
    consentVersion: CURRENT_CONSENT_VERSION,
    grantGeneration: "consent-1",
    grantedAt: new Date("2026-08-25T08:00:00.000Z"),
  },
) {
  let current = initial;
  return {
    async beginRevocation() {
      if (current.state === "granted") {
        current = {
          state: "revoking",
          grantGeneration: current.grantGeneration,
        };
      }
      return current;
    },
    async finishRevocation(_userId, generation) {
      if (
        current.state === "revoking" &&
        current.grantGeneration === generation
      ) {
        current = { state: "not_granted" };
      }
    },
    async grant() {
      if (current.state === "revoking") throw new Error("dub_consent_revoking");
      current = {
        state: "granted",
        consentVersion: CURRENT_CONSENT_VERSION,
        grantGeneration: "consent-1",
        grantedAt: new Date("2026-08-25T08:00:00.000Z"),
      };
      return current;
    },
    async requireCurrentGrant(_userId, expectedGeneration) {
      return current.state === "granted" &&
          current.consentVersion === CURRENT_CONSENT_VERSION &&
          (expectedGeneration === undefined ||
            current.grantGeneration === expectedGeneration)
        ? current
        : null;
    },
    set(next) {
      current = next;
    },
    async status() {
      return current;
    },
  };
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

function assertOldResetTombstones(bucket, generation) {
  const marker = bucket.stored.get(OLD_MARKER_KEY);
  assert.deepEqual(marker?.bytes, fenceBytes("marker", generation, "ready"));
  assert.deepEqual(marker?.options.customMetadata, {
    generation,
    state: "ready",
  });
  for (const lineId of OLD_LINE_IDS) {
    const item = bucket.stored.get(oldSlotKey(lineId));
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

function createBucket(seed = [], {
  enforceWriteRate = false,
  now = () => new Date("2026-08-25T10:00:00.000Z"),
} = {}) {
  const stored = new Map(seed.map(([key, value], index) => [
    key,
    {
      ...value,
      bytes: value.bytes ?? new Uint8Array(),
      etag: value.etag ?? contentEtag(value.bytes ?? new Uint8Array()),
      version: value.version ?? `seed-version-${index + 1}`,
    },
  ]));
  const calls = {
    delete: [],
    get: [],
    getOptions: [],
    head: [],
    list: [],
    put: [],
  };
  const lastWriteAt = new Map(seed
    .filter(([, value]) => value.uploaded)
    .map(([key, value]) => [key, value.uploaded.getTime()]));
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
    async get(key, options = {}) {
      calls.get.push(key);
      calls.getOptions.push({ key, options });
      const item = stored.get(key);
      if (!item) return null;
      if (
        options.onlyIf?.etagMatches !== undefined &&
        item.etag !== options.onlyIf.etagMatches
      ) {
        return object(key, item);
      }
      const range = options.range;
      const offset = range
        ? ("suffix" in range
            ? Math.max(0, item.bytes.byteLength - range.suffix)
            : (range.offset ?? 0))
        : 0;
      const bytes = range
        ? item.bytes.subarray(
            offset,
            range.length === undefined
              ? undefined
              : offset + range.length,
          )
        : item.bytes;
      const chunks = range ? [bytes] : (item.chunks ?? [bytes]);
      return {
        ...object(key, item),
        async arrayBuffer() {
          return bytes.slice().buffer;
        },
        body: new ReadableStream({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
          },
        }),
        async bytes() {
          return bytes.slice();
        },
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
          .map(([key, value]) => object(key, value)),
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
      const writtenAt = now();
      if (
        enforceWriteRate &&
        lastWriteAt.has(key) &&
        writtenAt.getTime() - lastWriteAt.get(key) < 1_000
      ) {
        throw new Error("put: TooManyRequests (10058)");
      }
      const item = {
        bytes: bytes === null ? new Uint8Array() : new Uint8Array(bytes),
        etag: contentEtag(bytes === null ? new Uint8Array() : new Uint8Array(bytes)),
        options,
        uploaded: writtenAt,
        version: `version-${++versionSequence}`,
      };
      stored.set(key, item);
      lastWriteAt.set(key, writtenAt.getTime());
      return object(key, item);
    },
  };
}

async function callDub({
  body,
  bucket = createBucket(),
  consentRepository = createConsentRepository(),
  database = {},
  headers = {},
  identity,
  method,
  path,
  pending = async () => false,
  generation = () => "generation-1",
  nonce = () => "upload-1",
  userEmail = "guardian@example.test",
  wait = async () => {},
  userId = "user-1",
}) {
  const { handleDubRequest } = await import("../worker/dubs.ts");
  const init = body === undefined
    ? { headers, method }
    : { body, headers, method };
  return handleDubRequest({
    database,
    env: { PRIVATE_MEDIA_BUCKET: bucket },
    identity: identity ?? { ...DEFAULT_IDENTITY, userEmail, userId },
    request: new Request(`https://example.test${path}`, init),
  }, {
    consentRepository,
    createGeneration: generation,
    createUploadNonce: nonce,
    isDeletionPending: pending,
    now: () => new Date("2026-08-25T10:00:00.000Z"),
    wait,
  });
}

describe("private learner dub API", () => {
  it("isolates sibling consent, status, storage keys, and reset fences", async () => {
    const state = createTestD1Database();
    try {
      const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
      state.sqlite.prepare(
        `INSERT INTO user
          (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
      ).run("user-1", "Guardian", "guardian@example.test", timestamp, timestamp);
      const insertLearner = state.sqlite.prepare(
        `INSERT INTO learner_profile
          (id, auth_user_id, name, private_media_name, name_key,
           onboarding_status, legacy_storage_owner)
         VALUES (?, ?, ?, ?, ?, 'not_started', ?)`,
      );
      insertLearner.run("learner-a", "user-1", "Mia", "Mary", "mia", 1);
      insertLearner.run("learner-b", "user-1", "Leo", "Rose", "leo", 0);
      const database = createDatabase(state.d1);
      let consentSequence = 0;
      const consentRepository = createDubConsentRepository(database, {
        createGeneration: () => `consent-${++consentSequence}`,
        now: () => new Date("2026-08-25T08:00:00.000Z"),
      });
      const ownerIdentity = {
        learnerName: "Mia",
        learnerProfileId: "learner-a",
        legacyStorageOwner: true,
        privateMediaName: "Mary",
        sessionId: "legacy-session",
        userEmail: "guardian@example.test",
        userId: "user-1",
        userName: "Guardian",
      };
      const siblingIdentity = {
        learnerName: "Leo",
        learnerProfileId: "learner-b",
        legacyStorageOwner: false,
        privateMediaName: "Rose",
        sessionId: "new-session",
        userEmail: "guardian@example.test",
        userId: "user-1",
        userName: "Guardian",
      };
      const ownerKey = slotKey("line-1");
      const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1]);
      const envelope = envelopedAudio("consent-1", audio);
      const bucket = createBucket([
        [MARKER_KEY, {
          bytes: fenceBytes("marker", "consent-1", "ready"),
          options: {
            customMetadata: { generation: "consent-1", state: "ready" },
          },
          uploaded: new Date("2026-08-25T07:00:00.000Z"),
        }],
        [ownerKey, {
          bytes: envelope.bytes,
          options: {
            customMetadata: {
              generation: "consent-1",
              guardianConsentGeneration: "consent-1",
              guardianConsentVersion: CURRENT_CONSENT_VERSION,
              lineId: "line-1",
              payloadOffset: String(envelope.payloadOffset),
              recordedAt: "2026-08-25T07:00:00.000Z",
              state: "audio",
              uploadNonce: "upload-1",
            },
            httpMetadata: { contentType: "audio/webm" },
          },
          uploaded: new Date("2026-08-25T07:00:00.000Z"),
        }],
      ]);

      await consentRepository.grant(ownerIdentity);
      const ownerStatus = await (await callDub({
        bucket,
        consentRepository,
        database,
        identity: ownerIdentity,
        method: "GET",
        path: DUB_PATH,
      })).json();
      const siblingStatus = await (await callDub({
        bucket,
        consentRepository,
        database,
        identity: siblingIdentity,
        method: "GET",
        path: DUB_PATH,
      })).json();
      assert.equal(ownerStatus.lines.filter(({ saved }) => saved).length, 1);
      assert.equal(siblingStatus.lines.filter(({ saved }) => saved).length, 0);
      assert.equal(siblingStatus.consentState, "granted");

      const upload = await callDub({
        body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 2]),
        bucket,
        consentRepository,
        database,
        headers: CONSENT_HEADERS,
        identity: siblingIdentity,
        method: "PUT",
        path: `${DUB_PATH}/lines/line-1`,
      });
      assert.equal(upload.status, 201);
      const siblingAudioPut = bucket.calls.put.find(
        ({ options }) => options.customMetadata?.state === "audio",
      );
      assert.match(
        siblingAudioPut.key,
        /\/learners\/Rose\/recordings\/nursery-rhymes\//,
      );
      assert.ok(await bucket.head(ownerKey));
      assert.ok(await bucket.head(siblingSlotKey("line-1")));

      const reset = await callDub({
        bucket,
        consentRepository,
        database,
        generation: () => "sibling-reset",
        identity: siblingIdentity,
        method: "DELETE",
        path: DUB_PATH,
      });
      assert.equal(reset.status, 204);
      assert.equal(
        (await bucket.head(ownerKey)).customMetadata?.state,
        "audio",
      );
      assert.equal(
        (await bucket.head(siblingSlotKey("line-1"))).customMetadata?.state,
        "tombstone",
      );
      const ownerAfterReset = await (await callDub({
        bucket,
        consentRepository,
        database,
        identity: ownerIdentity,
        method: "GET",
        path: DUB_PATH,
      })).json();
      assert.equal(
        ownerAfterReset.lines.filter(({ saved }) => saved).length,
        1,
      );
    } finally {
      state.close();
    }
  });

  it("lets automatic recording access take over an incomplete deleting marker", async () => {
    const state = createTestD1Database();
    try {
      const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
      state.sqlite.prepare(
        `INSERT INTO user
          (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
      ).run("user-1", "Guardian", "guardian@example.test", timestamp, timestamp);
      state.sqlite.prepare(
        `INSERT INTO learner_profile
          (id, auth_user_id, name, onboarding_status, legacy_storage_owner)
         VALUES (?, ?, ?, 'not_started', 1)`,
      ).run("learner-a", "user-1", "Mia");
      const consentRepository = createDubConsentRepository(
        createDatabase(state.d1),
        {
          createGeneration: () => "consent-1",
          now: () => new Date("2026-08-25T08:00:00.000Z"),
        },
      );
      const bucket = createBucket([[MARKER_KEY, {
        bytes: fenceBytes("marker", "interrupted-reset", "deleting"),
        options: {
          customMetadata: { generation: "interrupted-reset", state: "deleting" },
        },
        uploaded: new Date("2026-08-25T07:00:00.000Z"),
      }]]);

      const initial = await callDub({
        bucket,
        consentRepository,
        method: "GET",
        path: DUB_PATH,
      });
      assert.equal(initial.status, 409);
      assert.equal((await initial.json()).error, "dub_reset_in_progress");
      assert.equal(bucket.calls.list.length, 0);
      assert.equal(
        (await consentRepository.status(DEFAULT_IDENTITY)).state,
        "granted",
      );

      const cleanup = await callDub({
        bucket,
        consentRepository,
        generation: () => "reset-2",
        method: "DELETE",
        path: DUB_PATH,
      });
      assert.equal(cleanup.status, 204);
      assert.deepEqual(await consentRepository.status(DEFAULT_IDENTITY), {
        state: "not_granted",
      });
      assertResetTombstones(bucket, "reset-2");

      const final = await callDub({
        bucket,
        consentRepository,
        method: "GET",
        path: DUB_PATH,
      });
      assert.equal(final.status, 200);
      assert.equal((await final.json()).consentState, "granted");
    } finally {
      state.close();
    }
  });

  it("automatically grants missing recording access when status loads", async () => {
    const bucket = createBucket();
    const consentRepository = createConsentRepository({ state: "not_granted" });
    const response = await callDub({
      bucket,
      consentRepository,
      method: "GET",
      path: DUB_PATH,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      complete: false,
      consentState: "granted",
      dubId: "five-little-ducks-v2",
      guardianConsentVersion: CURRENT_CONSENT_VERSION,
      lines: LINE_IDS.map((id) => ({ id, recordedAt: null, saved: false })),
      recordingEnabled: true,
    });
    assert.equal((await consentRepository.status()).state, "granted");
    assert.equal(bucket.calls.list.length, 0);
  });

  it("keeps recording unavailable only while deletion is still running", async () => {
    const bucket = createBucket();
    const consentRepository = createConsentRepository({
      state: "revoking",
      grantGeneration: "consent-1",
    });
    const response = await callDub({
      bucket,
      consentRepository,
      method: "GET",
      path: DUB_PATH,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      complete: false,
      consentState: "revoking",
      dubId: "five-little-ducks-v2",
      guardianConsentVersion: CURRENT_CONSENT_VERSION,
      lines: LINE_IDS.map((id) => ({ id, recordedAt: null, saved: false })),
      recordingEnabled: false,
    });
    assert.equal(bucket.calls.list.length, 0);
  });

  it("rejects upload and audio without a current durable grant", async () => {
    for (const consentState of ["not_granted", "revoking"]) {
      for (const spoofedVersion of [
        "guardian-voice-r2-v1",
        CURRENT_CONSENT_VERSION,
      ]) {
        const bucket = createBucket();
        const consentRepository = createConsentRepository(
          consentState === "revoking"
            ? { state: "revoking", grantGeneration: "consent-1" }
            : { state: "not_granted" },
        );
        const upload = await callDub({
          body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
          bucket,
          consentRepository,
          headers: {
            ...CONSENT_HEADERS,
            "X-Parrot-Guardian-Consent-Version": spoofedVersion,
          },
          method: "PUT",
          path: `${DUB_PATH}/lines/line-1`,
        });
        const audio = await callDub({
          bucket,
          consentRepository,
          method: "GET",
          path: `${DUB_PATH}/lines/line-1/audio`,
        });

        const expected = consentState === "revoking" ? 409 : 403;
        const error = consentState === "revoking"
          ? "dub_consent_revoking"
          : "dubbing_not_enabled";
        assert.equal(upload.status, expected, `${consentState}: ${spoofedVersion}`);
        assert.equal((await upload.json()).error, error, consentState);
        assert.equal(audio.status, expected, consentState);
        assert.equal((await audio.json()).error, error, consentState);
        assert.equal(bucket.calls.put.length, 0, consentState);
        assert.equal(bucket.calls.head.length, 0, consentState);
      }
    }
  });

  it("fails status and audio closed when consent revokes during R2 work", async () => {
    const statusConsent = createConsentRepository();
    const statusBucket = createBucket([
      [MARKER_KEY, readyMarker()],
      [slotKey("line-1"), v2AudioObject({ lineId: "line-1" })],
    ]);
    const list = statusBucket.list.bind(statusBucket);
    statusBucket.list = async (...args) => {
      const page = await list(...args);
      statusConsent.set({ state: "revoking", grantGeneration: "consent-1" });
      return page;
    };

    const status = await callDub({
      bucket: statusBucket,
      consentRepository: statusConsent,
      method: "GET",
      path: DUB_PATH,
    });
    const statusPayload = await status.json();
    assert.equal(status.status, 200);
    assert.equal(statusPayload.consentState, "revoking");
    assert.equal(statusPayload.recordingEnabled, false);
    assert.deepEqual(
      statusPayload.lines.filter(({ saved }) => saved),
      [],
    );

    const audioConsent = createConsentRepository();
    const audioBucket = createBucket([
      [MARKER_KEY, readyMarker()],
      [slotKey("line-1"), v2AudioObject({ lineId: "line-1" })],
    ]);
    const get = audioBucket.get.bind(audioBucket);
    audioBucket.get = async (...args) => {
      const object = await get(...args);
      audioConsent.set({ state: "revoking", grantGeneration: "consent-1" });
      return object;
    };

    const audio = await callDub({
      bucket: audioBucket,
      consentRepository: audioConsent,
      method: "GET",
      path: `${DUB_PATH}/lines/line-1/audio`,
    });
    assert.equal(audio.status, 403);
    assert.equal((await audio.json()).error, "dubbing_not_enabled");
    assert.equal(audioBucket.calls.get.length, 2);
  });

  it("grants only the exact bounded guardian consent object", async () => {
    const consentRepository = createConsentRepository({ state: "not_granted" });
    const response = await callDub({
      body: JSON.stringify({
        accepted: true,
        consentVersion: CURRENT_CONSENT_VERSION,
      }),
      consentRepository,
      headers: { "Content-Type": "application/json" },
      method: "PUT",
      path: `${DUB_PATH}/consent`,
    });

    assert.equal(response.status, 204);
    assert.equal(
      (await consentRepository.status()).state,
      "granted",
    );

    for (const body of [
      "not-json",
      JSON.stringify({ accepted: false, consentVersion: CURRENT_CONSENT_VERSION }),
      JSON.stringify({ accepted: true, consentVersion: "guardian-voice-r2-v1" }),
      JSON.stringify({
        accepted: true,
        consentVersion: CURRENT_CONSENT_VERSION,
        userId: "user-2",
      }),
    ]) {
      const rejected = await callDub({
        body,
        consentRepository: createConsentRepository({ state: "not_granted" }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
        path: `${DUB_PATH}/consent`,
      });
      assert.equal(rejected.status, 400, body);
      assert.equal((await rejected.json()).error, "invalid_request", body);
    }

    const oversized = await callDub({
      body: JSON.stringify({
        accepted: true,
        consentVersion: CURRENT_CONSENT_VERSION,
        padding: "x".repeat(8 * 1024),
      }),
      consentRepository: createConsentRepository({ state: "not_granted" }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
      path: `${DUB_PATH}/consent`,
    });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).error, "payload_too_large");
  });

  it("blocks consent grant before mutation and after a deletion-tombstone race", async () => {
    const body = JSON.stringify({
      accepted: true,
      consentVersion: CURRENT_CONSENT_VERSION,
    });
    const blockedRepository = createConsentRepository({ state: "not_granted" });
    let blockedGrantCalls = 0;
    const blockedGrant = blockedRepository.grant.bind(blockedRepository);
    blockedRepository.grant = async (...args) => {
      blockedGrantCalls += 1;
      return blockedGrant(...args);
    };
    const blocked = await callDub({
      body,
      consentRepository: blockedRepository,
      headers: { "Content-Type": "application/json" },
      method: "PUT",
      path: `${DUB_PATH}/consent`,
      pending: async () => true,
    });

    assert.equal(blocked.status, 409);
    assert.equal((await blocked.json()).error, "account_deletion_pending");
    assert.equal(blockedGrantCalls, 0);

    const racedRepository = createConsentRepository({ state: "not_granted" });
    let pendingChecks = 0;
    const raced = await callDub({
      body,
      consentRepository: racedRepository,
      headers: { "Content-Type": "application/json" },
      method: "PUT",
      path: `${DUB_PATH}/consent`,
      pending: async () => ++pendingChecks === 2,
    });

    assert.equal(raced.status, 409);
    assert.equal((await raced.json()).error, "account_deletion_pending");
    assert.equal(pendingChecks, 2);
    assert.equal((await racedRepository.status()).state, "granted");

    const bucket = createBucket([[slotKey("line-1"), {
      bytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
      options: { httpMetadata: { contentType: "audio/webm" } },
      uploaded: new Date("2026-08-25T09:00:00.000Z"),
    }]]);
    for (const path of [DUB_PATH, `${DUB_PATH}/lines/line-1/audio`]) {
      const response = await callDub({
        bucket,
        consentRepository: racedRepository,
        method: "GET",
        path,
        pending: async () => true,
      });
      assert.equal(response.status, 409, path);
      assert.equal((await response.json()).error, "account_deletion_pending");
    }
    assert.equal(bucket.calls.list.length, 0);
    assert.equal(bucket.calls.head.length, 0);
    assert.equal(bucket.calls.get.length, 0);
  });

  it("fails status closed before R2 work and after a tombstone response race", async () => {
    const blockedBucket = createBucket();
    const blocked = await callDub({
      bucket: blockedBucket,
      method: "GET",
      path: DUB_PATH,
      pending: async () => true,
    });
    assert.equal(blocked.status, 409);
    assert.equal((await blocked.json()).error, "account_deletion_pending");
    assert.equal(blockedBucket.calls.list.length, 0);
    assert.equal(blockedBucket.calls.head.length, 0);

    const racedBucket = createBucket([
      [MARKER_KEY, readyMarker()],
      [slotKey("line-1"), v2AudioObject({ lineId: "line-1" })],
    ]);
    let pendingChecks = 0;
    const raced = await callDub({
      bucket: racedBucket,
      method: "GET",
      path: DUB_PATH,
      pending: async () => ++pendingChecks === 2,
    });
    assert.equal(raced.status, 409);
    assert.equal((await raced.json()).error, "account_deletion_pending");
    assert.equal(pendingChecks, 2);
    assert.equal(racedBucket.calls.list.length, 1);
  });

  it("fails audio closed before R2 work and after a tombstone response race", async () => {
    const seed = [
      [MARKER_KEY, readyMarker()],
      [slotKey("line-1"), v2AudioObject({ lineId: "line-1" })],
    ];
    const blockedBucket = createBucket(seed);
    const blocked = await callDub({
      bucket: blockedBucket,
      method: "GET",
      path: `${DUB_PATH}/lines/line-1/audio`,
      pending: async () => true,
    });
    assert.equal(blocked.status, 409);
    assert.equal((await blocked.json()).error, "account_deletion_pending");
    assert.equal(blockedBucket.calls.head.length, 0);
    assert.equal(blockedBucket.calls.get.length, 0);

    const racedBucket = createBucket(seed);
    let pendingChecks = 0;
    const raced = await callDub({
      bucket: racedBucket,
      method: "GET",
      path: `${DUB_PATH}/lines/line-1/audio`,
      pending: async () => ++pendingChecks === 2,
    });
    assert.equal(raced.status, 409);
    assert.equal((await raced.json()).error, "account_deletion_pending");
    assert.equal(pendingChecks, 2);
    assert.equal(racedBucket.calls.get.length, 2);
  });

  it("blocks regrant while consent cleanup remains in progress", async () => {
    const response = await callDub({
      body: JSON.stringify({
        accepted: true,
        consentVersion: CURRENT_CONSENT_VERSION,
      }),
      consentRepository: createConsentRepository({
        state: "revoking",
        grantGeneration: "consent-1",
      }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
      path: `${DUB_PATH}/consent`,
    });

    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "dub_consent_revoking");
  });

  it("does not write when the captured consent generation is stale before put", async () => {
    const bucket = createBucket();
    const granted = {
      state: "granted",
      consentVersion: CURRENT_CONSENT_VERSION,
      grantGeneration: "consent-1",
      grantedAt: new Date("2026-08-25T08:00:00.000Z"),
    };
    let checks = 0;
    const consentRepository = {
      ...createConsentRepository(granted),
      async requireCurrentGrant(_userId, expectedGeneration) {
        checks += 1;
        return checks === 1 && expectedGeneration === undefined ? granted : null;
      },
    };

    const response = await callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
      bucket,
      consentRepository,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "dubbing_not_enabled");
    assert.equal(checks, 1);
    assert.equal(bucket.calls.put.length, 0);
  });

  it("exactly fences an upload when consent is revoked after the put", async () => {
    const bucket = createBucket();
    const consentRepository = createConsentRepository();
    const put = bucket.put.bind(bucket);
    bucket.put = async (key, bytes, options) => {
      const stored = await put(key, bytes, options);
      if (options?.customMetadata?.state === "audio") {
        consentRepository.set({
          state: "revoking",
          grantGeneration: "consent-1",
        });
      }
      return stored;
    };

    const response = await callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 7]),
      bucket,
      consentRepository,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "dubbing_not_enabled");
    assert.equal(bucket.calls.put.length, 3);
    assert.deepEqual(bucket.calls.put[2].options.onlyIf, {
      etagMatches: contentEtag(bucket.calls.put[1].bytes),
    });
    assert.equal(
      bucket.stored.get(slotKey("line-1")).options.customMetadata.state,
      "consent-revoked",
    );
  });

  it("fences the exact upload when the post-put consent read is uncertain", async () => {
    const bucket = createBucket();
    const granted = {
      state: "granted",
      consentVersion: CURRENT_CONSENT_VERSION,
      grantGeneration: "consent-1",
      grantedAt: new Date("2026-08-25T08:00:00.000Z"),
    };
    let checks = 0;
    const consentRepository = {
      ...createConsentRepository(granted),
      async requireCurrentGrant() {
        checks += 1;
        if (checks === 3) throw new Error("D1 unavailable");
        return granted;
      },
    };

    const response = await callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 8]),
      bucket,
      consentRepository,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "dubbing_not_enabled");
    assert.equal(bucket.calls.put.length, 3);
    assert.deepEqual(bucket.calls.put[2].options.onlyIf, {
      etagMatches: contentEtag(bucket.calls.put[1].bytes),
    });
    assert.equal(
      bucket.stored.get(slotKey("line-1")).options.customMetadata.state,
      "consent-revoked",
    );
  });

  it("never reads current-version audio from an old consent generation", async () => {
    const body = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 9]);
    const envelope = envelopedAudio("ready-1", body, "upload-old");
    const bucket = createBucket([
      [MARKER_KEY, readyMarker("ready-1")],
      [slotKey("line-1"), {
        bytes: envelope.bytes,
        options: {
          customMetadata: {
            generation: "ready-1",
            guardianConsentGeneration: "consent-old",
            guardianConsentVersion: CURRENT_CONSENT_VERSION,
            lineId: "line-1",
            payloadOffset: String(envelope.payloadOffset),
            recordedAt: "2026-08-25T09:00:00.000Z",
            state: "audio",
            uploadNonce: "upload-old",
          },
          httpMetadata: { contentType: "audio/webm" },
        },
        uploaded: new Date("2026-08-25T09:00:00.000Z"),
      }],
      [slotKey("line-2"), {
        bytes: body,
        options: {
          customMetadata: {
            guardianConsentGeneration: "consent-old",
            guardianConsentVersion: CURRENT_CONSENT_VERSION,
          },
          httpMetadata: { contentType: "audio/webm" },
        },
        uploaded: new Date("2026-08-25T09:00:00.000Z"),
      }],
    ]);
    const consentRepository = createConsentRepository({
      state: "granted",
      consentVersion: CURRENT_CONSENT_VERSION,
      grantGeneration: "consent-new",
      grantedAt: new Date("2026-08-25T10:00:00.000Z"),
    });

    const status = await callDub({
      bucket,
      consentRepository,
      method: "GET",
      path: DUB_PATH,
    });
    const audio = await callDub({
      bucket,
      consentRepository,
      method: "GET",
      path: `${DUB_PATH}/lines/line-1/audio`,
    });

    assert.deepEqual(
      (await status.json()).lines.slice(0, 2).map(({ saved }) => saved),
      [false, false],
    );
    assert.equal(audio.status, 404);
  });

  it("stores and privately streams one encoded owner-scoped WebM slot", async () => {
    const bucket = createBucket();
    const body = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2]);
    const envelope = envelopedAudio("consent-1", body, "upload-1");

    const upload = await callDub({
      body,
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
      userEmail: "guardian/one@example.test",
    });

    assert.equal(upload.status, 201);
    assert.equal(upload.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await upload.json(), {
      lineId: "line-1",
      recordedAt: "2026-08-25T10:00:00.000Z",
    });
    assert.equal(bucket.calls.put.length, 2);
    assert.deepEqual(bucket.calls.put[0], {
      bytes: fenceBytes("marker", "consent-1", "ready"),
      key: "accounts/guardian%2Fone@example.test/learners/Mary/recordings/nursery-rhymes/five-little-ducks-v2/.dub-generation",
      options: {
        customMetadata: { generation: "consent-1", state: "ready" },
        onlyIf: { etagDoesNotMatch: "*" },
      },
    });
    assert.deepEqual(bucket.calls.put[1], {
      bytes: envelope.bytes,
      key: "accounts/guardian%2Fone@example.test/learners/Mary/recordings/nursery-rhymes/five-little-ducks-v2/line-1.audio",
      options: {
        customMetadata: {
          generation: "consent-1",
          guardianConsentGeneration: "consent-1",
          guardianConsentVersion: CURRENT_CONSENT_VERSION,
          lineId: "line-1",
          payloadOffset: String(envelope.payloadOffset),
          recordedAt: "2026-08-25T10:00:00.000Z",
          state: "audio",
          uploadNonce: "upload-1",
        },
        httpMetadata: { contentType: "audio/webm" },
        onlyIf: { etagDoesNotMatch: "*" },
      },
    });

    const asset = await callDub({
      bucket,
      method: "GET",
      path: `${DUB_PATH}/lines/line-1/audio`,
      userEmail: "guardian/one@example.test",
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
      userEmail: "guardian/one@example.test",
    });
    const statusPayload = await status.json();
    assert.equal(statusPayload.lines[0].saved, true);
    assert.equal(statusPayload.lines[0].recordedAt, "2026-08-25T10:00:00.000Z");
  });

  it("stores validated learner peak bars atomically with the audio slot", async () => {
    const bucket = createBucket();
    const body = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2]);
    const peakBytes = Array.from({ length: 32 }, (_, index) => index * 8);
    const encodedPeakBars = JSON.stringify(peakBytes);

    const upload = await callDub({
      body,
      bucket,
      headers: {
        ...CONSENT_HEADERS,
        "X-Parrot-Dub-Peak-Bars": encodedPeakBars,
      },
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
    });

    assert.equal(upload.status, 201);
    assert.deepEqual((await upload.json()).peakBars, peakBytes.map((peak) => peak / 255));
    assert.equal(
      bucket.calls.put.find(({ options }) => options.customMetadata?.state === "audio")
        .options.customMetadata.peakBars,
      encodedPeakBars,
    );

    const status = await callDub({ bucket, method: "GET", path: DUB_PATH });
    assert.deepEqual(
      (await status.json()).lines[0].peakBars,
      peakBytes.map((peak) => peak / 255),
    );
  });

  it("rejects malformed peak-bar headers before storing audio", async () => {
    const bucket = createBucket();
    const response = await callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1]),
      bucket,
      headers: {
        ...CONSENT_HEADERS,
        "X-Parrot-Dub-Peak-Bars": JSON.stringify([1, 2]),
      },
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "invalid_peak_bars");
    assert.equal(bucket.calls.put.length, 0);
  });

  it("accepts line 24 and rejects line 25 at the v2 route boundary", async () => {
    const bucket = createBucket();
    const body = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1]);

    const accepted = await callDub({
      body,
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-24`,
    });
    const rejected = await callDub({
      body,
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-25`,
    });

    assert.equal(accepted.status, 201);
    assert.equal((await accepted.json()).lineId, "line-24");
    assert.equal(rejected.status, 404);
    assert.equal(bucket.calls.put.length, 2);
  });

  it("writes Old MacDonald uploads only into the Old MacDonald namespace", async () => {
    const bucket = createBucket();

    const response = await callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 5]),
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${OLD_DUB_PATH}/lines/old-macdonald-v1-line-1`,
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      lineId: "old-macdonald-v1-line-1",
      recordedAt: "2026-08-25T10:00:00.000Z",
    });
    assert.equal(bucket.stored.has(oldSlotKey("old-macdonald-v1-line-1")), true);
    assert.equal(bucket.stored.has(slotKey("line-1")), false);
    assert.equal(
      bucket.calls.put.at(-1)?.key,
      oldSlotKey("old-macdonald-v1-line-1"),
    );
  });

  it("returns all canonical status rows and safely derives recorded times", async () => {
    const prefix = OWNER_PREFIX;
    const bucket = createBucket([
      [MARKER_KEY, readyMarker()],
      [`${prefix}line-1.audio`, {
        ...v2AudioObject({ lineId: "line-1" }),
      }],
      [`${prefix}line-2.audio`, {
        ...v2AudioObject({ lineId: "line-2", recordedAt: "not-a-date" }),
        uploaded: new Date("2026-08-25T09:02:00.000Z"),
      }],
      [`${prefix}line-99.audio`, {
        ...v2AudioObject({ lineId: "line-99" }),
      }],
    ]);

    const response = await callDub({ bucket, method: "GET", path: DUB_PATH });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await response.json(), {
      complete: false,
      consentState: "granted",
      dubId: "five-little-ducks-v2",
      guardianConsentVersion: CURRENT_CONSENT_VERSION,
      lines: LINE_IDS.map((id, index) => ({
        id,
        recordedAt: index === 0
          ? "2026-08-25T09:00:00.000Z"
          : index === 1
            ? "2026-08-25T09:02:00.000Z"
            : null,
        saved: index < 2,
      })),
      recordingEnabled: true,
    });
    assert.deepEqual(bucket.calls.list, [{
      include: ["customMetadata"],
      prefix,
    }]);
  });

  it("returns all Old MacDonald status rows under its own namespace", async () => {
    const bucket = createBucket([
      [OLD_MARKER_KEY, readyMarker()],
      [oldSlotKey("old-macdonald-v1-line-1"), {
        ...v2AudioObject({ lineId: "old-macdonald-v1-line-1" }),
      }],
      [oldSlotKey("old-macdonald-v1-line-2"), {
        ...v2AudioObject({
          lineId: "old-macdonald-v1-line-2",
          recordedAt: "not-a-date",
        }),
        uploaded: new Date("2026-08-25T09:02:00.000Z"),
      }],
      [slotKey("line-1"), {
        ...v2AudioObject({ lineId: "line-1" }),
      }],
    ]);

    const response = await callDub({ bucket, method: "GET", path: OLD_DUB_PATH });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      complete: false,
      consentState: "granted",
      dubId: "old-macdonald-v1",
      guardianConsentVersion: CURRENT_CONSENT_VERSION,
      lines: OLD_LINE_IDS.map((id, index) => ({
        id,
        recordedAt: index === 0
          ? "2026-08-25T09:00:00.000Z"
          : index === 1
            ? "2026-08-25T09:02:00.000Z"
            : null,
        saved: index < 2,
      })),
      recordingEnabled: true,
    });
    assert.deepEqual(bucket.calls.list, [{
      include: ["customMetadata"],
      prefix: OLD_OWNER_PREFIX,
    }]);
  });

  it("reports complete only when every fixed slot exists", async () => {
    const bucket = createBucket([
      [MARKER_KEY, readyMarker()],
      ...LINE_IDS.map((id) => [slotKey(id), v2AudioObject({ lineId: id })]),
    ]);

    const response = await callDub({ bucket, method: "GET", path: DUB_PATH });
    assert.equal((await response.json()).complete, true);
  });

  it("resets every fixed slot to current-generation tombstones", async () => {
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

  it("treats dub deletion as shared revocation across current rhyme namespaces", async () => {
    const bucket = createBucket();

    const response = await callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: OLD_DUB_PATH,
    });

    assert.equal(response.status, 204);
    assertResetTombstones(bucket, "reset-1");
    assertOldResetTombstones(bucket, "reset-1");
  });

  it("keeps revoking state after failed R2 cleanup and finishes it on retry", async () => {
    const bucket = createBucket();
    const consentRepository = createConsentRepository();
    const put = bucket.put.bind(bucket);
    let failCleanup = true;
    bucket.put = async (key, bytes, options) => {
      if (
        failCleanup &&
        key === slotKey("line-5") &&
        options?.customMetadata?.state === "tombstone"
      ) {
        failCleanup = false;
        throw new Error("R2 unavailable");
      }
      return put(key, bytes, options);
    };

    await assert.rejects(
      callDub({
        bucket,
        consentRepository,
        generation: () => "reset-1",
        method: "DELETE",
        path: DUB_PATH,
      }),
      /R2 unavailable/,
    );
    assert.equal((await consentRepository.status()).state, "revoking");

    const retry = await callDub({
      bucket,
      consentRepository,
      generation: () => "reset-2",
      method: "DELETE",
      path: DUB_PATH,
    });
    assert.equal(retry.status, 204);
    assert.equal((await consentRepository.status()).state, "not_granted");
    assertResetTombstones(bucket, "reset-2");
  });

  it("paces recent slot overwrites and reset marker finalization for R2 hot keys", async () => {
    const clock = createClock();
    const bucket = createBucket([], {
      enforceWriteRate: true,
      now: clock.now,
    });
    assert.equal((await callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1]),
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
      wait: clock.wait,
    })).status, 201);

    const reset = await callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
      wait: clock.wait,
    });

    assert.equal(reset.status, 204);
    assert.equal(clock.waits.length >= 2, true);
    assert.equal(clock.waits.every((delay) => delay >= 1_000), true);
    assertResetTombstones(bucket, "reset-1");
  });

  it("retries an R2 10058 while finalizing the reset marker it still owns", async () => {
    const clock = createClock();
    const bucket = createBucket([], { now: clock.now });
    const put = bucket.put.bind(bucket);
    let failReady = true;
    bucket.put = async (key, bytes, options) => {
      if (
        failReady &&
        key === MARKER_KEY &&
        options?.customMetadata?.state === "ready"
      ) {
        failReady = false;
        throw new Error("put: TooManyRequests (10058)");
      }
      return put(key, bytes, options);
    };

    const response = await callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
      wait: clock.wait,
    });

    assert.equal(response.status, 204);
    assert.equal(clock.waits.length >= 2, true);
    assertResetTombstones(bucket, "reset-1");
  });

  it("paces takeover of a recently written deleting marker", async () => {
    const clock = createClock();
    const bucket = createBucket([[MARKER_KEY, {
      bytes: fenceBytes("marker", "reset-1", "deleting"),
      options: {
        customMetadata: { generation: "reset-1", state: "deleting" },
      },
      uploaded: clock.now(),
    }]], {
      enforceWriteRate: true,
      now: clock.now,
    });

    const response = await callDub({
      bucket,
      generation: () => "reset-2",
      method: "DELETE",
      path: DUB_PATH,
      wait: clock.wait,
    });

    assert.equal(response.status, 204);
    assert.equal(clock.waits.length >= 2, true);
    assertResetTombstones(bucket, "reset-2");
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

    const newerEnvelope = envelopedAudio("reset-1", repeatedBytes, "upload-1");
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
        guardianConsentGeneration: "consent-1",
        guardianConsentVersion: CURRENT_CONSENT_VERSION,
        lineId: "line-1",
        payloadOffset: String(newerEnvelope.payloadOffset),
        recordedAt: "2026-08-25T10:00:00.000Z",
        state: "audio",
        uploadNonce: "upload-1",
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
    const newerEnvelope = envelopedAudio("reset-2", newerBytes, "upload-1");
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
        guardianConsentGeneration: "consent-1",
        guardianConsentVersion: CURRENT_CONSENT_VERSION,
        lineId: "line-1",
        payloadOffset: String(newerEnvelope.payloadOffset),
        recordedAt: "2026-08-25T10:00:00.000Z",
        state: "audio",
        uploadNonce: "upload-1",
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

  it("marks malformed current envelopes unsaved and refuses their audio", async () => {
    const generation = "reset-1";
    const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 4]);
    const envelope = envelopedAudio(generation, audio);
    const corrupted = envelope.bytes.slice();
    corrupted[0] ^= 0xff;
    const cases = [
      ["line-1", envelope.bytes, {
        generation,
        state: "audio",
      }],
      ["line-2", envelope.bytes, {
        generation,
        payloadOffset: "1",
        state: "audio",
      }],
      ["line-3", envelope.bytes, {
        generation,
        payloadOffset: String(envelope.payloadOffset + 1),
        state: "audio",
      }],
      ["line-4", corrupted, {
        generation,
        payloadOffset: String(envelope.payloadOffset),
        state: "audio",
      }],
      ["line-5", envelope.bytes.subarray(0, envelope.payloadOffset - 1), {
        generation,
        payloadOffset: String(envelope.payloadOffset),
        state: "audio",
      }],
      ["line-6", envelope.bytes.subarray(0, envelope.payloadOffset), {
        generation,
        payloadOffset: String(envelope.payloadOffset),
        state: "audio",
      }],
    ];
    const bucket = createBucket([
      [MARKER_KEY, {
        bytes: fenceBytes("marker", generation, "ready"),
        options: { customMetadata: { generation, state: "ready" } },
        uploaded: new Date("2026-08-25T09:00:00.000Z"),
      }],
      ...cases.map(([lineId, bytes, customMetadata]) => [slotKey(lineId), {
        bytes,
        options: {
          customMetadata: {
            guardianConsentGeneration: "consent-1",
            guardianConsentVersion: CURRENT_CONSENT_VERSION,
            lineId,
            recordedAt: "2026-08-25T09:00:00.000Z",
            uploadNonce: "upload-1",
            ...customMetadata,
          },
          httpMetadata: { contentType: "audio/webm" },
        },
        uploaded: new Date("2026-08-25T09:00:00.000Z"),
      }]),
    ]);

    const status = await callDub({ bucket, method: "GET", path: DUB_PATH });
    const payload = await status.json();
    assert.deepEqual(
      payload.lines.filter(({ saved }) => saved).map(({ id }) => id),
      [],
    );
    for (const [lineId] of cases) {
      assert.equal((await callDub({
        bucket,
        method: "GET",
        path: `${DUB_PATH}/lines/${lineId}/audio`,
      })).status, 404, lineId);
    }
  });

  it("rejects stored envelopes above the upload limit at the exact boundary", async () => {
    const generation = "reset-1";
    const atLimit = envelopedAudio(generation, new Uint8Array(512 * 1024));
    const aboveLimit = envelopedAudio(
      generation,
      new Uint8Array(512 * 1024 + 1),
    );
    const stored = (lineId, envelope) => ({
      bytes: envelope.bytes,
      options: {
        customMetadata: {
          generation,
          guardianConsentGeneration: "consent-1",
          guardianConsentVersion: CURRENT_CONSENT_VERSION,
          lineId,
          payloadOffset: String(envelope.payloadOffset),
          recordedAt: "2026-08-25T09:00:00.000Z",
          state: "audio",
          uploadNonce: "upload-1",
        },
        httpMetadata: { contentType: "audio/webm" },
      },
      uploaded: new Date("2026-08-25T09:00:00.000Z"),
    });
    const bucket = createBucket([
      [MARKER_KEY, {
        bytes: fenceBytes("marker", generation, "ready"),
        options: { customMetadata: { generation, state: "ready" } },
        uploaded: new Date("2026-08-25T09:00:00.000Z"),
      }],
      [slotKey("line-1"), stored("line-1", aboveLimit)],
      [slotKey("line-2"), stored("line-2", atLimit)],
    ]);

    const status = await callDub({ bucket, method: "GET", path: DUB_PATH });
    const lines = (await status.json()).lines;
    assert.equal(lines[0].saved, false);
    assert.equal(lines[1].saved, true);
    assert.equal((await callDub({
      bucket,
      method: "GET",
      path: `${DUB_PATH}/lines/line-1/audio`,
    })).status, 404);
    const boundary = await callDub({
      bucket,
      method: "GET",
      path: `${DUB_PATH}/lines/line-2/audio`,
    });
    assert.equal(boundary.status, 200);
    assert.equal((await boundary.arrayBuffer()).byteLength, 512 * 1024);
  });

  it("rejects raw audio even when it carries current metadata", async () => {
    const raw = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 8]);
    const current = v2AudioObject({ lineId: "line-1" });
    const bucket = createBucket([
      [MARKER_KEY, readyMarker()],
      [slotKey("line-1"), { ...current, bytes: raw }],
    ]);

    const status = await callDub({ bucket, method: "GET", path: DUB_PATH });
    assert.equal((await status.json()).lines[0].saved, false);
    assert.equal((await callDub({
      bucket,
      method: "GET",
      path: `${DUB_PATH}/lines/line-1/audio`,
    })).status, 404);
  });

  it("streams a split validated v2 envelope byte-exactly", async () => {
    const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 9, 10, 11]);
    const envelope = envelopedAudio("consent-1", audio);
    const bucket = createBucket([
      [MARKER_KEY, readyMarker()],
      [slotKey("line-1"), {
        bytes: envelope.bytes,
        chunks: [
          envelope.bytes.subarray(0, 2),
          envelope.bytes.subarray(2, envelope.payloadOffset + 2),
          envelope.bytes.subarray(envelope.payloadOffset + 2),
        ],
        options: {
          customMetadata: {
            generation: "consent-1",
            guardianConsentGeneration: "consent-1",
            guardianConsentVersion: CURRENT_CONSENT_VERSION,
            lineId: "line-1",
            payloadOffset: String(envelope.payloadOffset),
            recordedAt: "2026-08-25T09:00:00.000Z",
            state: "audio",
            uploadNonce: "upload-1",
          },
          httpMetadata: { contentType: "audio/webm" },
        },
        uploaded: new Date("2026-08-25T09:00:00.000Z"),
      }],
    ]);

    const status = await callDub({ bucket, method: "GET", path: DUB_PATH });
    assert.deepEqual(
      (await status.json()).lines.filter(({ saved }) => saved).map(({ id }) => id),
      ["line-1"],
    );
    const response = await callDub({
      bucket,
      method: "GET",
      path: `${DUB_PATH}/lines/line-1/audio`,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), audio);
  });

  it("streams v2 audio ranges relative to the decoded payload", async () => {
    const generation = "range-generation";
    const uploadNonce = "range-upload";
    const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 9, 10, 11, 12]);
    const envelope = envelopedAudio(generation, audio, uploadNonce);
    const bucket = createBucket([
      [MARKER_KEY, {
        bytes: fenceBytes("marker", generation, "ready"),
        options: {
          customMetadata: { generation, state: "ready" },
        },
        uploaded: new Date("2026-08-25T09:00:00.000Z"),
      }],
      [slotKey("line-1"), {
        bytes: envelope.bytes,
        options: {
          customMetadata: {
            generation,
            guardianConsentGeneration: "consent-1",
            guardianConsentVersion: CURRENT_CONSENT_VERSION,
            lineId: "line-1",
            payloadOffset: String(envelope.payloadOffset),
            recordedAt: "2026-08-25T09:00:00.000Z",
            state: "audio",
            uploadNonce,
          },
          httpMetadata: { contentType: "audio/webm" },
        },
        uploaded: new Date("2026-08-25T09:00:00.000Z"),
      }],
    ]);

    const cases = [
      {
        expected: audio.subarray(0, 2),
        expectedContentRange: `bytes 0-1/${audio.byteLength}`,
        expectedR2Range: { length: 2, offset: envelope.payloadOffset },
        range: "bytes=0-1",
      },
      {
        expected: audio.subarray(4),
        expectedContentRange: `bytes 4-7/${audio.byteLength}`,
        expectedR2Range: {
          length: audio.byteLength - 4,
          offset: envelope.payloadOffset + 4,
        },
        range: "bytes=4-",
      },
      {
        expected: audio.subarray(-3),
        expectedContentRange: `bytes 5-7/${audio.byteLength}`,
        expectedR2Range: {
          length: 3,
          offset: envelope.payloadOffset + audio.byteLength - 3,
        },
        range: "bytes=-3",
      },
    ];

    for (const rangeCase of cases) {
      const response = await callDub({
        bucket,
        headers: { Range: rangeCase.range },
        method: "GET",
        path: `${DUB_PATH}/lines/line-1/audio`,
      });

      assert.equal(response.status, 206, rangeCase.range);
      assert.equal(response.headers.get("Accept-Ranges"), "bytes");
      assert.equal(
        response.headers.get("Content-Range"),
        rangeCase.expectedContentRange,
      );
      assert.equal(
        response.headers.get("Content-Length"),
        String(rangeCase.expected.byteLength),
      );
      assert.equal(response.headers.get("Content-Type"), "audio/webm");
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
      assert.deepEqual(
        new Uint8Array(await response.arrayBuffer()),
        rangeCase.expected,
      );
      assert.deepEqual(
        bucket.calls.getOptions.at(-1),
        {
          key: slotKey("line-1"),
          options: {
            onlyIf: { etagMatches: bucket.stored.get(slotKey("line-1")).etag },
            range: rangeCase.expectedR2Range,
          },
        },
        rangeCase.range,
      );
    }

    const full = await callDub({
      bucket,
      method: "GET",
      path: `${DUB_PATH}/lines/line-1/audio`,
    });
    assert.equal(full.status, 200);
    assert.equal(full.headers.get("Accept-Ranges"), "bytes");
    assert.equal(full.headers.get("Content-Range"), null);
    assert.equal(full.headers.get("Content-Length"), String(audio.byteLength));
    assert.deepEqual(new Uint8Array(await full.arrayBuffer()), audio);
    assert.deepEqual(bucket.calls.getOptions.at(-1), {
      key: slotKey("line-1"),
      options: {
        onlyIf: { etagMatches: bucket.stored.get(slotKey("line-1")).etag },
        range: { offset: envelope.payloadOffset },
      },
    });
  });

  it("rejects malformed, multiple, and unsatisfiable audio ranges privately", async () => {
    const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 9, 10]);
    const bucket = createBucket([
      [MARKER_KEY, readyMarker()],
      [slotKey("line-1"), v2AudioObject({ audio, lineId: "line-1" })],
    ]);

    for (const range of [
      "items=0-1",
      "bytes=0-1,3-4",
      "bytes=99-",
      "bytes=4-2",
      "bytes=-0",
    ]) {
      const response = await callDub({
        bucket,
        headers: { Range: range },
        method: "GET",
        path: `${DUB_PATH}/lines/line-1/audio`,
      });

      assert.equal(response.status, 416, range);
      assert.equal(response.headers.get("Accept-Ranges"), "bytes", range);
      assert.equal(response.headers.get("Content-Range"), "bytes */6", range);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store", range);
      assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff", range);
      assert.deepEqual(await response.json(), {
        error: "range_not_satisfiable",
        message: "range_not_satisfiable",
      });
    }
    assert.equal(bucket.calls.get.length, 5);
  });

  it("counts and serves only strict current-generation audio", async () => {
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

  it("keeps current markers and tombstones private and outside status rows", async () => {
    const bucket = createBucket();
    assert.equal((await callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
    })).status, 204);

    const status = await callDub({ bucket, method: "GET", path: DUB_PATH });
    const payload = await status.json();
    assert.equal(payload.lines.length, LINE_IDS.length);
    assert.equal(payload.lines.every(({ saved }) => !saved), true);
    const accountObjects = await bucket.list({
      prefix: ACCOUNT_PREFIX,
    });
    assert.equal(
      accountObjects.objects.length,
      DUB_DEFINITIONS.reduce(
        (total, definition) => total + definition.lines.length + 1,
        0,
      ),
    );
    assert.equal(accountObjects.objects.some(({ key }) => key === MARKER_KEY), true);
    assert.equal(
      accountObjects.objects.some(({ key }) => key === OLD_MARKER_KEY),
      true,
    );
    for (const { id } of DUB_DEFINITIONS) {
      assert.equal(
        accountObjects.objects.some(({ key }) => key === catalogMarkerKey(id)),
        true,
      );
    }
    assert.equal(accountObjects.objects.every(({ key }) =>
      key.startsWith(ACCOUNT_PREFIX)), true);
    await bucket.delete(accountObjects.objects.map(({ key }) => key));
    assert.equal(bucket.stored.size, 0);
  });

  it("leaves a non-audio marker when account purge begins during reset", async () => {
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
    assert.deepEqual(bucket.calls.delete, []);
    assert.deepEqual(bucket.stored.get(MARKER_KEY).options.customMetadata, {
      generation: "reset-1",
      state: "deleting",
    });
    assert.deepEqual(bucket.stored.get(OLD_MARKER_KEY).options.customMetadata, {
      generation: "reset-1",
      state: "deleting",
    });
    for (const { id } of DUB_DEFINITIONS) {
      assert.deepEqual(
        bucket.stored.get(catalogMarkerKey(id)).options.customMetadata,
        { generation: "reset-1", state: "deleting" },
      );
    }
    assert.equal(bucket.stored.size, DUB_DEFINITIONS.length);
  });

  it("does not let a pending retired reset delete its successor marker", async () => {
    const bucket = createBucket();
    const pendingCheckStarted = deferred();
    const releasePendingCheck = deferred();
    let oldChecks = 0;
    const oldResetPromise = callDub({
      bucket,
      generation: () => "reset-1",
      method: "DELETE",
      path: DUB_PATH,
      pending: async () => {
        oldChecks += 1;
        if (oldChecks === 1) return false;
        pendingCheckStarted.resolve();
        await releasePendingCheck.promise;
        return true;
      },
    });
    await pendingCheckStarted.promise;

    const successor = await callDub({
      bucket,
      generation: () => "reset-2",
      method: "DELETE",
      path: DUB_PATH,
    });
    releasePendingCheck.resolve();
    const retired = await oldResetPromise;

    assert.equal(successor.status, 204);
    assert.equal(retired.status, 409);
    assert.equal(bucket.calls.delete.some((key) => key === MARKER_KEY), false);
    assertResetTombstones(bucket, "reset-2");
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
        },
        method: "PUT",
        path: `${DUB_PATH}/lines/${lineId}`,
      });
      assert.equal(response.status, 201, contentType);
    }
    assert.deepEqual(
      bucket.calls.put
        .filter(({ options }) => options.customMetadata?.state === "audio")
        .map(({ options }) => options.httpMetadata.contentType),
      ["audio/webm", "audio/mp4", "audio/ogg"],
    );
  });

  it("rejects wrong types and mismatched signatures before R2 put", async () => {
    const bucket = createBucket();
    const base = { bucket, method: "PUT", path: `${DUB_PATH}/lines/line-1` };
    const cases = [
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

  it("treats an account-deleting marker as terminal for every studio operation", async () => {
    const generation = "account-deletion-v1:owner-hash:1787652000000";
    const cases = [
      { method: "GET", path: DUB_PATH },
      { method: "DELETE", path: DUB_PATH },
      {
        body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
        headers: CONSENT_HEADERS,
        method: "PUT",
        path: `${DUB_PATH}/lines/line-1`,
      },
      { method: "GET", path: `${DUB_PATH}/lines/line-1/audio` },
    ];

    for (const testCase of cases) {
      const bucket = createBucket([[MARKER_KEY, {
        bytes: fenceBytes("marker", generation, "account-deleting"),
        options: {
          customMetadata: { generation, state: "account-deleting" },
        },
        uploaded: new Date("2026-08-25T10:00:00.000Z"),
      }]]);

      const response = await callDub({ bucket, ...testCase });

      assert.equal(
        response.status,
        409,
        `${testCase.method} ${testCase.path}`,
      );
      assert.equal(
        (await response.json()).error,
        "account_deletion_pending",
        `${testCase.method} ${testCase.path}`,
      );
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.equal(bucket.calls.put.length, 0);
      assert.deepEqual(
        bucket.stored.get(MARKER_KEY).bytes,
        fenceBytes("marker", generation, "account-deleting"),
      );
    }
  });

  it("CAS-tombstones a held upload that lands after the account prefix sweep", async () => {
    const bucket = createBucket();
    const audioPutStarted = deferred();
    const releaseAudioPut = deferred();
    const put = bucket.put.bind(bucket);
    let cleanupFailures = 1;
    bucket.put = async (key, bytes, options) => {
      if (options?.customMetadata?.state === "audio") {
        audioPutStarted.resolve();
        await releaseAudioPut.promise;
      }
      if (
        options?.customMetadata?.state === "account-deleting" &&
        cleanupFailures-- > 0
      ) {
        throw Object.assign(new Error("put: TooManyRequests (10058)"), {
          status: 429,
        });
      }
      return put(key, bytes, options);
    };
    const remove = bucket.delete.bind(bucket);
    bucket.delete = async (keys) => {
      if (!Array.isArray(keys)) throw new Error("unsafe cleanup delete failed");
      return remove(keys);
    };
    let pending = false;

    const responsePromise = callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
      pending: async () => pending,
    });
    await audioPutStarted.promise;
    const swept = await bucket.list({
      prefix: ACCOUNT_PREFIX,
    });
    assert.deepEqual(swept.objects.map(({ key }) => key), [MARKER_KEY]);
    await bucket.delete(swept.objects.map(({ key }) => key));
    pending = true;
    releaseAudioPut.resolve();
    const response = await responsePromise;

    assert.equal(response.status, 409);
    assert.deepEqual(bucket.calls.delete, [[MARKER_KEY]]);
    assert.equal(cleanupFailures, -1);
    assert.deepEqual(
      bucket.stored.get(slotKey("line-1")).options.customMetadata.state,
      "account-deleting",
    );
  });

  it("fences an upload after account deletion sweeps its ready marker", async () => {
    const generation = "reset-1";
    const bucket = createBucket([[MARKER_KEY, {
      bytes: fenceBytes("marker", generation, "ready"),
      options: { customMetadata: { generation, state: "ready" } },
      uploaded: new Date("2026-08-25T09:00:00.000Z"),
    }]]);
    const audioPutStarted = deferred();
    const releaseAudioPut = deferred();
    const put = bucket.put.bind(bucket);
    let cleanupFailures = 1;
    bucket.put = async (key, bytes, options) => {
      if (options?.customMetadata?.state === "audio") {
        audioPutStarted.resolve();
        await releaseAudioPut.promise;
      }
      if (
        options?.customMetadata?.state === "account-deleting" &&
        cleanupFailures-- > 0
      ) {
        throw new Error("put: TooManyRequests (10058)");
      }
      return put(key, bytes, options);
    };
    let pending = false;

    const responsePromise = callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 6]),
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
      pending: async () => pending,
    });
    await audioPutStarted.promise;
    pending = true;
    const swept = await bucket.list({ prefix: ACCOUNT_PREFIX });
    await bucket.delete(swept.objects.map(({ key }) => key));
    assert.equal(bucket.stored.has(MARKER_KEY), false);
    releaseAudioPut.resolve();
    const response = await responsePromise;

    assert.equal(response.status, 409);
    assert.deepEqual(bucket.calls.delete, [[MARKER_KEY]]);
    assert.equal(
      bucket.stored.get(slotKey("line-1")).options.customMetadata.state,
      "account-deleting",
    );
    assert.equal(cleanupFailures, -1);
    assert.equal((await response.json()).error, "account_deletion_pending");
  });

  it("rechecks account deletion after a post-store marker conflict", async () => {
    const generation = "reset-1";
    const bucket = createBucket([[MARKER_KEY, {
      bytes: fenceBytes("marker", generation, "ready"),
      options: { customMetadata: { generation, state: "ready" } },
      uploaded: new Date("2026-08-25T09:00:00.000Z"),
    }]]);
    const markerReadStarted = deferred();
    const releaseMarkerRead = deferred();
    const head = bucket.head.bind(bucket);
    let markerReads = 0;
    bucket.head = async (key) => {
      if (key === MARKER_KEY && ++markerReads === 3) {
        markerReadStarted.resolve();
        await releaseMarkerRead.promise;
      }
      return head(key);
    };
    let pending = false;

    const responsePromise = callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 7]),
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
      pending: async () => pending,
    });
    await markerReadStarted.promise;
    pending = true;
    const swept = await bucket.list({ prefix: ACCOUNT_PREFIX });
    await bucket.delete(swept.objects.map(({ key }) => key));
    releaseMarkerRead.resolve();
    const response = await responsePromise;

    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "account_deletion_pending");
    assert.equal(bucket.stored.has(slotKey("line-1")), false);
  });

  it("fences a late upload when the post-store D1 read fails after the sweep", async () => {
    const generation = "reset-1";
    const bucket = createBucket([[MARKER_KEY, {
      bytes: fenceBytes("marker", generation, "ready"),
      options: { customMetadata: { generation, state: "ready" } },
      uploaded: new Date("2026-08-25T09:00:00.000Z"),
    }]]);
    const audioPutStarted = deferred();
    const releaseAudioPut = deferred();
    const put = bucket.put.bind(bucket);
    let cleanupFailures = 1;
    bucket.put = async (key, bytes, options) => {
      if (options?.customMetadata?.state === "audio") {
        audioPutStarted.resolve();
        await releaseAudioPut.promise;
      }
      if (
        options?.customMetadata?.state === "account-deleting" &&
        cleanupFailures-- > 0
      ) {
        throw new Error("put: TooManyRequests (10058)");
      }
      return put(key, bytes, options);
    };
    const d1Error = new Error("D1 read failed");
    let checks = 0;

    const responsePromise = callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 8]),
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
      pending: async () => {
        if (++checks === 1) return false;
        throw d1Error;
      },
    });
    await audioPutStarted.promise;
    const swept = await bucket.list({ prefix: ACCOUNT_PREFIX });
    await bucket.delete(swept.objects.map(({ key }) => key));
    releaseAudioPut.resolve();

    await assert.rejects(responsePromise, (error) => error === d1Error);
    assert.deepEqual(bucket.calls.delete, [[MARKER_KEY]]);
    assert.equal(
      bucket.stored.get(slotKey("line-1")).options.customMetadata.state,
      "account-deleting",
    );
    assert.equal(cleanupFailures, -1);
  });

  it("fences on every post-store D1 read failure with a ready or lost marker", async () => {
    for (const { dropMarker, throwAt } of [
      { dropMarker: false, throwAt: 2 },
      { dropMarker: false, throwAt: 3 },
      { dropMarker: true, throwAt: 3 },
    ]) {
      const generation = "reset-1";
      const bucket = createBucket([[MARKER_KEY, {
        bytes: fenceBytes("marker", generation, "ready"),
        options: { customMetadata: { generation, state: "ready" } },
        uploaded: new Date("2026-08-25T09:00:00.000Z"),
      }]]);
      if (dropMarker) {
        const head = bucket.head.bind(bucket);
        let markerReads = 0;
        bucket.head = async (key) => {
          if (key === MARKER_KEY && ++markerReads === 3) {
            bucket.stored.delete(MARKER_KEY);
          }
          return head(key);
        };
      }
      const d1Error = new Error(`D1 read ${throwAt} failed`);
      let checks = 0;

      const responsePromise = callDub({
        body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, throwAt]),
        bucket,
        headers: CONSENT_HEADERS,
        method: "PUT",
        path: `${DUB_PATH}/lines/line-1`,
        pending: async () => {
          if (++checks === throwAt) throw d1Error;
          return false;
        },
      });

      await assert.rejects(responsePromise, (error) => error === d1Error);
      assert.equal(
        bucket.stored.get(slotKey("line-1")).options.customMetadata.state,
        "account-deleting",
        JSON.stringify({ dropMarker, throwAt }),
      );
    }
  });

  it("preserves the D1 error when uncertain R2 cleanup also fails", async () => {
    const generation = "reset-1";
    const bucket = createBucket([[MARKER_KEY, {
      bytes: fenceBytes("marker", generation, "ready"),
      options: { customMetadata: { generation, state: "ready" } },
      uploaded: new Date("2026-08-25T09:00:00.000Z"),
    }]]);
    const put = bucket.put.bind(bucket);
    bucket.put = async (key, bytes, options) => {
      if (options?.customMetadata?.state === "account-deleting") {
        throw new Error("R2 cleanup failed");
      }
      return put(key, bytes, options);
    };
    const d1Error = new Error("D1 read failed");
    let checks = 0;

    const responsePromise = callDub({
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 9]),
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
      pending: async () => {
        if (++checks === 1) return false;
        throw d1Error;
      },
    });

    await assert.rejects(responsePromise, (error) => error === d1Error);
    assert.equal(
      bucket.stored.get(slotKey("line-1")).options.customMetadata.state,
      "audio",
    );
  });

  it("does not let uncertain A cleanup fence a newer identical-audio B", async () => {
    const generation = "reset-1";
    const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 9]);
    const bucket = createBucket([[MARKER_KEY, {
      bytes: fenceBytes("marker", generation, "ready"),
      options: { customMetadata: { generation, state: "ready" } },
      uploaded: new Date("2026-08-25T09:00:00.000Z"),
    }]]);
    const d1ReadStarted = deferred();
    const releaseD1Read = deferred();
    const d1Error = new Error("D1 read failed");
    let checks = 0;

    const aPromise = callDub({
      body: audio,
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      nonce: () => "upload-a",
      path: `${DUB_PATH}/lines/line-1`,
      pending: async () => {
        if (++checks === 1) return false;
        d1ReadStarted.resolve();
        await releaseD1Read.promise;
        throw d1Error;
      },
    });
    await d1ReadStarted.promise;
    const aObject = bucket.stored.get(slotKey("line-1"));
    const b = await callDub({
      body: audio,
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      nonce: () => "upload-b",
      path: `${DUB_PATH}/lines/line-1`,
    });
    const bObject = bucket.stored.get(slotKey("line-1"));
    releaseD1Read.resolve();
    await assert.rejects(aPromise, (error) => error === d1Error);

    assert.equal(b.status, 201);
    assert.notEqual(aObject.etag, bObject.etag);
    assert.notDeepEqual(aObject.bytes, bObject.bytes);
    assert.equal(
      bucket.stored.get(slotKey("line-1")).options.customMetadata.uploadNonce,
      "upload-b",
    );
    assert.deepEqual(storedAudio(bucket.stored.get(slotKey("line-1"))), audio);
  });

  it("takes account cleanup over after CAS loss to another old writer", async () => {
    const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 7]);
    const bucket = createBucket();
    const cleanupStarted = deferred();
    const releaseCleanup = deferred();
    const put = bucket.put.bind(bucket);
    let held = false;
    bucket.put = async (key, bytes, options) => {
      if (options?.customMetadata?.state === "account-deleting" && !held) {
        held = true;
        cleanupStarted.resolve();
        await releaseCleanup.promise;
      }
      return put(key, bytes, options);
    };
    const remove = bucket.delete.bind(bucket);
    bucket.delete = async (keys) => {
      if (!Array.isArray(keys)) {
        cleanupStarted.resolve();
        await releaseCleanup.promise;
      }
      return remove(keys);
    };
    let checks = 0;

    const responsePromise = callDub({
      body: audio,
      bucket,
      headers: CONSENT_HEADERS,
      method: "PUT",
      path: `${DUB_PATH}/lines/line-1`,
      pending: async () => ++checks > 1,
    });
    await cleanupStarted.promise;
    const firstWriter = bucket.stored.get(slotKey("line-1"));
    const racer = envelopedAudio("stale-racer", audio);
    await put(slotKey("line-1"), racer.bytes, {
      customMetadata: {
        generation: "stale-racer",
        guardianConsentGeneration: "consent-1",
        guardianConsentVersion: CURRENT_CONSENT_VERSION,
        lineId: "line-1",
        payloadOffset: String(racer.payloadOffset),
        recordedAt: "2026-08-25T09:00:00.000Z",
        state: "audio",
        uploadNonce: "upload-1",
      },
      httpMetadata: { contentType: "audio/webm" },
      onlyIf: { etagMatches: firstWriter.etag },
    });
    releaseCleanup.resolve();
    const response = await responsePromise;

    assert.equal(response.status, 409);
    assert.deepEqual(bucket.calls.delete, []);
    assert.equal(
      bucket.stored.get(slotKey("line-1")).options.customMetadata.state,
      "account-deleting",
    );
  });

  it("returns private 404s for missing audio and route mismatches", async () => {
    for (const path of [
      `${DUB_PATH}/lines/line-1/audio`,
      `${OLD_DUB_PATH}/lines/old-macdonald-v1-line-1/audio`,
      `${OLD_DUB_PATH}/lines/line-1/audio`,
      `${DUB_PATH}/lines/line-99/audio`,
      "/api/dubs/not-the-ducks",
      `${DUB_PATH}/extra`,
    ]) {
      const response = await callDub({ method: "GET", path });
      assert.equal(response.status, 404, path);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    }
  });

  it("rejects encoded canonical aliases before domain mutations", async () => {
    const bucket = createBucket();
    const consentRepository = createConsentRepository();
    let grants = 0;
    let revocations = 0;
    const grant = consentRepository.grant.bind(consentRepository);
    const beginRevocation = consentRepository.beginRevocation.bind(
      consentRepository,
    );
    consentRepository.grant = async (...args) => {
      grants += 1;
      return grant(...args);
    };
    consentRepository.beginRevocation = async (...args) => {
      revocations += 1;
      return beginRevocation(...args);
    };

    for (const [method, path, body, headers] of [
      ["DELETE", "/api/dubs/%66ive-little-ducks-v2"],
      [
        "PUT",
        "/api/dubs/%66ive-little-ducks-v2/consent",
        JSON.stringify({
          accepted: true,
          consentVersion: CURRENT_CONSENT_VERSION,
        }),
        { "Content-Type": "application/json" },
      ],
      [
        "PUT",
        `${DUB_PATH}/%63onsent`,
        JSON.stringify({
          accepted: true,
          consentVersion: CURRENT_CONSENT_VERSION,
        }),
        { "Content-Type": "application/json" },
      ],
    ]) {
      const response = await callDub({
        body,
        bucket,
        consentRepository,
        headers,
        method,
        path,
      });
      assert.equal(response.status, 404, `${method} ${path}`);
    }

    assert.equal(grants, 0);
    assert.equal(revocations, 0);
    assert.deepEqual(bucket.calls.put, []);
    assert.deepEqual(bucket.calls.delete, []);
  });

  it("returns route-specific Allow headers for every supported 405 shape", async () => {
    for (const [method, path, allow] of [
      ["POST", DUB_PATH, "GET, DELETE"],
      ["GET", `${DUB_PATH}/lines/line-1`, "PUT"],
      ["PUT", `${DUB_PATH}/lines/line-1/audio`, "GET"],
      ["DELETE", `${DUB_PATH}/lines/line-1/audio`, "GET"],
    ]) {
      const response = await callDub({ method, path });
      assert.equal(response.status, 405, `${method} ${path}`);
      assert.equal(response.headers.get("Allow"), allow, `${method} ${path}`);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    }
  });
});
