/* global Buffer */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import sharp from "sharp";

const storyMedia = await import("../scripts/story-media.mjs").catch(() => ({}));
const storyPublisher = await import("../scripts/publish-story-media.mjs").catch(
  () => ({}),
);
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

function createManifest() {
  const assets = [];
  for (const [storyId, pageCount] of [
    ["the-gruffalo", 12],
    ["we-re-going-on-a-bear-hunt", 5],
  ]) {
    const directory = `tmp/imagegen/story-media/v5/${storyId}`;
    assets.push({
      kind: "cover",
      promptFile: `${directory}/cover.prompt.json`,
      sourceFile: `${directory}/cover.png`,
      storyId,
    });
    for (let page = 1; page <= pageCount; page += 1) {
      const pageId = `page-${String(page).padStart(3, "0")}`;
      assets.push({
        kind: "page",
        pageId,
        promptFile: `${directory}/${pageId}.prompt.json`,
        sourceFile: `${directory}/${pageId}.png`,
        storyId,
      });
    }
  }
  return { assets, schemaVersion: 1, version: 5 };
}

async function createPublishFiles(manifest = createManifest()) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "parrot-story-media-"));
  temporaryDirectories.push(cwd);
  await Promise.all(
    manifest.assets.flatMap((asset, index) => [
      mkdir(path.dirname(path.join(cwd, asset.sourceFile)), {
        recursive: true,
      }).then(() =>
        sharp({
          create: {
            background: {
              alpha: 1,
              b: (index * 29) % 255,
              g: (index * 17) % 255,
              r: (index * 11) % 255,
            },
            channels: 4,
            height: 1024,
            width: 1536,
          },
        })
          .png()
          .toFile(path.join(cwd, asset.sourceFile)),
      ),
      mkdir(path.dirname(path.join(cwd, asset.promptFile)), {
        recursive: true,
      }).then(() =>
        writeFile(
          path.join(cwd, asset.promptFile),
          JSON.stringify({ prompt: `Paint ${asset.storyId} ${asset.pageId ?? "cover"}.` }),
        ),
      ),
    ]),
  );
  return cwd;
}

async function createPublisherFixture() {
  const manifest = createManifest();
  const cwd = await createPublishFiles(manifest);
  const manifestFile = "tmp/imagegen/story-media/v5/publish.json";
  await writeFile(path.join(cwd, manifestFile), JSON.stringify(manifest));
  return { cwd, manifest, manifestFile };
}

function createEnvironment() {
  return {
    PARROT_MEDIA_ORIGIN: "https://media.example.com",
    PARROT_MEDIA_PUBLIC_BUCKET: "parrot-english-media",
    PARROT_MEDIA_SOURCE_BUCKET: "parrot-english-art-source",
  };
}

describe("story media planning", () => {
  it("plans exactly two covers, seventeen scenes, and their derived WebPs", () => {
    assert.equal(typeof storyMedia.createStoryMediaPublishPlan, "function");

    const plan = storyMedia.createStoryMediaPublishPlan(createManifest());

    assert.equal(plan.assets.length, 19);
    assert.equal(plan.privateObjects.length, 38);
    assert.equal(plan.publicOutputs.length, 23);
    assert.equal(plan.version, 5);
    assert.deepEqual(
      plan.publicOutputs
        .filter(({ assetId }) => assetId === "the-gruffalo/cover")
        .map(({ height, key, width }) => ({ height, key, width })),
      [
        {
          height: 1024,
          key: "assets/v5/stories/the-gruffalo-cover.webp",
          width: 1536,
        },
        {
          height: 512,
          key: "assets/v5/stories/the-gruffalo-cover-768.webp",
          width: 768,
        },
        {
          height: 256,
          key: "assets/v5/stories/the-gruffalo-cover-384.webp",
          width: 384,
        },
      ],
    );
    assert.deepEqual(
      plan.publicOutputs.find(
        ({ assetId }) => assetId === "we-re-going-on-a-bear-hunt/page-005",
      ),
      {
        assetId: "we-re-going-on-a-bear-hunt/page-005",
        contentType: "image/webp",
        height: 512,
        key:
          "assets/v5/story-pages/we-re-going-on-a-bear-hunt-page-005.webp",
        width: 768,
      },
    );
    assert.equal(Object.hasOwn(plan, "mappings"), false);
  });

  it("rejects incomplete inventories and staged paths outside the ignored root", () => {
    const incomplete = createManifest();
    incomplete.assets.pop();
    assert.throws(
      () => storyMedia.createStoryMediaPublishPlan(incomplete),
      /exactly two covers and seventeen original scene images/,
    );

    const escaped = createManifest();
    escaped.assets[0].sourceFile = "../cover.png";
    assert.throws(
      () => storyMedia.createStoryMediaPublishPlan(escaped),
      /must be inside tmp\/imagegen\/story-media\/v5/,
    );
  });

  it("requires one distinct original and prompt file per asset", () => {
    const duplicateSource = createManifest();
    duplicateSource.assets[1].sourceFile =
      duplicateSource.assets[0].sourceFile;
    assert.throws(
      () => storyMedia.createStoryMediaPublishPlan(duplicateSource),
      /source files must be unique/,
    );

    const duplicatePrompt = createManifest();
    duplicatePrompt.assets[1].promptFile =
      duplicatePrompt.assets[0].promptFile;
    assert.throws(
      () => storyMedia.createStoryMediaPublishPlan(duplicatePrompt),
      /prompt files must be unique/,
    );
  });
});

describe("story media preparation", () => {
  it("decodes sources and prepares private files before hashed WebP outputs", async () => {
    assert.equal(typeof storyMedia.prepareStoryMediaUploads, "function");
    const manifest = createManifest();
    const cwd = await createPublishFiles(manifest);
    const plan = storyMedia.createStoryMediaPublishPlan(manifest);

    const prepared = await storyMedia.prepareStoryMediaUploads(plan, { cwd });

    assert.equal(prepared.uploads.length, 61);
    assert.deepEqual(
      prepared.uploads.map(({ scope }) => scope),
      [...Array(38).fill("private"), ...Array(23).fill("public")],
    );
    const original = prepared.uploads[0];
    const originalBytes = await readFile(path.join(cwd, plan.assets[0].sourceFile));
    assert.equal(original.contentType, "image/png");
    assert.equal(original.sha256, createHash("sha256").update(originalBytes).digest("hex"));
    assert.deepEqual(original.bytes, originalBytes);

    const cover = prepared.uploads[38];
    assert.deepEqual(
      {
        cacheControl: cover.cacheControl,
        contentType: cover.contentType,
        height: cover.height,
        key: cover.key,
        scope: cover.scope,
        width: cover.width,
      },
      {
        cacheControl: "public, max-age=31536000, immutable",
        contentType: "image/webp",
        height: 1024,
        key: "assets/v5/stories/the-gruffalo-cover.webp",
        scope: "public",
        width: 1536,
      },
    );
    assert.match(cover.sha256, /^[a-f0-9]{64}$/);
    assert.equal(
      cover.sha256,
      createHash("sha256").update(cover.bytes).digest("hex"),
    );
    const coverMetadata = await sharp(cover.bytes).metadata();
    assert.equal(coverMetadata.format, "webp");
    assert.equal(coverMetadata.width, 1536);
    assert.equal(coverMetadata.height, 1024);
  });

  it("rejects undecodable, non-3:2, undersized, and invalid prompt sources", async () => {
    assert.equal(typeof storyMedia.prepareStoryMediaUploads, "function");
    const manifest = createManifest();
    const cwd = await createPublishFiles(manifest);
    const plan = storyMedia.createStoryMediaPublishPlan(manifest);
    const source = path.join(cwd, manifest.assets[0].sourceFile);
    const prompt = path.join(cwd, manifest.assets[0].promptFile);

    await writeFile(source, "not an image");
    await assert.rejects(
      storyMedia.prepareStoryMediaUploads(plan, { cwd }),
      /could not be decoded by Sharp/,
    );

    await sharp({
      create: {
        background: "#ffffff",
        channels: 3,
        height: 1000,
        width: 1536,
      },
    }).png().toFile(source);
    await assert.rejects(
      storyMedia.prepareStoryMediaUploads(plan, { cwd }),
      /must use a 3:2 aspect ratio/,
    );

    await sharp({
      create: {
        background: "#ffffff",
        channels: 3,
        height: 1000,
        width: 1500,
      },
    }).png().toFile(source);
    await assert.rejects(
      storyMedia.prepareStoryMediaUploads(plan, { cwd }),
      /must be at least 1536x1024/,
    );

    await sharp({
      create: {
        background: "#ffffff",
        channels: 3,
        height: 1024,
        width: 1536,
      },
    }).png().toFile(source);
    await writeFile(prompt, "{}");
    await assert.rejects(
      storyMedia.prepareStoryMediaUploads(plan, { cwd }),
      /prompt must be a non-empty string/,
    );
  });

  it("rejects staged symlinks that resolve outside the ignored version root", async () => {
    const manifest = createManifest();
    const cwd = await createPublishFiles(manifest);
    const plan = storyMedia.createStoryMediaPublishPlan(manifest);
    const stagedSource = path.join(cwd, manifest.assets[0].sourceFile);
    const outsideSource = path.join(cwd, "outside.png");
    await sharp({
      create: {
        background: "#ffffff",
        channels: 3,
        height: 1024,
        width: 1536,
      },
    }).png().toFile(outsideSource);
    await rm(stagedSource);
    await symlink(outsideSource, stagedSource);

    await assert.rejects(
      storyMedia.prepareStoryMediaUploads(plan, { cwd }),
      /must resolve inside tmp\/imagegen\/story-media\/v5/,
    );
  });
});

function createCdnResponse(output, overrides = {}) {
  return new Response(overrides.bytes ?? output.bytes, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "image/webp",
      ...overrides.headers,
    },
    status: overrides.status ?? 200,
  });
}

describe("story media CDN verification", () => {
  it("returns code mappings only after every public output verifies", async () => {
    assert.equal(typeof storyMedia.verifyStoryMediaDelivery, "function");
    const manifest = createManifest();
    const cwd = await createPublishFiles(manifest);
    const prepared = await storyMedia.prepareStoryMediaUploads(
      storyMedia.createStoryMediaPublishPlan(manifest),
      { cwd },
    );
    const requests = [];
    const outputs = new Map(
      prepared.publicOutputs.map((output) => [`/${output.key}`, output]),
    );

    const result = await storyMedia.verifyStoryMediaDelivery(prepared, {
      cacheBust: "fixture",
      fetch: async (url, init) => {
        const parsed = new URL(url);
        requests.push({ init, url: parsed });
        return createCdnResponse(outputs.get(parsed.pathname));
      },
      mediaOrigin: "https://media.example.com",
    });

    assert.equal(result.verified.length, 23);
    assert.equal(requests.length, 23);
    assert.ok(
      requests.every(
        ({ init, url }) =>
          init.cache === "no-store" &&
          init.method === "GET" &&
          init.redirect === "error" &&
          url.searchParams.get("parrot-story-media-check") ===
            "verify-fixture",
      ),
    );
    assert.deepEqual(result.mappings[0], {
      coverSrc:
        "https://media.example.com/assets/v5/stories/the-gruffalo-cover.webp",
      pageSrcById: Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => {
          const pageId = `page-${String(index + 1).padStart(3, "0")}`;
          return [
            pageId,
            `https://media.example.com/assets/v5/story-pages/the-gruffalo-${pageId}.webp`,
          ];
        }),
      ),
      storyId: "the-gruffalo",
    });
    assert.equal(Object.hasOwn(prepared, "mappings"), false);
  });

  it("rejects shared-cache freshness overrides and withholds mappings", async () => {
    assert.equal(typeof storyMedia.verifyStoryMediaDelivery, "function");
    const manifest = createManifest();
    const cwd = await createPublishFiles(manifest);
    const prepared = await storyMedia.prepareStoryMediaUploads(
      storyMedia.createStoryMediaPublishPlan(manifest),
      { cwd },
    );
    const outputs = new Map(
      prepared.publicOutputs.map((output) => [`/${output.key}`, output]),
    );

    await assert.rejects(
      storyMedia.verifyStoryMediaDelivery(prepared, {
        cacheBust: "fixture",
        fetch: async (url) => {
          const output = outputs.get(new URL(url).pathname);
          return createCdnResponse(output, {
            headers: {
              "cache-control":
                output === prepared.publicOutputs[0]
                  ? "public, max-age=31536000, s-maxage=0, immutable"
                  : "public, max-age=31536000, immutable",
            },
          });
        },
        mediaOrigin: "https://media.example.com",
      }),
      /the-gruffalo-cover\.webp must use strict public immutable caching/,
    );
  });

  it("reports HTTP, MIME, dimension, and hash failures together", async () => {
    assert.equal(typeof storyMedia.verifyStoryMediaDelivery, "function");
    const manifest = createManifest();
    const cwd = await createPublishFiles(manifest);
    const prepared = await storyMedia.prepareStoryMediaUploads(
      storyMedia.createStoryMediaPublishPlan(manifest),
      { cwd },
    );
    const outputs = new Map(
      prepared.publicOutputs.map((output) => [`/${output.key}`, output]),
    );
    const wrongDimensions = prepared.publicOutputs.find(
      ({ width }) => width === 768,
    ).bytes;

    await assert.rejects(
      storyMedia.verifyStoryMediaDelivery(prepared, {
        cacheBust: "fixture",
        fetch: async (url) => {
          const output = outputs.get(new URL(url).pathname);
          const index = prepared.publicOutputs.indexOf(output);
          if (index === 0) return new Response(null, { status: 404 });
          if (index === 1) {
            return createCdnResponse(output, {
              headers: { "content-type": "image/png" },
            });
          }
          if (index === 2) {
            return createCdnResponse(output, { bytes: wrongDimensions });
          }
          return createCdnResponse(output);
        },
        mediaOrigin: "https://media.example.com",
      }),
      (error) => {
        assert.match(error.message, /the-gruffalo-cover\.webp returned HTTP 404/);
        assert.match(error.message, /the-gruffalo-cover-768\.webp must return image\/webp/);
        assert.match(error.message, /the-gruffalo-cover-384\.webp must be 384x256/);
        assert.match(error.message, /the-gruffalo-cover-384\.webp SHA-256 mismatch/);
        return true;
      },
    );
  });
});

describe("story media publisher CLI", () => {
  it("defaults to an environment-free dry run without commands or mappings", async () => {
    assert.equal(typeof storyPublisher.runStoryMediaPublisher, "function");
    const { cwd, manifestFile } = await createPublisherFixture();
    let output = "";

    const result = await storyPublisher.runStoryMediaPublisher({
      args: ["--manifest", manifestFile],
      cwd,
      env: {},
      fetch() {
        throw new Error("Dry run must not use the CDN");
      },
      runCommand() {
        throw new Error("Dry run must not invoke Wrangler");
      },
      writeOutput(value) {
        output += value;
      },
    });

    assert.deepEqual(result, {
      applied: false,
      assetCount: 19,
      publicCount: 23,
      uploadCount: 61,
    });
    assert.match(output, /Dry run: 19 source images validated; 61 objects planned/);
    assert.doesNotMatch(output, /media\.example\.com|coverSrc|pageSrcById/);
  });

  it("requires media configuration only when apply is explicit", async () => {
    assert.equal(typeof storyPublisher.runStoryMediaPublisher, "function");
    const { cwd, manifestFile } = await createPublisherFixture();

    await assert.rejects(
      storyPublisher.runStoryMediaPublisher({
        args: ["--manifest", manifestFile, "--apply"],
        cwd,
        env: {},
        runCommand() {
          throw new Error("Configuration must fail before Wrangler");
        },
        writeOutput() {},
      }),
      /PARROT_MEDIA_ORIGIN must be set/,
    );
  });

  it("preflights every R2 key, uploads private data first, and verifies mappings", async () => {
    assert.equal(typeof storyPublisher.runStoryMediaPublisher, "function");
    const { cwd, manifest, manifestFile } = await createPublisherFixture();
    const prepared = await storyMedia.prepareStoryMediaUploads(
      storyMedia.createStoryMediaPublishPlan(manifest),
      { cwd },
    );
    const outputs = new Map(
      prepared.publicOutputs.map((output) => [`/${output.key}`, output]),
    );
    const commands = [];
    let output = "";

    const result = await storyPublisher.runStoryMediaPublisher({
      args: ["--manifest", manifestFile, "--apply"],
      cacheBust: "fixture",
      cwd,
      env: createEnvironment(),
      fetch: async (url) =>
        createCdnResponse(outputs.get(new URL(url).pathname)),
      runCommand(command, args, options) {
        commands.push({ args, command, input: options.input });
        if (args.includes("get")) {
          return { status: 1, stderr: "The specified key does not exist." };
        }
        return { status: 0, stderr: "" };
      },
      writeOutput(value) {
        output += value;
      },
    });

    assert.equal(result.applied, true);
    assert.equal(result.uploadCount, 61);
    assert.equal(result.verified.length, 23);
    assert.equal(result.mappings.length, 2);
    assert.equal(commands.length, 122);
    assert.ok(commands.slice(0, 61).every(({ args }) => args.includes("get")));
    assert.ok(commands.slice(61).every(({ args }) => args.includes("put")));
    const putTargets = commands.slice(61).map(({ args }) =>
      args.find((argument) => argument.includes("/story-media/") || argument.includes("/assets/")),
    );
    assert.ok(
      putTargets
        .slice(0, 38)
        .every((target) => target.startsWith("parrot-english-art-source/")),
    );
    assert.ok(
      putTargets
        .slice(38)
        .every((target) => target.startsWith("parrot-english-media/")),
    );
    assert.ok(
      commands
        .slice(61, 99)
        .every(({ args }) => !args.includes("--cache-control")),
    );
    assert.ok(
      commands
        .slice(99)
        .every(({ args }) =>
          args.includes("public, max-age=31536000, immutable"),
        ),
    );
    assert.ok(commands.slice(61).every(({ input }) => Buffer.isBuffer(input)));
    assert.match(output, /Published 61 and verified 23 story media objects/);
    assert.match(output, /"coverSrc"/);
  });

  it("preflights all keys and refuses every overwrite before writing", async () => {
    assert.equal(typeof storyPublisher.runStoryMediaPublisher, "function");
    const { cwd, manifestFile } = await createPublisherFixture();
    const commands = [];

    await assert.rejects(
      storyPublisher.runStoryMediaPublisher({
        args: ["--manifest", manifestFile, "--apply"],
        cwd,
        env: createEnvironment(),
        runCommand(command, args) {
          commands.push({ args, command });
          if (args.includes("get") && commands.length === 7) {
            return { status: 0, stderr: "" };
          }
          return { status: 1, stderr: "The specified key does not exist." };
        },
        writeOutput() {},
      }),
      /already exists; increment the story media version/,
    );
    assert.equal(
      commands.filter(({ args }) => args.includes("get")).length,
      61,
    );
    assert.equal(
      commands.filter(({ args }) => args.includes("put")).length,
      0,
    );
  });
});
