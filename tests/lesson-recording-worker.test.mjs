import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { TextDecoder, TextEncoder } from "node:util";
import {
  markAccountDeletionPending,
  prepareAccountDeletion,
} from "../worker/account-deletion.ts";
import { createDatabase } from "../worker/database.ts";
import { markerKey } from "../worker/dub-storage.ts";
import { handleLearnerProfileRequest } from "../worker/learner-profile.ts";
import { handleLessonRecordingRequest } from "../worker/lesson-recordings.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const USER_ID = "user-1";
const CONSENT_VERSION = "lesson-join-in-recording-v1";
const RECORDED_AT = "2026-08-26T08:00:00.000Z";
const BUILT_IN_PATH =
  "/api/lesson-recordings/parrot/01-peppas-high-ball/scenes/0/steps/2";
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1]);
const MP4 = new Uint8Array([0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70, 1]);
const OGG = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1]);
const AUDIO_ENVELOPE_FORMAT = "parrot-lesson-recording-audio-v1";

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

function objectBytes(value) {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return new Uint8Array(value);
}

function createBucket() {
  let version = 0;
  const stored = new Map();
  const calls = { delete: [], head: [], list: [], put: [] };
  const bucket = {
    calls,
    onAudioPut: null,
    onBeforeAudioPut: null,
    onConditionalPut: null,
    onHead: null,
    onList: null,
    stored,
    async delete(keys) {
      calls.delete.push(keys);
      for (const key of Array.isArray(keys) ? keys : [keys]) stored.delete(key);
    },
    async head(key) {
      calls.head.push(key);
      await bucket.onHead?.(key);
      const item = stored.get(key);
      return item ? item.object : null;
    },
    async list(options = {}) {
      calls.list.push(options);
      await bucket.onList?.(options);
      return {
        objects: [...stored.values()]
          .map(({ object }) => object)
          .filter(({ key }) => key.startsWith(options.prefix ?? "")),
        truncated: false,
      };
    },
    async put(key, value, options = {}) {
      const bytes = objectBytes(value);
      if (options.customMetadata?.state === "audio") {
        await bucket.onBeforeAudioPut?.({ bytes, key, options });
      }
      if (options.onlyIf) {
        await bucket.onConditionalPut?.({ bytes, key, options });
      }
      const current = stored.get(key);
      if (
        options.onlyIf?.etagMatches !== undefined &&
        current?.object.etag !== options.onlyIf.etagMatches
      ) {
        calls.put.push({ bytes, key, options, stored: false });
        return null;
      }
      if (options.onlyIf?.etagDoesNotMatch === "*" && current) {
        calls.put.push({ bytes, key, options, stored: false });
        return null;
      }
      const object = {
        customMetadata: options.customMetadata ?? {},
        etag: createHash("md5").update(bytes).digest("hex"),
        key,
        size: bytes.byteLength,
        uploaded: new Date(RECORDED_AT),
        version: `version-${++version}`,
        writeHttpMetadata(headers) {
          if (options.httpMetadata?.contentType) {
            headers.set("Content-Type", options.httpMetadata.contentType);
          }
        },
      };
      stored.set(key, { bytes, object, options });
      calls.put.push({ bytes, key, options, stored: true });
      if (options.customMetadata?.state === "audio") {
        await bucket.onAudioPut?.({ bytes, key, object, options });
      }
      return object;
    },
  };
  return bucket;
}

function audioWrites(bucket) {
  return bucket.calls.put.filter(
    ({ options, stored }) => options.customMetadata?.state === "audio" && stored,
  );
}

function seedDatabase({ consent = true } = {}) {
  const state = createTestD1Database();
  const timestamp = Date.parse(RECORDED_AT);
  const insertUser = state.sqlite.prepare(
    "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
  );
  insertUser.run(USER_ID, "Parent One", "one@example.test", timestamp, timestamp);
  insertUser.run("user-2", "Parent Two", "two@example.test", timestamp, timestamp);
  const insertProfile = state.sqlite.prepare(
    `INSERT INTO learner_profile
      (id, auth_user_id, legacy_storage_owner, name, onboarding_status,
       lesson_recording_consent_version, lesson_recording_consent_at,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
  );
  insertProfile.run(
    "profile-1",
    USER_ID,
    1,
    "Mia",
    consent ? CONSENT_VERSION : null,
    consent ? timestamp : null,
    timestamp,
    timestamp,
  );
  insertProfile.run(
    "profile-sibling",
    USER_ID,
    0,
    "Leo",
    null,
    null,
    timestamp,
    timestamp,
  );
  insertProfile.run(
    "profile-2",
    "user-2",
    1,
    "Noah",
    CONSENT_VERSION,
    timestamp,
    timestamp,
    timestamp,
  );
  return { ...state, database: createDatabase(state.d1) };
}

function setConsent(state, enabled, learnerProfileId = "profile-1") {
  const current = state.sqlite
    .prepare(
      `SELECT lesson_recording_consent_version AS version,
              lesson_recording_generation AS generation,
              lesson_recording_cleanup_before_generation AS pending
       FROM learner_profile WHERE id = ? AND auth_user_id = ?`,
    )
    .get(learnerProfileId, USER_ID);
  const wasEnabled = current.version === CONSENT_VERSION;
  const generation = current.generation + (wasEnabled === enabled ? 0 : 1);
  state.sqlite.prepare(
    `UPDATE learner_profile
     SET lesson_recording_consent_version = ?, lesson_recording_consent_at = ?,
         lesson_recording_generation = ?,
         lesson_recording_cleanup_before_generation = ?
     WHERE id = ? AND auth_user_id = ?`,
  ).run(
    enabled ? CONSENT_VERSION : null,
    enabled ? Date.parse(RECORDED_AT) : null,
    generation,
    !enabled && wasEnabled ? generation : current.pending,
    learnerProfileId,
    USER_ID,
  );
}

function request(path, {
  body = WEBM,
  contentType = "audio/webm",
  expectedLearnerProfileId = null,
  method = "PUT",
} = {}) {
  const headers = {};
  if (contentType !== null) headers["Content-Type"] = contentType;
  if (expectedLearnerProfileId !== null) {
    headers["X-Parrot-Expected-Learner-Profile"] = expectedLearnerProfileId;
  }
  return new Request(`https://example.test${path}`, {
    method,
    ...(body === null ? {} : { body }),
    headers,
  });
}

function call(state, bucket, path = BUILT_IN_PATH, options = {}) {
  const expectedLearnerProfileId = Object.hasOwn(
    options,
    "expectedLearnerProfileId",
  )
    ? options.expectedLearnerProfileId
    : (options.method ?? "PUT") === "PUT"
      ? (options.learnerProfileId ?? "profile-1")
      : null;
  return handleLessonRecordingRequest(
    {
      database: state.database,
      env: { DB: state.d1, PERSONALIZED_STORY_ART_BUCKET: bucket },
      identity: {
        sessionId: "session-1",
        userId: options.userId ?? USER_ID,
        userName: "Parent",
        learnerProfileId: options.learnerProfileId ?? "profile-1",
        learnerName: options.learnerName ?? "Mia",
        legacyStorageOwner: options.legacyStorageOwner ?? true,
      },
      request: request(path, { ...options, expectedLearnerProfileId }),
    },
    {
      createUploadNonce: options.createUploadNonce ?? (() => "upload-1"),
      now: () => new Date(RECORDED_AT),
      wait: options.wait,
    },
  );
}

function saveRecordingConsent(state, bucket, enabled, identity = {}) {
  return handleLearnerProfileRequest(
    {
      database: state.database,
      env: { DB: state.d1, PERSONALIZED_STORY_ART_BUCKET: bucket },
      identity: {
        sessionId: "session-1",
        userId: USER_ID,
        userName: "Parent",
        learnerProfileId: "profile-1",
        learnerName: "Mia",
        legacyStorageOwner: true,
        ...identity,
      },
      request: new Request(
        "https://example.test/api/profile/lesson-recording-consent",
        {
          body: JSON.stringify({ enabled }),
          headers: { "Content-Type": "application/json" },
          method: "PUT",
        },
      ),
    },
    { wait: async () => {} },
  );
}

describe("lesson recording Worker handler", () => {
  it("makes recording available automatically and supports only GET", async () => {
    const state = seedDatabase({ consent: false });
    const bucket = createBucket();
    try {
      const response = await call(
        state,
        bucket,
        "/api/lesson-recordings/consent",
        { body: null, contentType: null, method: "GET" },
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.deepEqual(await response.json(), {
        cleanupPending: false,
        enabled: true,
      });
      assert.equal(
        state.sqlite
          .prepare(
            "SELECT lesson_recording_consent_version AS version FROM learner_profile WHERE id = 'profile-1'",
          )
          .get().version,
        CONSENT_VERSION,
      );

      const denied = await call(
        state,
        bucket,
        "/api/lesson-recordings/consent",
        { body: null, contentType: null, method: "PUT" },
      );
      assert.equal(denied.status, 405);
      assert.equal(denied.headers.get("Allow"), "GET");
    } finally {
      state.close();
    }
  });

  it("rejects a missing, malformed, or changed learner precondition before reading audio", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    const cases = [
      { expected: null, learnerProfileId: "profile-1" },
      { expected: " profile-1 ", learnerProfileId: "profile-1" },
      { expected: "profile-sibling", learnerProfileId: "profile-1" },
      { expected: "p".repeat(129), learnerProfileId: "p".repeat(129) },
    ];
    try {
      for (const { expected, learnerProfileId } of cases) {
        let bodyReads = 0;
        const headers = {
          get(name) {
            if (name.toLowerCase() === "content-type") return "audio/webm";
            if (
              name.toLowerCase() ===
              "x-parrot-expected-learner-profile"
            ) {
              return expected;
            }
            return null;
          },
        };
        const requestWithoutReadableBody = {
          get body() {
            bodyReads += 1;
            throw new Error("The rejected upload body must not be read.");
          },
          headers,
          method: "PUT",
          url: `https://example.test${BUILT_IN_PATH}`,
        };

        const response = await handleLessonRecordingRequest(
          {
            database: state.database,
            env: {
              DB: state.d1,
              PERSONALIZED_STORY_ART_BUCKET: bucket,
            },
            identity: {
              sessionId: "session-1",
              userId: USER_ID,
              userName: "Parent",
              learnerProfileId,
              learnerName: "Mia",
              legacyStorageOwner: learnerProfileId === "profile-1",
            },
            request: requestWithoutReadableBody,
          },
          { wait: async () => {} },
        );

        assert.equal(response.status, 409, String(expected));
        assert.deepEqual(await response.json(), {
          error: "learner_selection_changed",
        });
        assert.equal(bodyReads, 0, String(expected));
      }
      assert.equal(bucket.calls.put.length, 0);
    } finally {
      state.close();
    }
  });

  it("uses only the selected sibling's consent and recording subtree", async () => {
    const state = seedDatabase({ consent: false });
    const bucket = createBucket();
    const sibling = {
      learnerProfileId: "profile-sibling",
      learnerName: "Leo",
      legacyStorageOwner: false,
    };
    try {
      const denied = await call(state, bucket, BUILT_IN_PATH, sibling);
      assert.equal(denied.status, 403);
      assert.deepEqual(await denied.json(), {
        error: "guardian_consent_required",
      });
      assert.equal(bucket.calls.put.length, 0);

      const consent = await saveRecordingConsent(state, bucket, true, sibling);
      assert.equal(consent.status, 200);
      const saved = await call(state, bucket, BUILT_IN_PATH, sibling);
      assert.equal(saved.status, 201);
      assert.equal(
        audioWrites(bucket)[0].key,
        "personalized-story-art/user-1/learners/profile-sibling/lesson-recordings/parrot/01-peppas-high-ball/scene-0/step-2.audio",
      );
      assert.equal(
        state.sqlite
          .prepare(
            `SELECT lesson_recording_consent_version
             FROM learner_profile WHERE id = 'profile-1'`,
          )
          .get().lesson_recording_consent_version,
        null,
      );
    } finally {
      state.close();
    }
  });

  it("stores recoverable built-in audio at the deterministic owner slot with server metadata", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    try {
      const response = await call(state, bucket, BUILT_IN_PATH, {
        contentType: "Audio/WebM; codecs=opus",
        createUploadNonce: () => "upload-built-in",
      });

      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), { recordedAt: RECORDED_AT });
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      const audioWrite = audioWrites(bucket)[0];
      assert.equal(audioWrite.key,
        "personalized-story-art/user-1/lesson-recordings/parrot/01-peppas-high-ball/scene-0/step-2.audio");
      const envelope = JSON.stringify([
        AUDIO_ENVELOPE_FORMAT,
        "upload-built-in",
      ]);
      const payloadOffset = new TextEncoder().encode(envelope).byteLength;
      assert.equal(
        new TextDecoder().decode(audioWrite.bytes.slice(0, payloadOffset)),
        envelope,
      );
      assert.deepEqual(audioWrite.bytes.slice(payloadOffset), WEBM);
      assert.deepEqual(audioWrite.options.httpMetadata, {
        cacheControl: "private, no-store",
        contentType: "audio/webm",
      });
      assert.deepEqual(audioWrite.options.customMetadata, {
        consentGeneration: "0",
        consentVersion: CONSENT_VERSION,
        lessonId: "01-peppas-high-ball",
        payloadOffset: String(payloadOffset),
        recordedAt: RECORDED_AT,
        sceneIndex: "0",
        source: "parrot",
        state: "audio",
        stepIndex: "2",
        targetText: "It is up high!",
        uploadNonce: "upload-built-in",
      });
    } finally {
      state.close();
    }
  });

  it("rejects a valid-format My recording route before learner preconditions", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    try {
      const response = await handleLessonRecordingRequest({
        database: state.database,
        env: { DB: state.d1, PERSONALIZED_STORY_ART_BUCKET: bucket },
        identity: {
          sessionId: "session-1",
          userId: USER_ID,
          userName: "Parent",
          learnerProfileId: "profile-1",
          learnerName: "Mia",
          legacyStorageOwner: true,
        },
        request: new Request(
          "https://example.test/api/lesson-recordings/my/lesson-1/scenes/0/steps/0",
          { method: "PUT" },
        ),
      });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "not_found" });
      assert.equal(bucket.calls.put.length, 0);
    } finally {
      state.close();
    }
  });

  it("keeps a re-consented take completed before stale revocation cleanup lists", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    const revokeReachedList = deferred();
    const releaseRevokeList = deferred();
    let held = false;
    bucket.onList = async () => {
      if (held) return;
      held = true;
      revokeReachedList.resolve();
      await releaseRevokeList.promise;
    };

    try {
      const revoking = saveRecordingConsent(state, bucket, false);
      await revokeReachedList.promise;

      const regranted = await saveRecordingConsent(state, bucket, true);
      assert.equal(regranted.status, 200);
      const newer = await call(state, bucket, BUILT_IN_PATH, {
        createUploadNonce: () => "reconsented-before-list",
      });
      assert.equal(newer.status, 201);

      releaseRevokeList.resolve();
      assert.equal((await revoking).status, 200);
      const current = [...bucket.stored.values()][0];
      assert.equal(current.options.customMetadata.state, "audio");
      assert.equal(
        current.options.customMetadata.uploadNonce,
        "reconsented-before-list",
      );
      assert.equal(current.options.customMetadata.consentGeneration, "2");
    } finally {
      releaseRevokeList.resolve();
      state.close();
    }
  });

  it("rejects an old consent generation even when consent is regranted mid-write", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    const writeReached = deferred();
    const releaseWrite = deferred();
    bucket.onBeforeAudioPut = async () => {
      writeReached.resolve();
      await releaseWrite.promise;
    };

    try {
      const stale = call(state, bucket, BUILT_IN_PATH, {
        createUploadNonce: () => "old-consent-generation",
      });
      await writeReached.promise;
      setConsent(state, false);
      setConsent(state, true);
      releaseWrite.resolve();

      const response = await stale;
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        error: "guardian_consent_required",
      });
      assert.equal(
        [...bucket.stored.values()].some(
          ({ options }) => options.customMetadata?.state === "audio",
        ),
        false,
      );
    } finally {
      releaseWrite.resolve();
      state.close();
    }
  });

  it("rejects malformed slot routes and unsupported methods without storage", async () => {
    const state = seedDatabase();
    try {
      const invalidPaths = [
        "/api/lesson-recordings/other/01-peppas-high-ball/scenes/0/steps/2",
        "/api/lesson-recordings/parrot/./scenes/0/steps/2",
        "/api/lesson-recordings/parrot/%E0%A4%A/scenes/0/steps/2",
        "/api/lesson-recordings/parrot/01-peppas-high-ball/scenes/-1/steps/2",
        "/api/lesson-recordings/parrot/01-peppas-high-ball/scenes/0/steps/2.5",
        "/api/lesson-recordings/parrot/01-peppas-high-ball/scenes/9007199254740992/steps/2",
        `${BUILT_IN_PATH}/extra`,
      ];
      for (const path of invalidPaths) {
        const bucket = createBucket();
        assert.equal((await call(state, bucket, path)).status, 404, path);
        assert.equal(bucket.calls.put.length, 0, path);
      }

      const bucket = createBucket();
      const method = await call(state, bucket, BUILT_IN_PATH, {
        body: null,
        contentType: null,
        method: "POST",
      });
      assert.equal(method.status, 405);
      assert.equal(method.headers.get("Allow"), "PUT");
      assert.equal(bucket.calls.put.length, 0);
    } finally {
      state.close();
    }
  });

  it("rejects missing consent and a permanent account deletion before writing", async () => {
    const noConsent = seedDatabase({ consent: false });
    try {
      const bucket = createBucket();
      const response = await call(noConsent, bucket);
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        error: "guardian_consent_required",
      });
      assert.equal(bucket.calls.put.length, 0);
    } finally {
      noConsent.close();
    }

    const deleting = seedDatabase();
    try {
      await markAccountDeletionPending(deleting.database, USER_ID);
      const bucket = createBucket();
      const response = await call(deleting, bucket);
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        error: "account_deletion_pending",
      });
      assert.equal(bucket.calls.put.length, 0);
    } finally {
      deleting.close();
    }
  });

  it("accepts WebM, MP4, and Ogg magic and rejects empty, oversized, or mismatched media", async () => {
    const state = seedDatabase();
    try {
      for (const [contentType, body] of [
        ["audio/webm", WEBM],
        ["audio/mp4; codecs=mp4a.40.2", MP4],
        ["audio/ogg", OGG],
      ]) {
        assert.equal(
          (await call(state, createBucket(), BUILT_IN_PATH, { body, contentType })).status,
          201,
          contentType,
        );
      }

      for (const [name, expectedStatus, body, contentType] of [
        ["empty", 400, new Uint8Array(), "audio/webm"],
        ["oversized", 413, new Uint8Array(512 * 1024 + 1), "audio/webm"],
        ["mismatched", 415, OGG, "audio/webm"],
        ["unsupported", 415, WEBM, "audio/wav"],
        ["missing type", 415, WEBM, null],
      ]) {
        const bucket = createBucket();
        const response = await call(state, bucket, BUILT_IN_PATH, {
          body,
          contentType,
        });
        assert.equal(response.status, expectedStatus, name);
        assert.equal(bucket.calls.put.length, 0, name);
      }
    } finally {
      state.close();
    }
  });

  it("gives identical takes distinct ETags and keeps only the latest nonce", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    try {
      assert.equal((await call(state, bucket, BUILT_IN_PATH, {
        body: WEBM,
        createUploadNonce: () => "upload-first",
      })).status, 201);
      const firstObject = [...bucket.stored.values()][0].object;
      assert.equal((await call(state, bucket, BUILT_IN_PATH, {
        body: WEBM,
        createUploadNonce: () => "upload-second",
      })).status, 201);

      assert.equal(bucket.stored.size, 1);
      const latest = [...bucket.stored.values()][0];
      assert.notEqual(firstObject.etag, latest.object.etag);
      assert.equal(latest.options.customMetadata.uploadNonce, "upload-second");
      assert.deepEqual(
        latest.bytes.slice(Number(latest.options.customMetadata.payloadOffset)),
        WEBM,
      );
      const writes = audioWrites(bucket);
      assert.equal(writes[0].key, writes[1].key);
    } finally {
      state.close();
    }
  });

  it("keeps concurrent valid latest-take writes as one complete audio object", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    const firstAudioReached = deferred();
    const releaseFirstAudio = deferred();
    let held = false;
    bucket.onBeforeAudioPut = async ({ options }) => {
      if (!held && options.customMetadata.uploadNonce === "upload-a") {
        held = true;
        firstAudioReached.resolve();
        await releaseFirstAudio.promise;
      }
    };

    try {
      const first = call(state, bucket, BUILT_IN_PATH, {
        createUploadNonce: () => "upload-a",
      });
      await firstAudioReached.promise;
      const second = await call(state, bucket, BUILT_IN_PATH, {
        createUploadNonce: () => "upload-b",
      });
      releaseFirstAudio.resolve();

      assert.equal(second.status, 201);
      assert.equal((await first).status, 201);
      assert.equal(bucket.stored.size, 1);
      const current = [...bucket.stored.values()][0];
      assert.equal(current.options.customMetadata.state, "audio");
      assert.equal(current.options.customMetadata.uploadNonce, "upload-a");
      assert.deepEqual(
        current.bytes.slice(Number(current.options.customMetadata.payloadOffset)),
        WEBM,
      );
    } finally {
      releaseFirstAudio.resolve();
      state.close();
    }
  });

  it("conditionally fences the exact take when consent is revoked after writing", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    bucket.onAudioPut = async () => setConsent(state, false);
    try {
      const response = await call(state, bucket, BUILT_IN_PATH, {
        createUploadNonce: () => "revoked-upload",
      });

      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        error: "guardian_consent_required",
      });
      assert.equal(bucket.calls.put.length, 3);
      const audioWrite = audioWrites(bucket)[0];
      const fenceWrite = bucket.calls.put.find(
        ({ options }) => options.customMetadata?.state === "consent-revoked",
      );
      assert.deepEqual(fenceWrite.options.onlyIf, {
        etagMatches: audioWrite.bytes.length
          ? createHash("md5").update(audioWrite.bytes).digest("hex")
          : "",
      });
      assert.equal(
        [...bucket.stored.values()][0].options.customMetadata.state,
        "consent-revoked",
      );
      assert.equal(
        [...bucket.stored.values()][0].bytes.byteLength < 128,
        true,
      );
    } finally {
      state.close();
    }
  });

  it("does not let stale cleanup fence a newer identical re-consented take", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    const staleCleanupStarted = deferred();
    const releaseStaleCleanup = deferred();
    let held = false;
    let staleAudioStored = false;
    bucket.onAudioPut = async ({ options }) => {
      if (options.customMetadata.uploadNonce === "upload-a") {
        staleAudioStored = true;
        setConsent(state, false);
      }
    };
    bucket.onHead = async () => {
      if (!held && staleAudioStored) {
        held = true;
        staleCleanupStarted.resolve();
        await releaseStaleCleanup.promise;
      }
    };

    try {
      const stale = call(state, bucket, BUILT_IN_PATH, {
        createUploadNonce: () => "upload-a",
      });
      await staleCleanupStarted.promise;
      setConsent(state, true);
      const newer = await call(state, bucket, BUILT_IN_PATH, {
        createUploadNonce: () => "upload-b",
      });
      releaseStaleCleanup.resolve();

      assert.equal(newer.status, 201);
      assert.equal((await stale).status, 403);
      const current = [...bucket.stored.values()][0];
      assert.deepEqual(
        current.bytes.slice(Number(current.options.customMetadata.payloadOffset)),
        WEBM,
      );
      assert.equal(current.options.customMetadata.state, "audio");
      assert.equal(current.options.customMetadata.uploadNonce, "upload-b");
    } finally {
      releaseStaleCleanup.resolve();
      state.close();
    }
  });

  it("keeps B when stale cleanup heads A before B lands at the conditional fence", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    const conditionalFenceReached = deferred();
    const releaseConditionalFence = deferred();
    let held = false;
    bucket.onAudioPut = async ({ options }) => {
      if (options.customMetadata.uploadNonce === "upload-a") {
        setConsent(state, false);
      }
    };
    bucket.onConditionalPut = async ({ options }) => {
      if (!held && options.customMetadata?.state === "consent-revoked") {
        held = true;
        conditionalFenceReached.resolve();
        await releaseConditionalFence.promise;
      }
    };

    try {
      const stale = call(state, bucket, BUILT_IN_PATH, {
        body: WEBM,
        createUploadNonce: () => "upload-a",
      });
      await conditionalFenceReached.promise;
      setConsent(state, true);
      const newer = await call(state, bucket, BUILT_IN_PATH, {
        body: WEBM,
        createUploadNonce: () => "upload-b",
      });
      releaseConditionalFence.resolve();

      assert.equal(newer.status, 201);
      assert.equal((await stale).status, 403);
      const current = [...bucket.stored.values()][0];
      assert.deepEqual(
        current.bytes.slice(Number(current.options.customMetadata.payloadOffset)),
        WEBM,
      );
      assert.equal(current.options.customMetadata.state, "audio");
      assert.equal(current.options.customMetadata.uploadNonce, "upload-b");
      const failedFence = bucket.calls.put.find(
        ({ options, stored }) =>
          options.customMetadata?.state === "consent-revoked" && !stored,
      );
      assert.ok(failedFence);
      const staleAudio = audioWrites(bucket).find(
        ({ options }) => options.customMetadata.uploadNonce === "upload-a",
      );
      assert.deepEqual(failedFence?.options.onlyIf, {
        etagMatches: createHash("md5").update(staleAudio.bytes).digest("hex"),
      });
      assert.notEqual(failedFence.options.onlyIf.etagMatches, current.object.etag);
    } finally {
      releaseConditionalFence.resolve();
      state.close();
    }
  });

  it("conditionally fences a take when account deletion starts after writing", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    bucket.onAudioPut = async () => {
      await markAccountDeletionPending(state.database, USER_ID);
    };
    try {
      const response = await call(state, bucket, BUILT_IN_PATH, {
        createUploadNonce: () => "deleting-upload",
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        error: "account_deletion_pending",
      });
      assert.equal(bucket.calls.put.length, 3);
      assert.equal(
        [...bucket.stored.values()][0].options.customMetadata.state,
        "account-deleting",
      );
    } finally {
      state.close();
    }
  });

  it("cannot write audio after a completed account sweep even when cleanup fails", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    const audioStored = deferred();
    const releaseStoredAudio = deferred();
    const key =
      "personalized-story-art/user-1/lesson-recordings/parrot/01-peppas-high-ball/scene-0/step-2.audio";
    bucket.onAudioPut = async () => {
      audioStored.resolve();
      await releaseStoredAudio.promise;
    };

    try {
      const staleUpload = call(state, bucket, BUILT_IN_PATH, {
        createUploadNonce: () => "held-before-deletion",
      });
      await audioStored.promise;

      await prepareAccountDeletion({
        bucket,
        database: state.database,
        now: () => new Date(RECORDED_AT),
        userId: USER_ID,
        wait: async () => {},
      });
      const deletionMarker = bucket.stored.get(markerKey(USER_ID))?.object;
      assert.equal(deletionMarker?.customMetadata.state, "account-deleting");
      const deletionFence = bucket.stored.get(key)?.object;
      assert.equal(deletionFence?.customMetadata.state, "account-deleting");
      assert.equal(
        deletionFence?.customMetadata.generation,
        deletionMarker?.customMetadata.generation,
      );

      bucket.onHead = async (headKey) => {
        if (headKey === key) throw new Error("upload cleanup head failed");
      };
      releaseStoredAudio.resolve();

      const response = await staleUpload;
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: "internal_error" });
      assert.equal(
        [...bucket.stored.values()].some(
          ({ options }) => options.customMetadata?.state === "audio",
        ),
        false,
      );
      assert.deepEqual(
        bucket.stored.get(key)?.object,
        deletionFence,
        "Failed upload cleanup must not replace the durable lesson fence",
      );
      assert.deepEqual(
        bucket.stored.get(markerKey(USER_ID))?.object,
        deletionMarker,
        "The stale upload must not replace the durable deletion marker",
      );
    } finally {
      releaseStoredAudio.resolve();
      state.close();
    }
  });

  it("retries a transient exact-take fence failure with bounded pacing", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    const put = bucket.put.bind(bucket);
    const waits = [];
    let fenceAttempts = 0;
    bucket.onAudioPut = async () => setConsent(state, false);
    bucket.put = async (key, value, options) => {
      if (options.customMetadata?.state === "consent-revoked") {
        fenceAttempts += 1;
        if (fenceAttempts === 1) {
          throw new Error("fence: TooManyRequests (10058)");
        }
      }
      return put(key, value, options);
    };

    try {
      const response = await call(state, bucket, BUILT_IN_PATH, {
        createUploadNonce: () => "retry-fence",
        wait: async (delay) => { waits.push(delay); },
      });

      assert.equal(response.status, 403);
      assert.equal(fenceAttempts, 2);
      assert.equal(waits.length, 1);
      assert.equal(waits[0] >= 1_000, true);
      assert.equal(
        [...bucket.stored.values()].some(
          ({ options }) => options.customMetadata?.state === "audio",
        ),
        false,
      );
    } finally {
      state.close();
    }
  });
});
