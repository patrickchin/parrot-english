import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import sharp from "sharp";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

const clientModule = await vite
  .ssrLoadModule("/src/stories/personalized-story-art-client.ts")
  .catch(() => ({}));

after(async () => {
  await vite.close();
});

function requireClientApi() {
  assert.equal(
    typeof clientModule.parsePersonalizedStoryArtMetadata,
    "function",
    "Expected parsePersonalizedStoryArtMetadata() in src/stories/personalized-story-art-client.ts",
  );
  assert.equal(
    typeof clientModule.normalizePersonalizedStoryArtUpload,
    "function",
    "Expected normalizePersonalizedStoryArtUpload() in src/stories/personalized-story-art-client.ts",
  );
  assert.equal(
    typeof clientModule.generatePersonalizedStoryArt,
    "function",
    "Expected generatePersonalizedStoryArt() in src/stories/personalized-story-art-client.ts",
  );
  assert.equal(
    typeof clientModule.loadPersonalizedStoryArt,
    "function",
    "Expected loadPersonalizedStoryArt() in src/stories/personalized-story-art-client.ts",
  );
  assert.equal(
    typeof clientModule.removePersonalizedStoryArt,
    "function",
    "Expected removePersonalizedStoryArt() in src/stories/personalized-story-art-client.ts",
  );
  return clientModule;
}

function jsonFetch(payload = {}, status = 200) {
  const calls = [];
  return {
    calls,
    fetch: async (...args) => {
      calls.push(args);
      return Response.json(payload, { status });
    },
  };
}

describe("personalized story art client API", () => {
  it("parses private override metadata into per-story, per-page artwork lookups", () => {
    const { parsePersonalizedStoryArtMetadata } = requireClientApi();

    const parsed = parsePersonalizedStoryArtMetadata({
      enabled: true,
      guardianConsentVersion: "2026-08-09",
      hasStoredArt: true,
      stories: {
        "the-red-ball": {
          pages: {
            "my-red-ball": {
              alt: "You holding a bright red ball",
              src: "/api/stories/the-red-ball/personalized-art/asset",
            },
          },
        },
      },
      updatedAt: "2026-08-09T10:30:00.000Z",
    });

    assert.deepEqual(parsed, {
      enabled: true,
      guardianConsentVersion: "2026-08-09",
      hasStoredArt: true,
      stories: {
        "the-red-ball": {
          pages: {
            "my-red-ball": {
              alt: "You holding a bright red ball",
              src: "/api/stories/the-red-ball/personalized-art/asset",
            },
          },
        },
      },
      updatedAt: "2026-08-09T10:30:00.000Z",
    });
  });

  it("normalizes uploaded art to one metadata-free centered PNG below the provider's 512px limit", async () => {
    const { normalizePersonalizedStoryArtUpload } = requireClientApi();

    const sourceBytes = await sharp({
      create: {
        width: 960,
        height: 480,
        channels: 3,
        background: { r: 210, g: 32, b: 44 },
      },
    })
      .jpeg({ quality: 92 })
      .withMetadata()
      .toBuffer();
    const source = new File([sourceBytes], "guardian-photo.jpg", {
      type: "image/jpeg",
    });

    const normalizedPng = await sharp(sourceBytes)
      .resize(480, 480, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
    const drawCalls = [];
    let closed = false;
    const normalized = await normalizePersonalizedStoryArtUpload(source, {
      async decodeImage() {
        return {
          close() {
            closed = true;
          },
          height: 480,
          width: 960,
        };
      },
      createCanvas(width, height) {
        assert.equal(width, 480);
        assert.equal(height, 480);
        return {
          getContext() {
            return {
              drawImage(...args) {
                drawCalls.push(args.slice(1));
              },
            };
          },
          toBlob(callback, type) {
            assert.equal(type, "image/png");
            callback(new Blob([normalizedPng], { type: "image/png" }));
          },
        };
      },
    });
    assert.ok(normalized instanceof Blob);
    assert.equal(normalized.type, "image/png");
    assert.equal(closed, true);
    assert.deepEqual(drawCalls, [[240, 0, 480, 480, 0, 0, 480, 480]]);

    const normalizedBytes = Buffer.from(await normalized.arrayBuffer());
    const metadata = await sharp(normalizedBytes).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.width, 480);
    assert.equal(metadata.height, 480);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.iptc, undefined);
  });

  it("refuses to substitute a blank portrait when browser image decoding is unavailable", async () => {
    const { normalizePersonalizedStoryArtUpload } = requireClientApi();
    const source = new File([new Uint8Array([1, 2, 3])], "portrait.jpg", {
      type: "image/jpeg",
    });

    await assert.rejects(
      normalizePersonalizedStoryArtUpload(source, {
        createCanvas() {
          return null;
        },
        async decodeImage() {
          return null;
        },
      }),
      /prepare|decode|browser/i,
    );
  });

  it("generates private art by uploading a normalized PNG and parsing the returned metadata", async () => {
    const {
      generatePersonalizedStoryArt,
      parsePersonalizedStoryArtMetadata,
    } = requireClientApi();
    const request = jsonFetch({
      enabled: true,
      guardianConsentVersion: "2026-08-09",
      hasStoredArt: true,
      stories: {
        "the-red-ball": {
          pages: {
            "my-red-ball": {
              alt: "You holding a bright red ball",
              src: "/api/stories/the-red-ball/personalized-art/asset",
            },
          },
        },
      },
    });
    const sourceBytes = await sharp({
      create: {
        width: 480,
        height: 480,
        channels: 4,
        background: { r: 40, g: 120, b: 180, alpha: 1 },
      },
    }).png().toBuffer();
    const source = new File([sourceBytes], "camera.png", {
      type: "image/png",
    });

    const result = await generatePersonalizedStoryArt(
      {
        guardianConsentVersion: "2026-08-09",
        photo: source,
        storyId: "the-red-ball",
      },
      {
        fetch: request.fetch,
        normalization: {
          createCanvas() {
            return {
              getContext() {
                return { clearRect() {}, drawImage() {} };
              },
              toBlob(callback) {
                callback(new Blob([sourceBytes], { type: "image/png" }));
              },
            };
          },
          async decodeImage() {
            return { height: 480, width: 480 };
          },
        },
      },
    );

    assert.deepEqual(
      result,
      parsePersonalizedStoryArtMetadata({
        enabled: true,
        guardianConsentVersion: "2026-08-09",
        hasStoredArt: true,
        stories: {
          "the-red-ball": {
            pages: {
              "my-red-ball": {
                alt: "You holding a bright red ball",
                src: "/api/stories/the-red-ball/personalized-art/asset",
              },
            },
          },
        },
      }),
    );
    assert.equal(
      request.calls[0][0],
      "/api/stories/the-red-ball/personalized-art",
    );
    assert.equal(request.calls[0][1].method, "POST");
    assert.ok(request.calls[0][1].body instanceof FormData);
    assert.equal(
      request.calls[0][1].body.get("guardianConsentVersion"),
      "2026-08-09",
    );
    assert.equal(
      request.calls[0][1].body.get("guardianConsentAccepted"),
      "yes",
    );
    assert.ok(request.calls[0][1].body.get("source") instanceof File);
    assert.equal(request.calls[0][1].body.get("source").type, "image/png");
  });

  it("does not start an upload after cancellation during image normalization", async () => {
    const { generatePersonalizedStoryArt } = requireClientApi();
    const controller = new AbortController();
    let resolveDecode;
    const decode = new Promise((resolve) => {
      resolveDecode = resolve;
    });
    let uploadCalls = 0;
    const operation = generatePersonalizedStoryArt(
      {
        guardianConsentVersion: "2026-08-09",
        photo: new File([new Uint8Array([1, 2, 3])], "camera.png", {
          type: "image/png",
        }),
        storyId: "the-red-ball",
      },
      {
        fetch: async () => {
          uploadCalls += 1;
          return Response.json({ enabled: true, stories: {} });
        },
        normalization: {
          createCanvas() {
            return {
              convertToBlob: async () => new Blob(["png"], { type: "image/png" }),
              getContext() {
                return { clearRect() {}, drawImage() {} };
              },
              height: 480,
              width: 480,
            };
          },
          decodeImage: async () => decode,
        },
        signal: controller.signal,
      },
    );

    await Promise.resolve();
    controller.abort();
    resolveDecode({ height: 480, width: 480 });

    await assert.rejects(operation, { name: "AbortError" });
    assert.equal(uploadCalls, 0);
  });

  it("loads same-origin metadata without accepting arbitrary image URLs", async () => {
    const { loadPersonalizedStoryArt } = requireClientApi();
    const request = jsonFetch({
      enabled: true,
      guardianConsentVersion: "2026-08-09",
      hasStoredArt: false,
      stories: {
        "the-red-ball": {
          pages: {
            "my-red-ball": {
              alt: "You holding a bright red ball",
              src: "https://tracking.example/learner.png",
            },
          },
        },
      },
      updatedAt: null,
    });

    const result = await loadPersonalizedStoryArt("the-red-ball", {
      fetch: request.fetch,
    });

    assert.equal(
      request.calls[0][0],
      "/api/stories/the-red-ball/personalized-art",
    );
    assert.deepEqual(result.stories, {});
  });

  it("removes one private page override without touching catalog story data", async () => {
    const { removePersonalizedStoryArt } = requireClientApi();
    const request = jsonFetch({ ok: true });

    await removePersonalizedStoryArt(
      { storyId: "the-red-ball" },
      { fetch: request.fetch },
    );

    assert.equal(
      request.calls[0][0],
      "/api/stories/the-red-ball/personalized-art",
    );
    assert.equal(request.calls[0][1].method, "DELETE");
  });

  it("notifies guardian access before exposing its typed guardian-required error", async () => {
    const { PersonalizedStoryArtApiError, removePersonalizedStoryArt } =
      requireClientApi();
    const previousDocument = globalThis.document;
    const eventTarget = new globalThis.EventTarget();
    const order = [];
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: eventTarget,
    });
    eventTarget.addEventListener("guardian-access-required", () => {
      order.push("notification");
    });

    try {
      const failed = jsonFetch({ error: "guardian_required" }, 403);
      await assert.rejects(
        removePersonalizedStoryArt(
          { storyId: "the-red-ball" },
          { fetch: failed.fetch },
        ),
        (error) => {
          order.push("error");
          assert.ok(error instanceof PersonalizedStoryArtApiError);
          assert.equal(error.status, 403);
          assert.equal(error.code, "guardian_required");
          return true;
        },
      );
      assert.deepEqual(order, ["notification", "error"]);
    } finally {
      if (previousDocument === undefined) Reflect.deleteProperty(globalThis, "document");
      else Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: previousDocument,
      });
    }
  });
});
