import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { createDatabase } from "../worker/database.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const STORY_ID = "the-red-ball";
const PAGE_ID = "my-red-ball";
const CONSENT_VERSION = "2026-08-10";
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
        DB: state.d1,
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

function emptyMetadata(enabled, hasStoredArt = false) {
  return {
    enabled,
    guardianConsentVersion: CONSENT_VERSION,
    hasStoredArt,
    stories: {},
    updatedAt: null,
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
          async generateImage(input) {
            generationInput = input;
            return {
              bytes: new Uint8Array(generatedWebp),
              contentType: "image/webp",
              extension: "webp",
            };
          },
          now: () => new Date("2026-08-10T10:00:00.000Z"),
        },
      );

      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), {
        enabled: true,
        guardianConsentVersion: CONSENT_VERSION,
        hasStoredArt: true,
        stories: {
          [STORY_ID]: {
            pages: {
              [PAGE_ID]: { alt: ART_ALT, src: ASSET_ROUTE },
            },
          },
        },
        updatedAt: "2026-08-10T10:00:00.000Z",
      });
      assert.equal(generationInput.sourceImage.type, "image/png");
      assert.equal(generationInput.storyId, STORY_ID);
      assert.ok(putCall);
      assert.match(
        putCall.key,
        /^personalized-story-art\/user-1\/the-red-ball\/art-1\.webp$/,
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

  it("tombstones reads, purges R2, and only then deletes the database row", async () => {
    const state = seedDatabase();
    const objectKey =
      `personalized-story-art/user-1/${STORY_ID}/art-1.webp`;
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
    const objectKey =
      `personalized-story-art/user-1/${STORY_ID}/art-1.webp`;
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
});
