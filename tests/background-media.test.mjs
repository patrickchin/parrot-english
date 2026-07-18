/* global Buffer */

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  createBackgroundPublishPlan,
  inspectBackgroundPublishFiles,
  verifyBackgroundCatalogMedia,
} from "../scripts/background-media.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

function createManifest(overrides = {}) {
  return {
    assets: [
      {
        alt: "A sunny playground with a swing and slide",
        finalFile:
          "tmp/imagegen/backgrounds/playground-day/landscape.webp",
        id: "playground-day",
        promptFile: "tmp/imagegen/backgrounds/playground-day/prompt.json",
        sourceFile: "tmp/imagegen/backgrounds/playground-day/original.png",
        version: 1,
      },
    ],
    schemaVersion: 1,
    ...overrides,
  };
}

function createOptions(overrides = {}) {
  return {
    mediaOrigin: "https://media.example.com",
    publicBucket: "parrot-english-media",
    sourceBucket: "parrot-english-art-source",
    ...overrides,
  };
}

function createVp8xWebp(width, height) {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(22, 4);
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8X", 12, "ascii");
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

async function createPublishFiles({ height = 1152, width = 2048 } = {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "parrot-background-media-"));
  temporaryDirectories.push(cwd);
  const directory = path.join(
    cwd,
    "tmp/imagegen/backgrounds/playground-day",
  );
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(directory, "landscape.webp"),
      createVp8xWebp(width, height),
    ),
    writeFile(path.join(directory, "original.png"), "source-image"),
    writeFile(
      path.join(directory, "prompt.json"),
      JSON.stringify({ prompt: "Create a sunny playground background." }),
    ),
  ]);
  return cwd;
}

describe("background media publishing", () => {
  it("creates immutable public and private object paths", () => {
    const plan = createBackgroundPublishPlan(createManifest(), createOptions());

    assert.deepEqual(plan.catalogEntries, [
      {
        alt: "A sunny playground with a swing and slide",
        id: "playground-day",
        src: "https://media.example.com/backgrounds/playground-day/v1/landscape.webp",
      },
    ]);
    assert.deepEqual(
      plan.uploads.map(({ bucket, cacheControl, contentType, key }) => ({
        bucket,
        cacheControl,
        contentType,
        key,
      })),
      [
        {
          bucket: "parrot-english-art-source",
          cacheControl: undefined,
          contentType: "image/png",
          key: "backgrounds/playground-day/v1/original.png",
        },
        {
          bucket: "parrot-english-art-source",
          cacheControl: undefined,
          contentType: "application/json",
          key: "backgrounds/playground-day/v1/prompt.json",
        },
        {
          bucket: "parrot-english-media",
          cacheControl: "public, max-age=31536000, immutable",
          contentType: "image/webp",
          key: "backgrounds/playground-day/v1/landscape.webp",
        },
      ],
    );
  });

  it("rejects unsafe origins, duplicate IDs, and paths outside staging", () => {
    assert.throws(
      () =>
        createBackgroundPublishPlan(
          createManifest(),
          createOptions({ mediaOrigin: "http://media.example.com" }),
        ),
      /mediaOrigin must use https/,
    );

    const duplicate = createManifest({
      assets: [
        createManifest().assets[0],
        { ...createManifest().assets[0], version: 2 },
      ],
    });
    assert.throws(
      () => createBackgroundPublishPlan(duplicate, createOptions()),
      /asset IDs must be unique/,
    );

    const traversal = createManifest();
    traversal.assets[0].sourceFile = "../secret.png";
    assert.throws(
      () => createBackgroundPublishPlan(traversal, createOptions()),
      /must be inside tmp\/imagegen\/backgrounds/,
    );
  });

  it("validates staged files and the final WebP dimensions", async () => {
    const cwd = await createPublishFiles();
    const plan = createBackgroundPublishPlan(createManifest(), createOptions());

    const inspected = await inspectBackgroundPublishFiles(plan, { cwd });

    assert.deepEqual(inspected, [
      {
        height: 1152,
        id: "playground-day",
        version: 1,
        width: 2048,
      },
    ]);
  });

  it("rejects a final background with unexpected dimensions", async () => {
    const cwd = await createPublishFiles({ height: 1024, width: 1536 });
    const plan = createBackgroundPublishPlan(createManifest(), createOptions());

    await assert.rejects(
      inspectBackgroundPublishFiles(plan, { cwd }),
      /must be 2048x1152; received 1536x1024/,
    );
  });
});

describe("background media verification", () => {
  it("verifies remote assets and skips repository-local backgrounds", async () => {
    const requests = [];
    const result = await verifyBackgroundCatalogMedia(
      [
        {
          alt: "A local fallback",
          id: "fallback",
          src: "/assets/backgrounds/fallback.webp",
        },
        {
          alt: "A sunny playground",
          id: "playground-day",
          src: "https://media.example.com/backgrounds/playground-day/v1/landscape.webp",
        },
      ],
      {
        fetch: async (url, init) => {
          requests.push({ init, url });
          return new Response(null, {
            headers: {
              "cache-control": "public, max-age=31536000, immutable",
              "content-length": "482193",
              "content-type": "image/webp",
            },
            status: 200,
          });
        },
        mediaOrigin: "https://media.example.com",
      },
    );

    assert.deepEqual(requests, [
      {
        init: { method: "HEAD" },
        url: "https://media.example.com/backgrounds/playground-day/v1/landscape.webp",
      },
    ]);
    assert.deepEqual(result, {
      skipped: ["fallback"],
      verified: [
        {
          bytes: 482193,
          id: "playground-day",
          src: "https://media.example.com/backgrounds/playground-day/v1/landscape.webp",
        },
      ],
    });
  });

  it("reports HTTP, content type, and cache failures together", async () => {
    const backgrounds = [
      {
        alt: "A playground",
        id: "playground-day",
        src: "https://media.example.com/backgrounds/playground-day/v1/landscape.webp",
      },
      {
        alt: "A market",
        id: "fruit-market-day",
        src: "https://media.example.com/backgrounds/fruit-market-day/v1/landscape.webp",
      },
    ];

    await assert.rejects(
      verifyBackgroundCatalogMedia(backgrounds, {
        fetch: async (url) =>
          url.includes("playground")
            ? new Response(null, { status: 404 })
            : new Response(null, {
                headers: {
                  "cache-control": "max-age=60",
                  "content-type": "text/plain",
                },
                status: 200,
              }),
        mediaOrigin: "https://media.example.com",
      }),
      (error) => {
        assert.match(error.message, /playground-day returned HTTP 404/);
        assert.match(error.message, /fruit-market-day must return image\/webp/);
        assert.match(error.message, /fruit-market-day must use immutable caching/);
        return true;
      },
    );
  });
});
