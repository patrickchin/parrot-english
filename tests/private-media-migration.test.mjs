import assert from "node:assert/strict";
import { webcrypto as crypto } from "node:crypto";
import { describe, it } from "node:test";
import { TextDecoder, TextEncoder } from "node:util";
import {
  privateMediaSourceFingerprint,
  runPrivateMediaMigration,
} from "../scripts/private-media-migration.ts";

const encoder = new TextEncoder();

function concat(...parts) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function webm(seed) {
  return new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, seed & 0xff]);
}

function listed(key, body, customMetadata, httpMetadata = {}) {
  return {
    body,
    customMetadata,
    etag: `etag-${key}`,
    httpMetadata,
    key,
    size: body.length,
    uploaded: new Date("2026-09-02T00:00:00.000Z"),
    version: `version-${key}`,
  };
}

function r2Body(object) {
  const body = object.body.slice();
  return {
    ...object,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    blob: async () => new Blob([body]),
    body: new Blob([body]).stream(),
    bytes: async () => body.slice(),
    json: async () => JSON.parse(new TextDecoder().decode(body)),
    text: async () => new TextDecoder().decode(body),
    writeHttpMetadata(headers) {
      for (const [key, value] of Object.entries(object.httpMetadata ?? {})) {
        if (value !== undefined) headers.set(key, String(value));
      }
    },
  };
}

class MemoryBucket {
  constructor(objects = []) {
    this.objects = new Map(objects.map((object) => [object.key, object]));
    this.writes = [];
    this.failWriteAt = null;
    this.getTransform = null;
    this.listCalls = 0;
    this.onList = null;
  }

  async get(key, options = {}) {
    const object = this.objects.get(key);
    if (!object ||
      (options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== object.etag)) {
      return null;
    }
    return r2Body(this.getTransform?.(object) ?? object);
  }

  async list() {
    this.listCalls += 1;
    this.onList?.(this, this.listCalls);
    return {
      objects: [...this.objects.values()].map((stored) =>
        Object.fromEntries(
          Object.entries(stored).filter(([key]) => key !== "body"),
        )
      ),
      truncated: false,
    };
  }

  async put(key, value, options = {}) {
    if (this.failWriteAt === this.writes.length + 1) {
      throw new Error("seeded provider failure containing guardian@example.test and a/raw/key");
    }
    if (options.onlyIf?.etagDoesNotMatch === "*" && this.objects.has(key)) return null;
    const body = value instanceof Uint8Array
      ? value.slice()
      : new Uint8Array(await new Response(value).arrayBuffer());
    const object = listed(
      key,
      body,
      { ...(options.customMetadata ?? {}) },
      { ...(options.httpMetadata ?? {}) },
    );
    this.objects.set(key, object);
    this.writes.push({ key, object });
    return object;
  }
}

class MemoryDatabase {
  constructor(users, tombstones) {
    this.users = users;
    this.tombstones = tombstones;
  }

  prepare(sql) {
    const { tombstones, users } = this;
    return {
      bind(...bindings) {
        return {
          async all() {
            if (!sql.includes("FROM user u")) throw new Error("unexpected all query");
            return { results: users.get(bindings[0]) ?? [], success: true };
          },
          async first() {
            if (sql.includes("FROM d1_migrations")) return { applied: 1 };
            if (sql.includes("FROM account_deletion_tombstone")) {
              return tombstones.get(bindings[0]) ?? null;
            }
            if (sql.includes("SELECT 1 AS present FROM user")) {
              return users.has(bindings[0]) ? { present: 1 } : null;
            }
            throw new Error("unexpected first query");
          },
        };
      },
    };
  }
}

async function digest(value) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function dubObject({
  account,
  dubId,
  generation,
  learner,
  lineId,
  nonce,
  peaks = false,
  version = "guardian-voice-r2-v2",
}) {
  const prefix = encoder.encode(JSON.stringify([
    "parrot-dub-audio-v2",
    "legacy",
    nonce,
  ]));
  const keyPrefix = learner
    ? `personalized-story-art/${account}/learners/${learner}`
    : `personalized-story-art/${account}`;
  return listed(
    `${keyPrefix}/learner-dubs/${dubId}/${lineId}.audio`,
    concat(prefix, webm(nonce.length)),
    {
      generation: "legacy",
      ...(version.endsWith("v2")
        ? { guardianConsentGeneration: generation }
        : {}),
      guardianConsentVersion: version,
      lineId,
      payloadOffset: String(prefix.length),
      ...(peaks ? { peakBars: JSON.stringify(Array.from({ length: 32 }, (_, i) => i)) } : {}),
      recordedAt: "2026-09-02T00:00:00.000Z",
      state: "audio",
      uploadNonce: nonce,
    },
    { contentType: "audio/webm" },
  );
}

function lessonObject({ account, learner, lessonId, sceneIndex, stepIndex, targetText }) {
  const nonce = `lesson-${lessonId}-${sceneIndex}-${stepIndex}`;
  const prefix = encoder.encode(JSON.stringify([
    "parrot-lesson-recording-audio-v1",
    nonce,
  ]));
  return listed(
    `personalized-story-art/${account}/learners/${learner}/lesson-recordings/parrot/${lessonId}/scene-${sceneIndex}/step-${stepIndex}.audio`,
    concat(prefix, webm(stepIndex)),
    {
      consentGeneration: "1",
      consentVersion: "lesson-join-in-recording-v1",
      lessonId,
      payloadOffset: String(prefix.length),
      recordedAt: "2026-09-02T00:00:00.000Z",
      sceneIndex: String(sceneIndex),
      source: "parrot",
      state: "audio",
      stepIndex: String(stepIndex),
      targetText,
      uploadNonce: nonce,
    },
    { cacheControl: "private, no-store", contentType: "audio/webm" },
  );
}

async function fixture() {
  const generations = {
    a: "grant-a",
    b: "grant-b",
    b2: "grant-b2",
    c: "grant-c",
  };
  const audio = [
    dubObject({ account: "user-a", dubId: "five-little-ducks-v2", generation: generations.a, lineId: "line-1", nonce: "a-1", peaks: true }),
  ];
  for (let line = 1; line <= 9; line += 1) {
    audio.push(dubObject({
      account: "user-b",
      dubId: "five-little-ducks-v1",
      generation: generations.b,
      lineId: `line-${line}`,
      nonce: `b-retired-${line}`,
      version: "guardian-voice-r2-v1",
    }));
  }
  for (let line = 1; line <= 24; line += 1) {
    audio.push(dubObject({
      account: "user-b",
      dubId: "five-little-ducks-v2",
      generation: generations.b,
      lineId: `line-${line}`,
      nonce: `b-ducks-${line}`,
      version: line >= 5 && line <= 9
        ? "guardian-voice-r2-v1"
        : "guardian-voice-r2-v2",
    }));
  }
  audio.push(
    dubObject({ account: "user-b", dubId: "mary-had-a-little-lamb-v1", generation: generations.b, lineId: "mary-had-a-little-lamb-v1-line-5", nonce: "b-mary" }),
    dubObject({ account: "user-b", dubId: "old-macdonald-v1", generation: generations.b, lineId: "old-macdonald-v1-line-1", nonce: "b-old-1" }),
    dubObject({ account: "user-b", dubId: "old-macdonald-v1", generation: generations.b, lineId: "old-macdonald-v1-line-2", nonce: "b-old-2" }),
    dubObject({ account: "user-b", dubId: "twinkle-twinkle-v1", generation: generations.b, lineId: "twinkle-twinkle-v1-line-1", nonce: "b-twinkle" }),
    dubObject({ account: "user-b", dubId: "five-little-ducks-v2", generation: generations.b2, learner: "learner-b2", lineId: "line-5", nonce: "b2-ducks" }),
  );
  const lessons = [
    ["01-peppas-high-ball", 0, 2, "It is up high!"],
    ["01-peppas-high-ball", 1, 1, "Oh! I can't reach it."],
    ["01-peppas-high-ball", 2, 1, "Can you help me, please?"],
    ["01-peppas-high-ball", 4, 1, "Here you are!"],
    ["01-peppas-high-ball", 4, 3, "Thank you!"],
    ["07-bedtime-story", 2, 1, "I'm sleepy."],
    ["07-bedtime-story", 4, 1, "Good night!"],
  ];
  for (const [lessonId, sceneIndex, stepIndex, targetText] of lessons) {
    audio.push(lessonObject({
      account: "user-b",
      learner: "learner-b2",
      lessonId,
      sceneIndex,
      stepIndex,
      targetText,
    }));
  }
  audio.push(
    dubObject({ account: "user-c", dubId: "old-macdonald-v1", generation: generations.c, lineId: "old-macdonald-v1-line-1", nonce: "c-old-1", peaks: true }),
    dubObject({ account: "user-c", dubId: "old-macdonald-v1", generation: generations.c, lineId: "old-macdonald-v1-line-3", nonce: "c-old-3", peaks: true }),
    dubObject({ account: "user-c", dubId: "old-macdonald-v1", generation: generations.c, lineId: "old-macdonald-v1-line-9", nonce: "c-old-9", peaks: true }),
    dubObject({ account: "user-c", dubId: "twinkle-twinkle-v1", generation: generations.c, lineId: "twinkle-twinkle-v1-line-1", nonce: "c-twinkle", peaks: true }),
  );

  const tombstones = new Map();
  const deleted = [];
  const deletedAccounts = Array.from({ length: 9 }, (_, index) => `deleted-${index + 1}`);
  for (const [index, account] of deletedAccounts.entries()) {
    const userHash = await digest(account);
    const requestedAt = 1_788_158_012_730 + index;
    tombstones.set(userHash, {
      r2_prefix: `personalized-story-art/${account}/`,
      requested_at: requestedAt,
    });
    for (let marker = index; marker < 59; marker += deletedAccounts.length) {
      const generation = `account-deletion-v1:${userHash}:${requestedAt}`;
      deleted.push(listed(
        `personalized-story-art/${account}/learner-dubs/deleted-${marker}/.dub-generation`,
        new Uint8Array(152),
        { generation, state: "account-deleting" },
      ));
    }
    for (let slot = index; slot < 884; slot += deletedAccounts.length) {
      const generation = `account-deletion-v1:${userHash}:${requestedAt}`;
      deleted.push(listed(
        `personalized-story-art/${account}/learner-dubs/deleted-${Math.floor(slot / 100)}/line-${slot}.audio`,
        new Uint8Array(150),
        { generation, state: "account-deleting" },
      ));
    }
  }

  const row = ({ email, id, legacy, generation, lesson = false, name }) => ({
    dub_consent_state: "granted",
    dub_consent_version: "guardian-voice-r2-v2",
    dub_grant_generation: generation,
    email,
    learner_deleting: 0,
    learner_id: id,
    legacy_storage_owner: legacy ? 1 : 0,
    lesson_recording_cleanup_before_generation: null,
    lesson_recording_consent_version: lesson
      ? "lesson-join-in-recording-v1"
      : null,
    lesson_recording_generation: lesson ? 1 : 0,
    private_media_name: name,
  });
  const users = new Map([
    ["user-a", [row({ email: "a@example.test", id: "learner-a", legacy: true, generation: generations.a, name: "Learner" })]],
    ["user-b", [
      row({ email: "b@example.test", id: "learner-b", legacy: true, generation: generations.b, name: "Mary" }),
      row({ email: "b@example.test", id: "learner-b2", legacy: false, generation: generations.b2, lesson: true, name: "Bob" }),
    ]],
    ["user-c", [row({ email: "c@example.test", id: "learner-c", legacy: true, generation: generations.c, name: "Learner" })]],
  ]);
  const sourceObjects = [...audio, ...deleted];
  const source = new MemoryBucket(sourceObjects);
  const destination = new MemoryBucket();
  const markerBytes = encoder.encode(JSON.stringify([
    "parrot-dub-fence-v1",
    "marker",
    "legacy",
    "ready",
  ])).length;
  const audioBytes = audio.reduce((sum, object) => sum + object.size, 0);
  const fenceBytes = deleted.reduce((sum, object) => sum + object.size, 0);
  const expected = {
    activeAudioObjects: 41,
    audioBytes,
    audioObjects: 50,
    currentAccounts: 3,
    deletedAccounts: 9,
    destinationBytes: audioBytes + markerBytes * 8,
    destinationObjects: 58,
    fenceBytes,
    fenceMarkerObjects: 59,
    fenceObjects: 943,
    fenceSlotObjects: 884,
    mappedLearners: 4,
    markerObjects: 8,
    peakBarObjects: 5,
    retiredAudioObjects: 9,
    sourceBytes: audioBytes + fenceBytes,
    sourceObjects: 993,
    sourceSnapshotSha256: await privateMediaSourceFingerprint(
      sourceObjects.map((stored) =>
        Object.fromEntries(
          Object.entries(stored).filter(([key]) => key !== "body"),
        )
      ),
    ),
    upgradedConsentObjects: 5,
  };
  return {
    destination,
    env: {
      DB: new MemoryDatabase(users, tombstones),
      DESTINATION_BUCKET: destination,
      SOURCE_BUCKET: source,
    },
    expected,
    source,
  };
}

describe("one-shot private-media migration", () => {
  it("plans without writes, copies recordings before eight markers, and reruns idempotently", async () => {
    const state = await fixture();
    const plan = await runPrivateMediaMigration(state.env, {
      expected: state.expected,
    });
    assert.equal(plan.mode, "plan");
    assert.equal(state.destination.writes.length, 0);

    const copied = await runPrivateMediaMigration(state.env, {
      apply: true,
      expected: state.expected,
    });
    assert.equal(copied.copiedObjects, 50);
    assert.equal(copied.destinationObjects, 58);
    assert.equal(copied.markerObjects, 8);
    assert.ok(
      state.destination.writes.slice(0, 50).every(({ key }) =>
        !key.endsWith("/.dub-generation")
      ),
    );
    assert.ok(
      state.destination.writes.slice(50).every(({ key }) =>
        key.endsWith("/.dub-generation")
      ),
    );
    assert.equal(
      [...state.destination.objects.keys()].filter((key) =>
        key.includes("/recordings/retired/nursery-rhymes/five-little-ducks-v1/")
      ).length,
      9,
    );
    assert.equal(
      [...state.destination.objects.keys()].filter((key) =>
        key.includes("/nursery-rhymes/five-little-ducks-v1/") &&
        !key.includes("/recordings/retired/")
      ).length,
      0,
    );
    const upgraded = [...state.destination.objects.values()].filter(({ customMetadata, key }) =>
      key.includes("/recordings/nursery-rhymes/five-little-ducks-v2/line-") &&
      customMetadata.guardianConsentGeneration === "grant-b"
    );
    assert.equal(upgraded.length, 24);
    assert.ok(upgraded.every(({ customMetadata }) =>
      customMetadata.guardianConsentVersion === "guardian-voice-r2-v2"
    ));
    const retired = [...state.destination.objects.values()].filter(({ key }) =>
      key.includes("/recordings/retired/")
    );
    assert.ok(retired.every(({ customMetadata }) =>
      customMetadata.guardianConsentVersion === "guardian-voice-r2-v1" &&
      customMetadata.guardianConsentGeneration === undefined
    ));

    const writes = state.destination.writes.length;
    const rerun = await runPrivateMediaMigration(state.env, {
      apply: true,
      expected: state.expected,
    });
    assert.equal(rerun.copiedObjects, 0);
    assert.equal(state.destination.writes.length, writes);
  });

  it("never publishes a marker when an audio copy fails", async () => {
    const state = await fixture();
    state.destination.failWriteAt = 50;
    await assert.rejects(
      runPrivateMediaMigration(state.env, {
        apply: true,
        expected: state.expected,
      }),
      /seeded provider failure/,
    );
    assert.equal(state.destination.writes.length, 49);
    assert.ok(state.destination.writes.every(({ key }) =>
      !key.endsWith("/.dub-generation")
    ));
  });

  it("revalidates source GET revisions and the entire destination before markers", async () => {
    for (const revision of [
      { version: "replacement-version" },
      { uploaded: new Date("2026-09-02T00:00:00.001Z") },
    ]) {
      const state = await fixture();
      state.source.getTransform = (object) => ({ ...object, ...revision });
      await assert.rejects(
        runPrivateMediaMigration(state.env, {
          apply: true,
          expected: state.expected,
        }),
        (error) => error.code === "source_object_changed",
      );
      assert.equal(state.destination.writes.length, 0);
    }

    const destinationDrift = await fixture();
    destinationDrift.destination.onList = (bucket, calls) => {
      if (calls === 2) {
        bucket.objects.set(
          "foreign-object",
          listed("foreign-object", new Uint8Array([1]), {}),
        );
      }
    };
    await assert.rejects(
      runPrivateMediaMigration(destinationDrift.env, {
        apply: true,
        expected: destinationDrift.expected,
      }),
      (error) => error.code === "destination_contains_unexpected_object",
    );
    assert.equal(destinationDrift.destination.writes.length, 50);
    assert.ok(destinationDrift.destination.writes.every(({ key }) =>
      !key.endsWith("/.dub-generation")
    ));
  });

  it("fails closed on source drift and never exposes provider PII in HTTP errors", async () => {
    const state = await fixture();
    const first = state.source.objects.values().next().value;
    first.customMetadata = { ...first.customMetadata, state: "changed" };
    await assert.rejects(
      runPrivateMediaMigration(state.env, { expected: state.expected }),
      (error) => error.code === "source_snapshot_changed",
    );
    assert.equal(state.destination.writes.length, 0);

    const versionDrift = await fixture();
    versionDrift.source.objects.values().next().value.version = "replacement-version";
    await assert.rejects(
      runPrivateMediaMigration(versionDrift.env, { expected: versionDrift.expected }),
      (error) => error.code === "source_snapshot_changed",
    );

    const uploadedDrift = await fixture();
    uploadedDrift.source.objects.values().next().value.uploaded =
      new Date("2026-09-02T00:00:00.001Z");
    await assert.rejects(
      runPrivateMediaMigration(uploadedDrift.env, { expected: uploadedDrift.expected }),
      (error) => error.code === "source_snapshot_changed",
    );

    const errors = [];
    const originalError = console.error;
    console.error = (...values) => errors.push(values.join(" "));
    try {
      const worker = (await import("../scripts/private-media-migration.ts")).default;
      const response = await worker.fetch(
        new Request("http://localhost/plan", { method: "POST" }),
        {
          DB: {},
          DESTINATION_BUCKET: {},
          SOURCE_BUCKET: {
            async list() {
              throw new Error("guardian@example.test personalized-story-art/a/raw/key");
            },
          },
        },
      );
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { error: "internal_error" });
    } finally {
      console.error = originalError;
    }
    assert.doesNotMatch(errors.join("\n"), /guardian@example\.test|raw\/key/);
  });
});
