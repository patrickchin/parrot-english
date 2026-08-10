import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { describe, it } from "node:test";
import sharp from "sharp";
import { createDatabase } from "../worker/database.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const STORY_ID = "the-red-ball";
const PAGE_ID = "my-red-ball";
const CONSENT_VERSION = "guardian-photo-cloudflare-v1";
const ROUTE = `/api/stories/${STORY_ID}/personalized-art`;
const ASSET_ROUTE = `${ROUTE}/asset`;
const ART_ALT = "You holding a bright red ball";

function seedDatabase() {
  const state = createTestD1Database();
  const insertUser = state.sqlite.prepare(
    "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
  );
  insertUser.run("user-1", "Parent One", "one@example.test", 1_000, 1_000);
  insertUser.run("user-2", "Parent Two", "two@example.test", 1_000, 1_000);
  return { ...state, database: createDatabase(state.d1) };
}

function request(path, method = "GET", body) {
  return new Request(`https://example.test${path}`, { method, body });
}

function bucketStub(overrides = {}) {
  return {
    async delete() {},
    async get() {
      return null;
    },
    async put() {},
    ...overrides,
  };
}

function failD1RunWhen(d1, predicate) {
  function wrapStatement(statement, sql) {
    return new Proxy(statement, {
      get(target, property) {
        if (property === "bind") {
          return (...parameters) =>
            wrapStatement(target.bind(...parameters), sql);
        }
        if (property === "run" && predicate(sql)) {
          return async () => {
            throw new Error("temporary D1 write failure");
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

function observeD1RunWhen(d1, predicate, { beforeRun, afterRun }) {
  function wrapStatement(statement, sql) {
    return new Proxy(statement, {
      get(target, property) {
        if (property === "bind") {
          return (...parameters) =>
            wrapStatement(target.bind(...parameters), sql);
        }
        if (property === "run" && predicate(sql)) {
          return async () => {
            await beforeRun();
            const result = await target.run();
            afterRun(result);
            return result;
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

async function call(state, options = {}, overrides = {}) {
  const { handlePersonalizedStoryArtRequest } = await import(
    "../worker/personalized-story-art.ts"
  );
  return handlePersonalizedStoryArtRequest(
    {
      database: state.database,
      env: {
        AI: options.ai ?? {
          async run() {
            throw new Error("AI.run must be stubbed");
          },
        },
        ASSETS: options.assets ?? {
          async fetch() {
            throw new Error("ASSETS.fetch must be stubbed");
          },
        },
        DB: options.d1 ?? state.d1,
        PERSONALIZED_STORY_ART_ENABLED: options.enabled ?? "1",
        PERSONALIZED_STORY_ART_DATA_APPROVED: options.dataApproved ?? "1",
        PERSONALIZED_STORY_ART_BUCKET: options.bucket ?? bucketStub(),
      },
      identity: {
        sessionId: "session-1",
        userId: options.userId ?? "user-1",
        userName: "Parent",
      },
      request: request(options.path ?? ROUTE, options.method, options.body),
    },
    overrides,
  );
}

function uploadForm({ consent = true } = {}) {
  const formData = new FormData();
  formData.set(
    "source",
    new File([new Uint8Array([137, 80, 78, 71])], "source.png", {
      type: "image/png",
    }),
  );
  if (consent) {
    formData.set("guardianConsentAccepted", "yes");
    formData.set("guardianConsentVersion", CONSENT_VERSION);
  }
  return formData;
}

function insertReadyArt(
  state,
  {
    contentType = "image/png",
    id = "art-1",
    objectKey,
    storyId = STORY_ID,
    updatedAt = 1_000,
    userId = "user-1",
  },
) {
  state.sqlite
    .prepare(
      `INSERT INTO personalized_story_art (
        id, auth_user_id, story_id, status, r2_object_key, content_type,
        guardian_consent_version, guardian_consent_at, provider,
        prompt_version, created_at, updated_at
      ) VALUES (?, ?, ?, 'ready', ?, ?, ?, ?,
        'cloudflare-workers-ai', 'red-ball-v1', ?, ?)`,
    )
    .run(
      id,
      userId,
      storyId,
      objectKey,
      contentType,
      CONSENT_VERSION,
      1_000,
      1_000,
      updatedAt,
    );
}

function insertGenerationLease(
  state,
  {
    candidateKey = null,
    expiresAt,
    previousKey = null,
    storyId = STORY_ID,
    token = "lease-1",
    userId = "user-1",
  },
) {
  state.sqlite
    .prepare(
      `INSERT INTO personalized_story_art_generation_lease (
        auth_user_id, story_id, generation_token,
        candidate_r2_object_key, previous_r2_object_key,
        lease_expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      storyId,
      token,
      candidateKey,
      previousKey,
      expiresAt,
      1_000,
      1_000,
    );
}

function emptyMetadata(enabled, hasStoredArt = false) {
  return {
    enabled,
    guardianConsentVersion: CONSENT_VERSION,
    hasStoredArt,
    stories: {},
    updatedAt: null,
  };
}

function storedMetadata({
  enabled = true,
  hasStoredArt = true,
  includeStory = true,
  updatedAt = "2026-08-09T10:00:00.000Z",
} = {}) {
  const version = Date.parse(updatedAt);
  return {
    enabled,
    guardianConsentVersion: CONSENT_VERSION,
    hasStoredArt,
    stories: includeStory
      ? {
          [STORY_ID]: {
            pages: {
              [PAGE_ID]: {
                alt: ART_ALT,
                src: `${ASSET_ROUTE}?v=${version}`,
              },
            },
          },
        }
      : {},
    updatedAt,
  };
}

describe("personalized story art Worker handler", () => {
  it("reports the capability as disabled unless both release gates are enabled", async () => {
    const state = seedDatabase();
    try {
      for (const [enabled, dataApproved] of [
        ["0", "0"],
        ["1", "0"],
        ["0", "1"],
      ]) {
        const response = await call(state, { enabled, dataApproved });
        assert.equal(response.status, 200, `${enabled}/${dataApproved}`);
        assert.deepEqual(
          await response.json(),
          emptyMetadata(false),
          `${enabled}/${dataApproved}`,
        );
      }

      const blockedUpload = await call(state, {
        body: uploadForm(),
        dataApproved: "0",
        method: "POST",
      });
      assert.equal(blockedUpload.status, 404);
      assert.deepEqual(await blockedUpload.json(), {
        error: "feature_disabled",
      });
    } finally {
      state.close();
    }
  });

  it("returns an enabled empty state before a guardian creates art", async () => {
    const state = seedDatabase();
    try {
      const response = await call(state);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), emptyMetadata(true));
    } finally {
      state.close();
    }
  });

  it("returns not found for malformed encoded story identifiers", async () => {
    const state = seedDatabase();
    try {
      const response = await call(state, {
        path: "/api/stories/%E0%A4%A/personalized-art",
      });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "not_found" });
    } finally {
      state.close();
    }
  });

  it("rejects oversized multipart uploads before image generation", async () => {
    const state = seedDatabase();
    let generationCalls = 0;
    try {
      const formData = new FormData();
      formData.set(
        "source",
        new File([new Uint8Array(2 * 1024 * 1024)], "too-large.png", {
          type: "image/png",
        }),
      );
      formData.set("guardianConsentAccepted", "yes");
      formData.set("guardianConsentVersion", CONSENT_VERSION);

      const response = await call(
        state,
        { body: formData, method: "POST" },
        {
          async generateImage() {
            generationCalls += 1;
            throw new Error("must not generate");
          },
        },
      );

      assert.equal(response.status, 413);
      assert.deepEqual(await response.json(), { error: "payload_too_large" });
      assert.equal(generationCalls, 0);
    } finally {
      state.close();
    }
  });

  it("requires the current explicit guardian consent version before generation", async () => {
    const state = seedDatabase();
    let generationCalls = 0;
    try {
      const response = await call(
        state,
        { body: uploadForm({ consent: false }), method: "POST" },
        {
          async generateImage() {
            generationCalls += 1;
            throw new Error("must not generate");
          },
        },
      );

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: "guardian_consent_required",
      });
      assert.equal(generationCalls, 0);
    } finally {
      state.close();
    }
  });

  it("stores only owner-scoped generated art and serves it privately", async () => {
    const state = seedDatabase();
    const generatedWebp = await sharp({
      create: {
        width: 1152,
        height: 768,
        channels: 4,
        background: { r: 0, g: 180, b: 120, alpha: 1 },
      },
    }).webp().toBuffer();
    let generationInput = null;
    let putCall = null;
    try {
      const response = await call(
        state,
        {
          body: uploadForm(),
          method: "POST",
          bucket: bucketStub({
            async put(key, value, options) {
              const bytes =
                value instanceof Uint8Array
                  ? value
                  : new Uint8Array(await value.arrayBuffer());
              putCall = { bytes, key, options };
            },
          }),
        },
        {
          createId: () => "art-1",
          createObjectId: () => "generation-1",
          async generateImage(input) {
            generationInput = input;
            return {
              bytes: new Uint8Array(generatedWebp),
              contentType: "image/webp",
              extension: "webp",
            };
          },
          now: () => new Date("2026-08-09T10:00:00.000Z"),
        },
      );

      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), storedMetadata());
      assert.equal(generationInput.sourceImage.type, "image/png");
      assert.equal(generationInput.storyId, STORY_ID);
      assert.ok(putCall);
      assert.equal(
        putCall.key,
        "personalized-story-art/user-1/the-red-ball/versions/generation-1.webp",
      );
      assert.equal(Buffer.from(putCall.bytes).toString("ascii", 0, 4), "RIFF");
      assert.equal(putCall.options.httpMetadata?.contentType, "image/webp");
      assert.equal(
        putCall.options.customMetadata?.guardianConsentVersion,
        CONSENT_VERSION,
      );

      const storedRow = state.sqlite
        .prepare("SELECT * FROM personalized_story_art WHERE id = ?")
        .get("art-1");
      assert.equal(storedRow.auth_user_id, "user-1");
      assert.equal(storedRow.status, "ready");
      assert.equal(storedRow.provider, "cloudflare-workers-ai");

      const assetResponse = await call(state, {
        bucket: bucketStub({
          async get() {
            return new Response(generatedWebp, {
              headers: { "Content-Type": "image/webp" },
            });
          },
        }),
        path: ASSET_ROUTE,
      });
      assert.equal(assetResponse.status, 200);
      assert.equal(assetResponse.headers.get("Content-Type"), "image/webp");
      assert.equal(
        assetResponse.headers.get("Cache-Control"),
        "private, no-store",
      );
      assert.equal(
        assetResponse.headers.get("X-Content-Type-Options"),
        "nosniff",
      );

      const foreignMetadata = await call(state, { userId: "user-2" });
      assert.equal(foreignMetadata.status, 200);
      assert.deepEqual(await foreignMetadata.json(), emptyMetadata(true));
      const foreignAsset = await call(state, {
        path: ASSET_ROUTE,
        userId: "user-2",
      });
      assert.equal(foreignAsset.status, 404);
    } finally {
      state.close();
    }
  });

  it("keeps only the winning version when two first-generation uploads overlap", async () => {
    const state = seedDatabase();
    const generatedPng = await sharp({
      create: {
        width: 1152,
        height: 768,
        channels: 4,
        background: { r: 0, g: 180, b: 120, alpha: 1 },
      },
    }).png().toBuffer();
    const objectKeys = new Set();
    let firstGenerationCalls = 0;
    let secondGenerationCalls = 0;
    let releaseFirstGeneration;
    let signalFirstGenerationStarted;
    const firstGenerationStarted = new Promise((resolve) => {
      signalFirstGenerationStarted = resolve;
    });
    const firstGenerationBarrier = new Promise((resolve) => {
      releaseFirstGeneration = resolve;
    });
    const bucket = bucketStub({
      async delete(key) {
        objectKeys.delete(key);
      },
      async put(key) {
        objectKeys.add(key);
      },
    });
    const generatedImage = {
      bytes: new Uint8Array(generatedPng),
      contentType: "image/png",
      extension: "png",
    };

    try {
      const firstResponsePromise = call(
        state,
        { body: uploadForm(), bucket, method: "POST" },
        {
          createId: () => "art-1",
          createObjectId: () => "generation-1",
          async generateImage() {
            firstGenerationCalls += 1;
            signalFirstGenerationStarted();
            await firstGenerationBarrier;
            return generatedImage;
          },
        },
      );
      await firstGenerationStarted;

      const secondResponse = await call(
        state,
        { body: uploadForm(), bucket, method: "POST" },
        {
          createId: () => "art-2",
          createObjectId: () => "generation-2",
          async generateImage() {
            secondGenerationCalls += 1;
            return generatedImage;
          },
        },
      );
      releaseFirstGeneration();
      const firstResponse = await firstResponsePromise;

      assert.deepEqual(
        [firstResponse.status, secondResponse.status].sort(),
        [201, 409],
      );
      assert.deepEqual(await secondResponse.json(), {
        error: "generation_in_progress",
      });
      assert.equal(firstGenerationCalls + secondGenerationCalls, 1);
      const storedRow = state.sqlite
        .prepare(
          "SELECT r2_object_key FROM personalized_story_art WHERE auth_user_id = ? AND story_id = ?",
        )
        .get("user-1", STORY_ID);
      assert.deepEqual([...objectKeys].sort(), [storedRow.r2_object_key]);
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM personalized_story_art")
          .get().count,
        1,
      );
    } finally {
      state.close();
    }
  });

  it("rejects an overlapping regeneration before the second provider call", async () => {
    const state = seedDatabase();
    const generatedPng = await sharp({
      create: {
        width: 1152,
        height: 768,
        channels: 4,
        background: { r: 40, g: 120, b: 220, alpha: 1 },
      },
    }).png().toBuffer();
    const oldKey =
      "personalized-story-art/user-1/the-red-ball/versions/original.png";
    const objectKeys = new Set([oldKey]);
    let firstGenerationCalls = 0;
    let secondGenerationCalls = 0;
    let releaseFirstGeneration;
    let signalFirstGenerationStarted;
    const firstGenerationStarted = new Promise((resolve) => {
      signalFirstGenerationStarted = resolve;
    });
    const firstGenerationBarrier = new Promise((resolve) => {
      releaseFirstGeneration = resolve;
    });
    const bucket = bucketStub({
      async delete(key) {
        objectKeys.delete(key);
      },
      async put(key) {
        objectKeys.add(key);
      },
    });
    const generatedImage = {
      bytes: new Uint8Array(generatedPng),
      contentType: "image/png",
      extension: "png",
    };
    insertReadyArt(state, { objectKey: oldKey });

    try {
      const firstResponsePromise = call(
        state,
        { body: uploadForm(), bucket, method: "POST" },
        {
          createObjectId: () => "generation-1",
          async generateImage() {
            firstGenerationCalls += 1;
            signalFirstGenerationStarted();
            await firstGenerationBarrier;
            return generatedImage;
          },
        },
      );
      await firstGenerationStarted;

      const secondResponse = await call(
        state,
        { body: uploadForm(), bucket, method: "POST" },
        {
          createObjectId: () => "generation-2",
          async generateImage() {
            secondGenerationCalls += 1;
            return generatedImage;
          },
        },
      );
      releaseFirstGeneration();
      const firstResponse = await firstResponsePromise;

      assert.deepEqual(
        [firstResponse.status, secondResponse.status].sort(),
        [201, 409],
      );
      assert.deepEqual(await secondResponse.json(), {
        error: "generation_in_progress",
      });
      assert.equal(firstGenerationCalls + secondGenerationCalls, 1);
      const storedRow = state.sqlite
        .prepare(
          "SELECT r2_object_key FROM personalized_story_art WHERE auth_user_id = ? AND story_id = ?",
        )
        .get("user-1", STORY_ID);
      assert.deepEqual([...objectKeys], [storedRow.r2_object_key]);
      assert.equal(
        state.sqlite
          .prepare(
            "SELECT count(*) AS count FROM personalized_story_art_generation_lease",
          )
          .get().count,
        0,
      );
    } finally {
      state.close();
    }
  });

  it("tombstones reads, purges R2, and only then deletes the database row", async () => {
    const state = seedDatabase();
    const objectKey = `personalized-story-art/user-1/${STORY_ID}/current`;
    try {
      state.sqlite
        .prepare(
          `INSERT INTO personalized_story_art (
            id, auth_user_id, story_id, status, r2_object_key, content_type,
            guardian_consent_version, guardian_consent_at, provider,
            prompt_version, created_at, updated_at
          ) VALUES (?, ?, ?, 'ready', ?, 'image/webp', ?, ?,
            'cloudflare-workers-ai', 'red-ball-v1', ?, ?)`,
        )
        .run(
          "art-1",
          "user-1",
          STORY_ID,
          objectKey,
          CONSENT_VERSION,
          1_000,
          1_000,
          1_000,
        );
      const events = [];

      const response = await call(
        state,
        {
          dataApproved: "0",
          enabled: "0",
          method: "DELETE",
          bucket: bucketStub({
            async delete(key) {
              const row = state.sqlite
                .prepare("SELECT status FROM personalized_story_art WHERE id = ?")
                .get("art-1");
              events.push(["delete", key, row.status]);
            },
          }),
        },
        {
          onAfterDeleteRow() {
            events.push(["row-deleted"]);
          },
        },
      );

      assert.equal(response.status, 204);
      assert.deepEqual(events, [
        ["delete", objectKey, "deleting"],
        ["row-deleted"],
      ]);
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM personalized_story_art")
          .get().count,
        0,
      );
      const metadata = await call(state);
      assert.deepEqual(await metadata.json(), emptyMetadata(true));
    } finally {
      state.close();
    }
  });

  it("keeps a failed purge tombstoned so asset reads remain blocked and deletion can retry", async () => {
    const state = seedDatabase();
    const objectKey = `personalized-story-art/user-1/${STORY_ID}/current`;
    try {
      state.sqlite
        .prepare(
          `INSERT INTO personalized_story_art (
            id, auth_user_id, story_id, status, r2_object_key, content_type,
            guardian_consent_version, guardian_consent_at, provider,
            prompt_version, created_at, updated_at
          ) VALUES (?, ?, ?, 'ready', ?, 'image/webp', ?, ?,
            'cloudflare-workers-ai', 'red-ball-v1', ?, ?)`,
        )
        .run(
          "art-1",
          "user-1",
          STORY_ID,
          objectKey,
          CONSENT_VERSION,
          1_000,
          1_000,
          1_000,
        );

      const failed = await call(state, {
        method: "DELETE",
        bucket: bucketStub({
          async delete() {
            throw new Error("temporary R2 failure");
          },
        }),
      });
      assert.equal(failed.status, 502);
      assert.equal(
        state.sqlite
          .prepare("SELECT status FROM personalized_story_art WHERE id = ?")
          .get("art-1").status,
        "deleting",
      );

      const metadataWhileDeleting = await call(state);
      const deletingMetadata = await metadataWhileDeleting.json();
      assert.equal(deletingMetadata.enabled, true);
      assert.equal(deletingMetadata.guardianConsentVersion, CONSENT_VERSION);
      assert.equal(deletingMetadata.hasStoredArt, true);
      assert.deepEqual(deletingMetadata.stories, {});
      assert.ok(Date.parse(deletingMetadata.updatedAt));

      const blockedRead = await call(state, { path: ASSET_ROUTE });
      assert.equal(blockedRead.status, 404);

      const retry = await call(state, {
        method: "DELETE",
        bucket: bucketStub(),
      });
      assert.equal(retry.status, 204);
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM personalized_story_art")
          .get().count,
        0,
      );
    } finally {
      state.close();
    }
  });

  it("does not let DELETE race an active generation lease", async () => {
    const state = seedDatabase();
    const objectKey =
      "personalized-story-art/user-1/the-red-ball/versions/current.webp";
    let deleteCalls = 0;
    try {
      insertReadyArt(state, { contentType: "image/webp", objectKey });
      insertGenerationLease(state, {
        expiresAt: 9_999_999_999_999,
        previousKey: objectKey,
      });

      const response = await call(state, {
        method: "DELETE",
        bucket: bucketStub({
          async delete() {
            deleteCalls += 1;
          },
        }),
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        error: "generation_in_progress",
      });
      assert.equal(deleteCalls, 0);
      const storedRow = state.sqlite
        .prepare(
          "SELECT status, r2_object_key FROM personalized_story_art WHERE id = ?",
        )
        .get("art-1");
      assert.equal(storedRow.status, "ready");
      assert.equal(storedRow.r2_object_key, objectKey);
    } finally {
      state.close();
    }
  });

  it("reports stored-art ownership even when the feature flags are disabled", async () => {
    const state = seedDatabase();
    try {
      state.sqlite
        .prepare(
          `INSERT INTO personalized_story_art (
            id, auth_user_id, story_id, status, r2_object_key, content_type,
            guardian_consent_version, guardian_consent_at, provider,
            prompt_version, created_at, updated_at
          ) VALUES (?, ?, ?, 'ready', ?, 'image/webp', ?, ?,
            'cloudflare-workers-ai', 'red-ball-v1', ?, ?)`,
        )
        .run(
          "art-1",
          "user-1",
          STORY_ID,
          `personalized-story-art/user-1/${STORY_ID}/current`,
          CONSENT_VERSION,
          1_000,
          1_000,
          1_000,
        );

      const response = await call(state, { enabled: "0", dataApproved: "0" });

      assert.equal(response.status, 200);
      assert.deepEqual(
        await response.json(),
        storedMetadata({ enabled: false, includeStory: false, updatedAt: "1970-01-01T00:00:01.000Z" }),
      );
    } finally {
      state.close();
    }
  });

  it("blocks generation and asset reads after account deletion is tombstoned", async () => {
    const state = seedDatabase();
    const { markAccountDeletionPending } = await import(
      "../worker/account-deletion.ts"
    );
    try {
      state.sqlite
        .prepare(
          `INSERT INTO personalized_story_art (
            id, auth_user_id, story_id, status, r2_object_key, content_type,
            guardian_consent_version, guardian_consent_at, provider,
            prompt_version, created_at, updated_at
          ) VALUES (?, ?, ?, 'ready', ?, 'image/webp', ?, ?,
            'cloudflare-workers-ai', 'red-ball-v1', ?, ?)`,
        )
        .run(
          "art-1",
          "user-1",
          STORY_ID,
          `personalized-story-art/user-1/${STORY_ID}/versions/one.webp`,
          CONSENT_VERSION,
          1_000,
          1_000,
          1_000,
        );
      insertGenerationLease(state, {
        candidateKey: `personalized-story-art/user-1/${STORY_ID}/versions/in-flight.webp`,
        expiresAt: 9_999_999_999_999,
        previousKey: `personalized-story-art/user-1/${STORY_ID}/versions/one.webp`,
      });
      await markAccountDeletionPending(state.database, "user-1");

      const metadata = await call(state);
      assert.equal(metadata.status, 200);
      assert.deepEqual(
        await metadata.json(),
        storedMetadata({
          enabled: false,
          includeStory: false,
          updatedAt: "1970-01-01T00:00:01.000Z",
        }),
      );

      const upload = await call(state, {
        body: uploadForm(),
        method: "POST",
      });
      assert.equal(upload.status, 409);
      assert.deepEqual(await upload.json(), {
        error: "account_deletion_pending",
        message: "Account deletion is in progress.",
      });

      const asset = await call(state, { path: ASSET_ROUTE });
      assert.equal(asset.status, 404);
    } finally {
      state.close();
    }
  });

  it("atomically refuses finalization when account deletion begins at the CAS boundary", async () => {
    const state = seedDatabase();
    const { markAccountDeletionPending } = await import(
      "../worker/account-deletion.ts"
    );
    const generatedPng = await sharp({
      create: {
        width: 1152,
        height: 768,
        channels: 4,
        background: { r: 0, g: 180, b: 120, alpha: 1 },
      },
    }).png().toBuffer();
    const candidateKey =
      "personalized-story-art/user-1/the-red-ball/versions/generation-1.png";
    const objectKeys = new Set();
    let finalizeChanges = null;
    try {
      const response = await call(
        state,
        {
          body: uploadForm(),
          d1: observeD1RunWhen(
            state.d1,
            (sql) =>
              /\bINSERT\s+INTO\s+[`"]?personalized_story_art[`"]?\s*\(/i.test(
                sql,
              ),
            {
              async beforeRun() {
                await markAccountDeletionPending(state.database, "user-1");
              },
              afterRun(result) {
                finalizeChanges = result.meta.changes;
              },
            },
          ),
          method: "POST",
          bucket: bucketStub({
            async delete(key) {
              objectKeys.delete(key);
            },
            async put(key) {
              objectKeys.add(key);
            },
          }),
        },
        {
          createId: () => "art-1",
          createObjectId: () => "generation-1",
          async generateImage() {
            return {
              bytes: new Uint8Array(generatedPng),
              contentType: "image/png",
              extension: "png",
            };
          },
        },
      );

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        error: "account_deletion_pending",
        message: "Account deletion is in progress.",
      });
      assert.equal(finalizeChanges, 0);
      assert.deepEqual([...objectKeys], []);
      assert.equal(objectKeys.has(candidateKey), false);
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM personalized_story_art")
          .get().count,
        0,
      );
      assert.equal(
        state.sqlite
          .prepare(
            "SELECT count(*) AS count FROM personalized_story_art_generation_lease",
          )
          .get().count,
        0,
      );
    } finally {
      state.close();
    }
  });

  it("recovers an expired pre-finalize lease by deleting its candidate", async () => {
    const state = seedDatabase();
    const generatedPng = await sharp({
      create: {
        width: 1152,
        height: 768,
        channels: 4,
        background: { r: 0, g: 180, b: 120, alpha: 1 },
      },
    }).png().toBuffer();
    const oldKey =
      "personalized-story-art/user-1/the-red-ball/versions/original.png";
    const abandonedCandidateKey =
      "personalized-story-art/user-1/the-red-ball/versions/abandoned.png";
    const nextKey =
      "personalized-story-art/user-1/the-red-ball/versions/generation-2.png";
    const objectKeys = new Set([oldKey, abandonedCandidateKey]);
    const deleteKeys = [];
    try {
      insertReadyArt(state, { objectKey: oldKey });
      insertGenerationLease(state, {
        candidateKey: abandonedCandidateKey,
        expiresAt: 1_000,
        previousKey: oldKey,
      });

      const response = await call(
        state,
        {
          body: uploadForm(),
          method: "POST",
          bucket: bucketStub({
            async delete(key) {
              deleteKeys.push(key);
              objectKeys.delete(key);
            },
            async put(key) {
              objectKeys.add(key);
            },
          }),
        },
        {
          createObjectId: () => "generation-2",
          async generateImage() {
            return {
              bytes: new Uint8Array(generatedPng),
              contentType: "image/png",
              extension: "png",
            };
          },
          now: () => new Date(10_000),
        },
      );

      assert.equal(response.status, 201);
      assert.deepEqual(deleteKeys, [abandonedCandidateKey, oldKey]);
      assert.deepEqual([...objectKeys], [nextKey]);
      assert.equal(
        state.sqlite
          .prepare(
            "SELECT r2_object_key FROM personalized_story_art WHERE id = ?",
          )
          .get("art-1").r2_object_key,
        nextKey,
      );
      assert.equal(
        state.sqlite
          .prepare(
            "SELECT count(*) AS count FROM personalized_story_art_generation_lease",
          )
          .get().count,
        0,
      );
    } finally {
      state.close();
    }
  });

  it("recovers an expired post-finalize lease by deleting its tracked old key", async () => {
    const state = seedDatabase();
    const generatedPng = await sharp({
      create: {
        width: 1152,
        height: 768,
        channels: 4,
        background: { r: 0, g: 180, b: 120, alpha: 1 },
      },
    }).png().toBuffer();
    const oldKey =
      "personalized-story-art/user-1/the-red-ball/versions/original.png";
    const finalizedCandidateKey =
      "personalized-story-art/user-1/the-red-ball/versions/finalized.png";
    const nextKey =
      "personalized-story-art/user-1/the-red-ball/versions/generation-2.png";
    const objectKeys = new Set([oldKey, finalizedCandidateKey]);
    const deleteKeys = [];
    try {
      insertReadyArt(state, { objectKey: finalizedCandidateKey });
      insertGenerationLease(state, {
        candidateKey: finalizedCandidateKey,
        expiresAt: 1_000,
        previousKey: oldKey,
      });

      const response = await call(
        state,
        {
          body: uploadForm(),
          method: "POST",
          bucket: bucketStub({
            async delete(key) {
              deleteKeys.push(key);
              objectKeys.delete(key);
            },
            async put(key) {
              objectKeys.add(key);
            },
          }),
        },
        {
          createObjectId: () => "generation-2",
          async generateImage() {
            return {
              bytes: new Uint8Array(generatedPng),
              contentType: "image/png",
              extension: "png",
            };
          },
          now: () => new Date(10_000),
        },
      );

      assert.equal(response.status, 201);
      assert.deepEqual(deleteKeys, [oldKey, finalizedCandidateKey]);
      assert.deepEqual([...objectKeys], [nextKey]);
      assert.equal(
        state.sqlite
          .prepare(
            "SELECT r2_object_key FROM personalized_story_art WHERE id = ?",
          )
          .get("art-1").r2_object_key,
        nextKey,
      );
      assert.equal(
        state.sqlite
          .prepare(
            "SELECT count(*) AS count FROM personalized_story_art_generation_lease",
          )
          .get().count,
        0,
      );
    } finally {
      state.close();
    }
  });

  it("CAS-finalizes each regeneration before deleting its tracked old object", async () => {
    const state = seedDatabase();
    const generatedPng = await sharp({
      create: {
        width: 1152,
        height: 768,
        channels: 4,
        background: { r: 0, g: 180, b: 120, alpha: 1 },
      },
    }).png().toBuffer();
    const putKeys = [];
    const deleteEvents = [];
    try {
      const firstResponse = await call(
        state,
        {
          body: uploadForm(),
          method: "POST",
          bucket: bucketStub({
            async put(key) {
              putKeys.push(key);
            },
          }),
        },
        {
          createObjectId: () => "generation-1",
          async generateImage() {
            return {
              bytes: new Uint8Array(generatedPng),
              contentType: "image/png",
              extension: "png",
            };
          },
          now: () => new Date("2026-08-09T10:00:00.000Z"),
        },
      );
      assert.equal(firstResponse.status, 201);

      const secondResponse = await call(
        state,
        {
          body: uploadForm(),
          method: "POST",
          bucket: bucketStub({
            async put(key) {
              putKeys.push(key);
            },
            async delete(key) {
              const row = state.sqlite
                .prepare(
                  "SELECT r2_object_key FROM personalized_story_art WHERE auth_user_id = ? AND story_id = ?",
                )
                .get("user-1", STORY_ID);
              deleteEvents.push([key, row.r2_object_key]);
            },
          }),
        },
        {
          createObjectId: () => "generation-2",
          async generateImage() {
            return {
              bytes: new Uint8Array(generatedPng),
              contentType: "image/png",
              extension: "png",
            };
          },
          now: () => new Date("2026-08-09T11:00:00.000Z"),
        },
      );
      assert.equal(secondResponse.status, 201);
      assert.deepEqual(putKeys, [
        "personalized-story-art/user-1/the-red-ball/versions/generation-1.png",
        "personalized-story-art/user-1/the-red-ball/versions/generation-2.png",
      ]);
      assert.deepEqual(deleteEvents, [
        [
          "personalized-story-art/user-1/the-red-ball/versions/generation-1.png",
          "personalized-story-art/user-1/the-red-ball/versions/generation-2.png",
        ],
      ]);
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM personalized_story_art")
          .get().count,
        1,
      );
      assert.equal(
        state.sqlite
          .prepare(
            "SELECT r2_object_key FROM personalized_story_art WHERE auth_user_id = ? AND story_id = ?",
          )
          .get("user-1", STORY_ID).r2_object_key,
        "personalized-story-art/user-1/the-red-ball/versions/generation-2.png",
      );
    } finally {
      state.close();
    }
  });

  it("keeps the old ready art when CAS finalization fails", async () => {
    const state = seedDatabase();
    const generatedPng = await sharp({
      create: {
        width: 1152,
        height: 768,
        channels: 4,
        background: { r: 0, g: 180, b: 120, alpha: 1 },
      },
    }).png().toBuffer();
    const oldKey =
      "personalized-story-art/user-1/the-red-ball/versions/generation-1.png";
    const candidateKey =
      "personalized-story-art/user-1/the-red-ball/versions/generation-2.png";
    const objectKeys = new Set([oldKey]);
    const deleteKeys = [];
    try {
      insertReadyArt(state, { objectKey: oldKey });

      const response = await call(
        state,
        {
          body: uploadForm(),
          d1: failD1RunWhen(
            state.d1,
            (sql) =>
              /\bUPDATE\s+[`"]?personalized_story_art[`"]?\s+SET/i.test(
                sql,
              ),
          ),
          method: "POST",
          bucket: bucketStub({
            async delete(key) {
              deleteKeys.push(key);
              objectKeys.delete(key);
            },
            async put(key) {
              objectKeys.add(key);
            },
          }),
        },
        {
          createObjectId: () => "generation-2",
          async generateImage() {
            return {
              bytes: new Uint8Array(generatedPng),
              contentType: "image/png",
              extension: "png",
            };
          },
        },
      );

      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), {
        error: "internal_error",
        message: "The personalized story art request failed.",
      });
      assert.deepEqual(deleteKeys, [candidateKey]);
      assert.deepEqual([...objectKeys], [oldKey]);
      const storedRow = state.sqlite
        .prepare(
          "SELECT status, r2_object_key FROM personalized_story_art WHERE id = ?",
        )
        .get("art-1");
      assert.equal(storedRow.status, "ready");
      assert.equal(storedRow.r2_object_key, oldKey);
      assert.equal(
        state.sqlite
          .prepare(
            "SELECT count(*) AS count FROM personalized_story_art_generation_lease",
          )
          .get().count,
        0,
      );
    } finally {
      state.close();
    }
  });

  it("keeps a candidate tracked when cleanup after CAS failure cannot delete it", async () => {
    const state = seedDatabase();
    const generatedPng = await sharp({
      create: {
        width: 1152,
        height: 768,
        channels: 4,
        background: { r: 0, g: 180, b: 120, alpha: 1 },
      },
    }).png().toBuffer();
    const oldKey =
      "personalized-story-art/user-1/the-red-ball/versions/generation-1.png";
    const candidateKey =
      "personalized-story-art/user-1/the-red-ball/versions/generation-2.png";
    const objectKeys = new Set([oldKey]);
    const deleteKeys = [];
    try {
      insertReadyArt(state, { objectKey: oldKey });

      const response = await call(
        state,
        {
          body: uploadForm(),
          d1: failD1RunWhen(
            state.d1,
            (sql) =>
              /\bUPDATE\s+[`"]?personalized_story_art[`"]?\s+SET/i.test(
                sql,
              ),
          ),
          method: "POST",
          bucket: bucketStub({
            async delete(key) {
              deleteKeys.push(key);
              if (key === candidateKey) {
                throw new Error("temporary R2 failure");
              }
              objectKeys.delete(key);
            },
            async put(key) {
              objectKeys.add(key);
            },
          }),
        },
        {
          createObjectId: () => "generation-2",
          async generateImage() {
            return {
              bytes: new Uint8Array(generatedPng),
              contentType: "image/png",
              extension: "png",
            };
          },
          now: () => new Date(10_000),
        },
      );

      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), {
        error: "storage_delete_failed",
      });
      assert.deepEqual(deleteKeys, [candidateKey]);
      assert.deepEqual([...objectKeys].sort(), [candidateKey, oldKey].sort());
      const storedRow = state.sqlite
        .prepare(
          "SELECT status, r2_object_key FROM personalized_story_art WHERE id = ?",
        )
        .get("art-1");
      assert.equal(storedRow.status, "ready");
      assert.equal(storedRow.r2_object_key, oldKey);
      const lease = state.sqlite
        .prepare(
          `SELECT generation_token, candidate_r2_object_key,
            previous_r2_object_key, lease_expires_at
          FROM personalized_story_art_generation_lease
          WHERE auth_user_id = ? AND story_id = ?`,
        )
        .get("user-1", STORY_ID);
      assert.ok(lease.generation_token);
      assert.equal(lease.candidate_r2_object_key, candidateKey);
      assert.equal(lease.previous_r2_object_key, oldKey);
      assert.equal(lease.lease_expires_at, 310_000);
    } finally {
      state.close();
    }
  });

  it("keeps a tracked lease when old-object purge fails after CAS finalization", async () => {
    const state = seedDatabase();
    const generatedPng = await sharp({
      create: {
        width: 1152,
        height: 768,
        channels: 4,
        background: { r: 0, g: 180, b: 120, alpha: 1 },
      },
    }).png().toBuffer();
    const oldKey =
      "personalized-story-art/user-1/the-red-ball/versions/generation-1.png";
    const candidateKey =
      "personalized-story-art/user-1/the-red-ball/versions/generation-2.png";
    const deleteKeys = [];
    try {
      insertReadyArt(state, { objectKey: oldKey });

      const response = await call(
        state,
        {
          body: uploadForm(),
          method: "POST",
          bucket: bucketStub({
            async delete(key) {
              deleteKeys.push(key);
              if (key === oldKey) throw new Error("temporary R2 failure");
            },
          }),
        },
        {
          createObjectId: () => "generation-2",
          async generateImage() {
            return {
              bytes: new Uint8Array(generatedPng),
              contentType: "image/png",
              extension: "png",
            };
          },
          now: () => new Date(10_000),
        },
      );

      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), {
        error: "storage_delete_failed",
      });
      assert.deepEqual(deleteKeys, [oldKey]);
      assert.equal(
        state.sqlite
          .prepare(
            "SELECT r2_object_key FROM personalized_story_art WHERE id = ?",
          )
          .get("art-1").r2_object_key,
        candidateKey,
      );
      const lease = state.sqlite
        .prepare(
          `SELECT generation_token, candidate_r2_object_key,
            previous_r2_object_key, lease_expires_at
          FROM personalized_story_art_generation_lease
          WHERE auth_user_id = ? AND story_id = ?`,
        )
        .get("user-1", STORY_ID);
      assert.ok(lease.generation_token);
      assert.equal(lease.candidate_r2_object_key, candidateKey);
      assert.equal(lease.previous_r2_object_key, oldKey);
      assert.equal(lease.lease_expires_at, 310_000);
    } finally {
      state.close();
    }
  });
});
