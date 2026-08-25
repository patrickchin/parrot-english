import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { markAccountDeletionPending } from "../worker/account-deletion.ts";
import { createDatabase } from "../worker/database.ts";
import { handleLessonRecordingRequest } from "../worker/lesson-recordings.ts";
import { handleMyLessonRequest } from "../worker/my-lessons.ts";
import { createLessonScript } from "./fixtures/lesson-script.mjs";
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
      (id, auth_user_id, name, onboarding_status,
       lesson_recording_consent_version, lesson_recording_consent_at,
       created_at, updated_at)
     VALUES (?, ?, ?, 'completed', ?, ?, ?, ?)`,
  );
  insertProfile.run(
    "profile-1",
    USER_ID,
    "Mia",
    consent ? CONSENT_VERSION : null,
    consent ? timestamp : null,
    timestamp,
    timestamp,
  );
  insertProfile.run(
    "profile-2",
    "user-2",
    "Noah",
    CONSENT_VERSION,
    timestamp,
    timestamp,
    timestamp,
  );
  const insertLesson = state.sqlite.prepare(
    `INSERT INTO learner_lesson
      (id, auth_user_id, source, lesson_json, created_at, updated_at)
     VALUES (?, ?, 'uploaded', ?, ?, ?)`,
  );
  insertLesson.run(
    "lesson-1",
    USER_ID,
    JSON.stringify(createLessonScript()),
    timestamp,
    timestamp,
  );
  insertLesson.run(
    "other-lesson",
    "user-2",
    JSON.stringify(createLessonScript({ childName: "Noah" })),
    timestamp,
    timestamp,
  );
  return { ...state, database: createDatabase(state.d1) };
}

function setConsent(state, enabled) {
  state.sqlite.prepare(
    `UPDATE learner_profile
     SET lesson_recording_consent_version = ?, lesson_recording_consent_at = ?
     WHERE auth_user_id = ?`,
  ).run(
    enabled ? CONSENT_VERSION : null,
    enabled ? Date.parse(RECORDED_AT) : null,
    USER_ID,
  );
}

function setMyLessonTarget(state, targetText) {
  const lesson = createLessonScript();
  lesson.scenes[0].steps[1].dialogue = targetText;
  state.sqlite.prepare(
    "UPDATE learner_lesson SET lesson_json = ? WHERE id = ? AND auth_user_id = ?",
  ).run(JSON.stringify(lesson), "lesson-1", USER_ID);
}

function request(path, {
  body = WEBM,
  contentType = "audio/webm",
  method = "PUT",
} = {}) {
  return new Request(`https://example.test${path}`, {
    method,
    ...(body === null ? {} : { body }),
    headers: contentType === null ? {} : { "Content-Type": contentType },
  });
}

function call(state, bucket, path = BUILT_IN_PATH, options = {}) {
  return handleLessonRecordingRequest(
    {
      database: state.database,
      env: { DB: state.d1, PERSONALIZED_STORY_ART_BUCKET: bucket },
      identity: {
        sessionId: "session-1",
        userId: options.userId ?? USER_ID,
        userName: "Parent",
      },
      request: request(path, options),
    },
    {
      createUploadNonce: options.createUploadNonce ?? (() => "upload-1"),
      now: () => new Date(RECORDED_AT),
    },
  );
}

function editMyLesson(state, bucket, lesson) {
  return handleMyLessonRequest({
    database: state.database,
    env: {
      DB: state.d1,
      GROQ_API_KEY: "test-key",
      PERSONALIZED_STORY_ART_BUCKET: bucket,
    },
    identity: {
      sessionId: "session-1",
      userId: USER_ID,
      userName: "Parent",
    },
    request: new Request("https://example.test/api/lessons/my/lesson-1", {
      body: JSON.stringify({ lesson }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    }),
  });
}

describe("lesson recording Worker handler", () => {
  it("returns only the persisted consent state and supports only GET", async () => {
    const state = seedDatabase();
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
      assert.deepEqual(await response.json(), { enabled: true });

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
      assert.equal(bucket.calls.put[0].key,
        "personalized-story-art/user-1/lesson-recordings/parrot/01-peppas-high-ball/scene-0/step-2.audio");
      const envelope = JSON.stringify([
        AUDIO_ENVELOPE_FORMAT,
        "upload-built-in",
      ]);
      const payloadOffset = new TextEncoder().encode(envelope).byteLength;
      assert.equal(
        new TextDecoder().decode(bucket.calls.put[0].bytes.slice(0, payloadOffset)),
        envelope,
      );
      assert.deepEqual(bucket.calls.put[0].bytes.slice(payloadOffset), WEBM);
      assert.deepEqual(bucket.calls.put[0].options.httpMetadata, {
        cacheControl: "private, no-store",
        contentType: "audio/webm",
      });
      assert.deepEqual(bucket.calls.put[0].options.customMetadata, {
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

  it("resolves only owner-scoped My Lesson user steps", async () => {
    const state = seedDatabase();
    try {
      const bucket = createBucket();
      const owned = await call(
        state,
        bucket,
        "/api/lesson-recordings/my/lesson-1/scenes/0/steps/1?targetText=forged",
      );
      assert.equal(owned.status, 201);
      assert.equal(
        bucket.calls.put[0].options.customMetadata.targetText,
        "Can you help me?",
      );

      for (const path of [
        "/api/lesson-recordings/my/other-lesson/scenes/0/steps/1",
        "/api/lesson-recordings/my/lesson-1/scenes/0/steps/0",
        "/api/lesson-recordings/parrot/01-peppas-high-ball/scenes/0/steps/0",
      ]) {
        const isolatedBucket = createBucket();
        const response = await call(state, isolatedBucket, path);
        assert.equal(response.status, 404, path);
        assert.deepEqual(await response.json(), { error: "not_found" }, path);
        assert.equal(isolatedBucket.calls.put.length, 0, path);
      }
    } finally {
      state.close();
    }
  });

  it("fences an in-flight My Lesson take when an edit purges before its write", async () => {
    const state = seedDatabase();
    const bucket = createBucket();
    const uploadReachedStorage = deferred();
    const releaseUpload = deferred();
    bucket.onBeforeAudioPut = async ({ options }) => {
      if (options.customMetadata.uploadNonce === "stale-my-upload") {
        uploadReachedStorage.resolve();
        await releaseUpload.promise;
      }
    };

    try {
      const stale = call(
        state,
        bucket,
        "/api/lesson-recordings/my/lesson-1/scenes/0/steps/1",
        { createUploadNonce: () => "stale-my-upload" },
      );
      await uploadReachedStorage.promise;

      const editedLesson = createLessonScript();
      editedLesson.scenes[0].steps[1].dialogue = "This target changed.";
      const edited = await editMyLesson(state, bucket, editedLesson);
      assert.equal(edited.status, 200);
      assert.equal(bucket.calls.list.length, 1);
      assert.equal(bucket.calls.delete.length, 0);

      releaseUpload.resolve();
      const response = await stale;
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { error: "lesson_changed" });
      const current = [...bucket.stored.values()][0];
      assert.equal(current.options.customMetadata.state, "lesson-changed");
      assert.equal(current.options.customMetadata.invalidatedUploadNonce,
        "stale-my-upload");
    } finally {
      releaseUpload.resolve();
      state.close();
    }
  });

  it("accepts a 4096-byte target and rejects a 4097-byte target before storage", async () => {
    const state = seedDatabase();
    const acceptedTarget = `${"你".repeat(1365)}a`;
    const rejectedTarget = `${"你".repeat(1365)}ab`;
    const encoder = new TextEncoder();
    assert.equal(encoder.encode(acceptedTarget).byteLength, 4096);
    assert.equal(encoder.encode(rejectedTarget).byteLength, 4097);

    try {
      setMyLessonTarget(state, acceptedTarget);
      const acceptedBucket = createBucket();
      const accepted = await call(
        state,
        acceptedBucket,
        "/api/lesson-recordings/my/lesson-1/scenes/0/steps/1",
      );
      assert.equal(accepted.status, 201);
      assert.equal(
        acceptedBucket.calls.put[0].options.customMetadata.targetText,
        acceptedTarget,
      );

      setMyLessonTarget(state, rejectedTarget);
      const rejectedBucket = createBucket();
      const rejected = await call(
        state,
        rejectedBucket,
        "/api/lesson-recordings/my/lesson-1/scenes/0/steps/1",
      );
      assert.equal(rejected.status, 422);
      assert.deepEqual(await rejected.json(), { error: "target_too_large" });
      assert.equal(rejectedBucket.calls.put.length, 0);
    } finally {
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
      assert.equal(bucket.calls.put[0].key, bucket.calls.put[1].key);
    } finally {
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
      assert.equal(bucket.calls.put.length, 2);
      assert.deepEqual(bucket.calls.put[1].options.onlyIf, {
        etagMatches: bucket.calls.put[0].bytes.length
          ? createHash("md5").update(bucket.calls.put[0].bytes).digest("hex")
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
    bucket.onAudioPut = async ({ options }) => {
      if (options.customMetadata.uploadNonce === "upload-a") {
        setConsent(state, false);
      }
    };
    bucket.onHead = async () => {
      if (!held) {
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
      assert.equal(bucket.calls.head.length, 1);

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
      assert.deepEqual(failedFence?.options.onlyIf, {
        etagMatches: createHash("md5")
          .update(bucket.calls.put[0].bytes)
          .digest("hex"),
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
      assert.equal(bucket.calls.put.length, 2);
      assert.equal(
        [...bucket.stored.values()][0].options.customMetadata.state,
        "account-deleting",
      );
    } finally {
      state.close();
    }
  });
});
