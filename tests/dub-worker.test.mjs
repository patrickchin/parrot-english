import assert from "node:assert/strict";
import { describe, it } from "node:test";

const DUB_PATH = "/api/dubs/five-little-ducks-v1";
const CONSENT_HEADERS = {
  "Content-Type": "audio/webm",
  "X-Parrot-Guardian-Consent-Version": "guardian-voice-r2-v1",
};
const LINE_IDS = Array.from({ length: 9 }, (_, index) => `line-${index + 1}`);

function createBucket(seed = []) {
  const stored = new Map(seed);
  const calls = { delete: [], get: [], list: [], put: [] };
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
        body: new Response(item.bytes).body,
        writeHttpMetadata(headers) {
          headers.set("Content-Type", item.options.httpMetadata.contentType);
        },
      };
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
      stored.set(key, {
        bytes: new Uint8Array(bytes),
        options,
        uploaded: new Date("2026-08-25T10:00:00.000Z"),
      });
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
    isDeletionPending: pending,
    now: () => new Date("2026-08-25T10:00:00.000Z"),
  });
}

describe("private learner dub API", () => {
  it("stores and privately streams one encoded owner-scoped WebM slot", async () => {
    const bucket = createBucket();
    const body = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2]);

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
      bytes: body,
      key: "personalized-story-art/user%2Fone/learner-dubs/five-little-ducks-v1/line-1.audio",
      options: {
        customMetadata: {
          guardianConsentVersion: "guardian-voice-r2-v1",
          lineId: "line-1",
          recordedAt: "2026-08-25T10:00:00.000Z",
        },
        httpMetadata: { contentType: "audio/webm" },
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

  it("deletes all nine fixed owner keys and returns a private empty response", async () => {
    const bucket = createBucket();

    const response = await callDub({ bucket, method: "DELETE", path: DUB_PATH });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(bucket.calls.delete, [[
      "personalized-story-art/user-1/learner-dubs/five-little-ducks-v1/line-1.audio",
      "personalized-story-art/user-1/learner-dubs/five-little-ducks-v1/line-2.audio",
      "personalized-story-art/user-1/learner-dubs/five-little-ducks-v1/line-3.audio",
      "personalized-story-art/user-1/learner-dubs/five-little-ducks-v1/line-4.audio",
      "personalized-story-art/user-1/learner-dubs/five-little-ducks-v1/line-5.audio",
      "personalized-story-art/user-1/learner-dubs/five-little-ducks-v1/line-6.audio",
      "personalized-story-art/user-1/learner-dubs/five-little-ducks-v1/line-7.audio",
      "personalized-story-art/user-1/learner-dubs/five-little-ducks-v1/line-8.audio",
      "personalized-story-art/user-1/learner-dubs/five-little-ducks-v1/line-9.audio",
    ]]);
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
