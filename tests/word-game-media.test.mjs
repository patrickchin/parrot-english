/* global Buffer, structuredClone */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";
import sharp from "sharp";

const wordGameMedia = await import("../scripts/word-game-media.mjs").catch(
  () => ({}),
);
const wordGamePublisher = await import(
  "../scripts/publish-word-game-media.mjs"
).catch(() => ({}));
const manifest = JSON.parse(
  await readFile(new URL("../content/media/word-games-v8.json", import.meta.url)),
);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const temporaryDirectories = [];
const EXPECTED_ITEMS = Object.freeze({
  animals: ["cat", "dog", "bird", "fish", "duck", "frog"],
  "body-parts": ["eyes", "ears", "nose", "mouth", "hand", "foot"],
  food: ["apple", "banana", "carrot", "orange", "bread", "cheese"],
  toys: ["ball", "toy-car", "doll", "kite", "blocks", "teddy-bear"],
  feelings: ["happy", "sad", "angry", "sleepy", "surprised", "silly"],
});

function cloneManifest() {
  return structuredClone(manifest);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function deliveryResponse(bytes, overrides = {}) {
  return new Response(bytes, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": String(bytes.length),
      "content-type": "image/webp",
      ...overrides.headers,
    },
    status: overrides.status ?? 200,
  });
}

function missingObject() {
  return { status: 1, stderr: "R2 object does not exist", stdout: "" };
}

function successfulCommand() {
  return { status: 0, stderr: "", stdout: "" };
}

function fakeHelperChild() {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.stderr = new EventEmitter();
  child.stdout = new EventEmitter();
  child.kill = () => true;
  return child;
}

function applyEnvironment(overrides = {}) {
  return {
    PARROT_MEDIA_ORIGIN: "https://media.example.com",
    PARROT_MEDIA_PUBLIC_BUCKET: "public-media",
    PARROT_MEDIA_SOURCE_BUCKET: "private-source",
    ...overrides,
  };
}

async function createPublishFixture() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "parrot-word-game-media-"));
  temporaryDirectories.push(cwd);
  await Promise.all([
    cp(
      path.join(repoRoot, "tmp/imagegen/word-games/v8"),
      path.join(cwd, "tmp/imagegen/word-games/v8"),
      { recursive: true },
    ),
    cp(
      path.join(repoRoot, "content/media/prompts/word-games-v8"),
      path.join(cwd, "content/media/prompts/word-games-v8"),
      { recursive: true },
    ),
  ]);
  return cwd;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("word-game media publishing", () => {
  it("provides a dedicated manifest planner", () => {
    assert.equal(typeof wordGameMedia.createWordGameMediaPublishPlan, "function");
  });

  it("plans the exact 30 accepted public cards and ten private provenance objects", () => {
    const plan = wordGameMedia.createWordGameMediaPublishPlan(manifest);
    const expectedKeys = Object.entries(EXPECTED_ITEMS).flatMap(
      ([topic, items]) =>
        items.map((item) => `assets/v8/word-games/${topic}/${item}.webp`),
    );

    assert.deepEqual(
      plan.publicOutputs.map(({ key }) => key),
      expectedKeys,
    );
    assert.equal(plan.publicOutputs.length, 30);
    assert.deepEqual(
      plan.privateObjects.map(({ key }) => key),
      Object.keys(EXPECTED_ITEMS).flatMap((topic) => [
        `provenance/word-games/v8/${topic}/source.png`,
        `provenance/word-games/v8/${topic}/prompt.json`,
      ]),
    );
    assert.equal(plan.privateObjects.length, 10);
    assert.equal(
      plan.topics.every(
        ({ promptBytes, promptSha256 }) =>
          Number.isSafeInteger(promptBytes) &&
          promptBytes > 0 &&
          /^[a-f0-9]{64}$/.test(promptSha256),
      ),
      true,
    );
    assert.equal(
      plan.publicOutputs.every(
        ({ cacheControl, contentType, height, width }) =>
          cacheControl === "public, max-age=31536000, immutable" &&
          contentType === "image/webp" &&
          height === 512 &&
          width === 512,
      ),
      true,
    );
  });

  it("rejects the wrong schema, version, topic inventory, or item inventory", () => {
    for (const mutate of [
      (value) => {
        value.schema = "wrong";
      },
      (value) => {
        value.schemaVersion = 2;
      },
      (value) => {
        value.mediaVersion = 9;
      },
      (value) => {
        value.topics.pop();
      },
      (value) => {
        value.topics[0].items[0].itemId = "horse";
      },
    ]) {
      const value = cloneManifest();
      mutate(value);
      assert.throws(
        () => wordGameMedia.createWordGameMediaPublishPlan(value),
        /manifest|inventory|topics|items/i,
      );
    }
  });

  it("rejects traversal, absolute, backslash, and off-root source, card, and prompt paths", () => {
    const cases = [
      ["sourceSheet", "ignoredPath", "tmp/imagegen/word-games/v8/sheets/../outside.png"],
      ["sourceSheet", "ignoredPath", "/tmp/imagegen/word-games/v8/sheets/animals.png"],
      ["sourceSheet", "ignoredPath", "tmp\\imagegen\\word-games\\v8\\sheets\\animals.png"],
      ["sourceSheet", "ignoredPath", "content/media/animals.png"],
      ["item", "ignoredOutputPath", "tmp/imagegen/word-games/v8/cards/../../outside.webp"],
      ["item", "ignoredOutputPath", "content/media/cat.webp"],
      ["topic", "promptFile", "content/media/prompts/word-games-v8/../secret.json"],
      ["topic", "promptFile", "tmp/imagegen/word-games/v8/prompts/animals.json"],
    ];

    for (const [owner, field, invalidPath] of cases) {
      const value = cloneManifest();
      const topic = value.topics[0];
      const target = owner === "sourceSheet"
        ? topic.sourceSheet
        : owner === "item"
          ? topic.items[0]
          : topic;
      target[field] = invalidPath;
      assert.throws(
        () => wordGameMedia.createWordGameMediaPublishPlan(value),
        /path|inside|beneath|prompt|source|card/i,
        invalidPath,
      );
    }
  });

  it("rejects duplicate public targets and duplicate crops within one sheet", () => {
    const duplicateTarget = cloneManifest();
    duplicateTarget.topics[0].items[1].publicKey =
      duplicateTarget.topics[0].items[0].publicKey;
    assert.throws(
      () => wordGameMedia.createWordGameMediaPublishPlan(duplicateTarget),
      /public.*unique|duplicate.*public/i,
    );

    const duplicateCrop = cloneManifest();
    duplicateCrop.topics[0].items[1].crop = structuredClone(
      duplicateCrop.topics[0].items[0].crop,
    );
    assert.throws(
      () => wordGameMedia.createWordGameMediaPublishPlan(duplicateCrop),
      /crop.*overlap|overlap.*crop/i,
    );

    const wrongTarget = cloneManifest();
    wrongTarget.topics[0].items[0].publicKey =
      "assets/v8/word-games/animals/kitten.webp";
    assert.throws(
      () => wordGameMedia.createWordGameMediaPublishPlan(wrongTarget),
      /public key must be.*cat\.webp/i,
    );
  });

  it("rejects fractional, overlapping, and out-of-bounds crop rectangles", () => {
    for (const [field, value, pattern] of [
      ["left", 0.5, /crop.*integer/i],
      ["left", 256, /crop.*overlap|overlap.*crop/i],
      ["width", 1537, /crop.*bounds|outside.*sheet/i],
    ]) {
      const changed = cloneManifest();
      changed.topics[0].items[field === "left" && value === 256 ? 1 : 0].crop[
        field
      ] = value;
      assert.throws(
        () => wordGameMedia.createWordGameMediaPublishPlan(changed),
        pattern,
      );
    }
  });

  it("rejects invalid source/output declarations and incomplete audits", () => {
    const mutations = [
      [(value) => (value.topics[0].promptBytes = 0), /prompt.*bytes/i],
      [(value) => (value.topics[0].promptSha256 = "bad"), /prompt.*sha-?256/i],
      [(value) => (value.topics[0].sourceSheet.sha256 = "bad"), /sha-?256/i],
      [(value) => (value.topics[0].sourceSheet.bytes = 0), /bytes/i],
      [(value) => (value.topics[0].sourceSheet.width = 100), /1536|geometry|width/i],
      [(value) => (value.topics[0].items[0].output.sha256 = "bad"), /sha-?256/i],
      [(value) => (value.topics[0].items[0].output.bytes = 0), /bytes/i],
      [(value) => (value.topics[0].items[0].output.width = 256), /512|width/i],
      [(value) => (value.topics[0].items[0].audit.adequateMargin = false), /audit/i],
    ];
    for (const [mutate, pattern] of mutations) {
      const value = cloneManifest();
      mutate(value);
      assert.throws(
        () => wordGameMedia.createWordGameMediaPublishPlan(value),
        pattern,
      );
    }
  });

  it("prepares the accepted ignored cards verbatim and private provenance bytes", async () => {
    const plan = wordGameMedia.createWordGameMediaPublishPlan(manifest);
    const prepared = await wordGameMedia.prepareWordGameMediaUploads(plan, {
      cwd: repoRoot,
    });

    assert.equal(prepared.publicOutputs.length, 30);
    assert.equal(prepared.privateUploads.length, 10);
    assert.equal(prepared.uploads.length, 40);
    for (const output of prepared.publicOutputs) {
      const accepted = await readFile(path.join(repoRoot, output.file));
      assert.deepEqual(output.bytes, accepted);
      assert.equal(output.sha256, output.sha256Expected);
      assert.equal(output.bytes.length, output.bytesExpected);
    }
    assert.equal(
      prepared.privateUploads.every(
        ({ cacheControl, key, scope }) =>
          scope === "private" &&
          cacheControl === undefined &&
          key.startsWith("provenance/word-games/v8/"),
      ),
      true,
    );
  });

  it("rejects source, prompt, and accepted card byte/hash drift", async () => {
    for (const mutate of [
      (value) => {
        value.topics[0].sourceSheet.sha256 = "0".repeat(64);
      },
      (value) => {
        value.topics[0].promptBytes += 1;
      },
      (value) => {
        value.topics[0].promptSha256 = "0".repeat(64);
      },
      (value) => {
        value.topics[0].items[0].output.bytes += 1;
      },
      (value) => {
        value.topics[0].items[0].output.sha256 = "0".repeat(64);
      },
    ]) {
      const value = cloneManifest();
      mutate(value);
      const plan = wordGameMedia.createWordGameMediaPublishPlan(value);
      await assert.rejects(
        wordGameMedia.prepareWordGameMediaUploads(plan, { cwd: repoRoot }),
        /bytes|sha-?256|hash/i,
      );
    }
  });

  it("rejects decoded source or WebP dimension mismatches", async () => {
    const cwd = await createPublishFixture();
    const sourcePath = path.join(
      cwd,
      "tmp/imagegen/word-games/v8/sheets/animals.png",
    );
    const sourceBytes = await sharp({
      create: {
        background: "white",
        channels: 3,
        height: 100,
        width: 100,
      },
    }).png().toBuffer();
    await writeFile(sourcePath, sourceBytes);
    const badSource = cloneManifest();
    Object.assign(badSource.topics[0].sourceSheet, {
      bytes: sourceBytes.length,
      sha256: sha256(sourceBytes),
    });
    await assert.rejects(
      wordGameMedia.prepareWordGameMediaUploads(
        wordGameMedia.createWordGameMediaPublishPlan(badSource),
        { cwd },
      ),
      /1536x1024|dimensions/i,
    );

    const cardPath = path.join(
      cwd,
      "tmp/imagegen/word-games/v8/cards/animals/cat.webp",
    );
    const cardBytes = await sharp({
      create: {
        background: "white",
        channels: 3,
        height: 256,
        width: 256,
      },
    }).webp().toBuffer();
    await writeFile(
      sourcePath,
      await readFile(
        path.join(repoRoot, manifest.topics[0].sourceSheet.ignoredPath),
      ),
    );
    await writeFile(cardPath, cardBytes);
    const badCard = cloneManifest();
    Object.assign(badCard.topics[0].items[0].output, {
      bytes: cardBytes.length,
      sha256: sha256(cardBytes),
    });
    await assert.rejects(
      wordGameMedia.prepareWordGameMediaUploads(
        wordGameMedia.createWordGameMediaPublishPlan(badCard),
        { cwd },
      ),
      /512x512|dimensions/i,
    );
  });

  it("rejects symlinked source, card, and prompt files that escape their roots", async () => {
    for (const relativeFile of [
      "tmp/imagegen/word-games/v8/sheets/animals.png",
      "tmp/imagegen/word-games/v8/cards/animals/cat.webp",
      "content/media/prompts/word-games-v8/animals.json",
    ]) {
      const cwd = await createPublishFixture();
      const filename = path.join(cwd, relativeFile);
      const outside = path.join(cwd, "outside-file");
      await writeFile(outside, await readFile(filename));
      await unlink(filename);
      await symlink(outside, filename);
      await assert.rejects(
        wordGameMedia.prepareWordGameMediaUploads(
          wordGameMedia.createWordGameMediaPublishPlan(manifest),
          { cwd },
        ),
        /resolve inside|symlink|beneath/i,
        relativeFile,
      );
    }
  });

  it("rejects staging and prompt roots that are symlinks outside the repository", async () => {
    for (const [relativeRoot, outsideRoot] of [
      ["tmp/imagegen/word-games/v8", path.join(repoRoot, "tmp/imagegen/word-games/v8")],
      ["content/media/prompts/word-games-v8", path.join(repoRoot, "content/media/prompts/word-games-v8")],
    ]) {
      const cwd = await createPublishFixture();
      const root = path.join(cwd, relativeRoot);
      await rm(root, { recursive: true });
      await symlink(outsideRoot, root, "dir");
      await assert.rejects(
        wordGameMedia.prepareWordGameMediaUploads(
          wordGameMedia.createWordGameMediaPublishPlan(manifest),
          { cwd },
        ),
        /root.*repository|repository.*root|resolve inside/i,
        relativeRoot,
      );
    }
  });

  it("rejects prompts whose JSON provenance does not match the topic", async () => {
    const cwd = await createPublishFixture();
    await mkdir(path.join(cwd, "content/media/prompts/word-games-v8"), {
      recursive: true,
    });
    const promptBytes = Buffer.from(
      JSON.stringify({ generationMode: "built-in-imagegen", prompt: "valid", schemaVersion: 1, topic: "food" }),
    );
    await writeFile(
      path.join(cwd, "content/media/prompts/word-games-v8/animals.json"),
      promptBytes,
    );
    const changed = cloneManifest();
    changed.topics[0].promptBytes = promptBytes.length;
    changed.topics[0].promptSha256 = sha256(promptBytes);
    await assert.rejects(
      wordGameMedia.prepareWordGameMediaUploads(
        wordGameMedia.createWordGameMediaPublishPlan(changed),
        { cwd },
      ),
      /prompt.*topic|animals.*topic/i,
    );
  });

  it("verifies cache-busted delivery bytes, headers, decode, hash, and dimensions", async () => {
    const prepared = await wordGameMedia.prepareWordGameMediaUploads(
      wordGameMedia.createWordGameMediaPublishPlan(manifest),
      { cwd: repoRoot },
    );
    const requests = [];
    const verification = await wordGameMedia.verifyWordGameMediaDelivery(
      prepared,
      {
        cacheBust: "fixture",
        fetch: async (url, options) => {
          requests.push({ options, url: new URL(url) });
          const key = new URL(url).pathname.slice(1);
          const output = prepared.publicOutputs.find(({ key: value }) => value === key);
          return deliveryResponse(output.bytes);
        },
        mediaOrigin: "https://media.example.com",
      },
    );

    assert.equal(verification.verified.length, 30);
    assert.equal(requests.length, 30);
    assert.equal(
      requests.every(
        ({ options, url }) =>
          options.cache === "no-store" &&
          options.method === "GET" &&
          options.redirect === "error" &&
          url.searchParams.get("parrot-word-game-media-check") ===
            "verify-fixture",
      ),
      true,
    );
  });

  it("rejects every delivery failure mode", async () => {
    const prepared = await wordGameMedia.prepareWordGameMediaUploads(
      wordGameMedia.createWordGameMediaPublishPlan(manifest),
      { cwd: repoRoot },
    );
    const output = prepared.publicOutputs[0];
    const one = { publicOutputs: [output] };
    const smallWebp = await sharp({
      create: {
        background: "white",
        channels: 3,
        height: 256,
        width: 256,
      },
    }).webp().toBuffer();
    const truncatedWebp = Buffer.from(output.bytes.subarray(0, output.bytes.length - 4));
    truncatedWebp.writeUInt32LE(truncatedWebp.length - 8, 4);
    truncatedWebp.writeUInt32LE(truncatedWebp.length - 20, 16);
    const truncatedMetadata = await sharp(truncatedWebp, {
      failOn: "error",
    }).metadata();
    assert.equal(truncatedMetadata.format, "webp");
    assert.equal(truncatedMetadata.width, 512);
    assert.equal(truncatedMetadata.height, 512);
    const cases = [
      [async () => { throw new Error("offline"); }, /could not be requested.*offline/i],
      [async () => deliveryResponse(output.bytes, { status: 503 }), /HTTP 503/i],
      [async () => deliveryResponse(output.bytes, { headers: { "content-type": "image/png" } }), /image\/webp/i],
      [async () => deliveryResponse(output.bytes, { headers: { "cache-control": "public, max-age=31536000" } }), /immutable cache/i],
      [async () => deliveryResponse(output.bytes, { headers: { "content-length": "0" } }), /positive content-length/i],
      [async () => deliveryResponse(prepared.publicOutputs[1].bytes), /SHA-256 mismatch/i],
      [async () => deliveryResponse(Buffer.from("not-webp")), /decode as WebP/i],
      [async () => deliveryResponse(truncatedWebp), /decode as WebP/i],
      [async () => deliveryResponse(smallWebp), /512x512/i],
    ];

    for (const [fetch, pattern] of cases) {
      await assert.rejects(
        wordGameMedia.verifyWordGameMediaDelivery(one, {
          cacheBust: "fixture",
          fetch,
          mediaOrigin: "https://media.example.com",
        }),
        pattern,
      );
    }
  });

  it("keeps default and explicit dry runs offline and prints exact counts", async () => {
    for (const args of [[], ["--dry-run"]]) {
      const output = [];
      const result = await wordGamePublisher.runWordGameMediaPublisher({
        args,
        cwd: repoRoot,
        env: new Proxy({}, { get() { throw new Error("env must not be read"); } }),
        fetch: async () => { throw new Error("network must not be used"); },
        runCommand: () => { throw new Error("R2 must not be used"); },
        writeOutput: (value) => output.push(value),
      });
      assert.deepEqual(result, {
        applied: false,
        privateCount: 10,
        publicCount: 30,
        uploadCount: 40,
      });
      assert.match(output.join(""), /Dry run: 30 public.*10 private.*40 total/i);
    }
  });

  it("requires exactly the three media environment settings only for apply", async () => {
    for (const name of [
      "PARROT_MEDIA_ORIGIN",
      "PARROT_MEDIA_PUBLIC_BUCKET",
      "PARROT_MEDIA_SOURCE_BUCKET",
    ]) {
      const env = applyEnvironment();
      delete env[name];
      await assert.rejects(
        wordGamePublisher.runWordGameMediaPublisher({
          args: ["--apply"],
          cwd: repoRoot,
          env,
          fetch: async () => { throw new Error("must not fetch"); },
          runCommand: () => { throw new Error("must not run R2"); },
          writeOutput: () => {},
        }),
        new RegExp(`${name} must be set`),
      );
    }
  });

  it("preflights every R2 key and refuses existing or unknown objects without puts", async () => {
    for (const firstResult of [
      successfulCommand(),
      { status: 1, stderr: "permission denied", stdout: "" },
      { status: 1, stderr: "Authentication endpoint returned HTTP 404", stdout: "" },
      new Error("wrangler crashed"),
    ]) {
      const calls = [];
      await assert.rejects(
        wordGamePublisher.runWordGameMediaPublisher({
          args: ["--apply"],
          cacheBust: "fixture",
          cwd: repoRoot,
          env: applyEnvironment(),
          fetch: async () => new Response(null, { status: 404 }),
          runCommand: (_command, args) => {
            calls.push(args);
            if (calls.length === 1 && firstResult instanceof Error) {
              throw firstResult;
            }
            return calls.length === 1 ? firstResult : missingObject();
          },
          writeOutput: () => {},
        }),
        /already exists|could not preflight|permission denied|authentication endpoint|wrangler crashed/i,
      );
      assert.equal(calls.length, 40);
      assert.equal(calls.every((args) => args.includes("get")), true);
      assert.equal(calls.some((args) => args.includes("put")), false);
    }
  });

  it("preflights all 30 cache-busted origin URLs and refuses any non-absent response", async () => {
    const calls = [];
    const requests = [];
    await assert.rejects(
      wordGamePublisher.runWordGameMediaPublisher({
        args: ["--apply"],
        cacheBust: "fixture",
        cwd: repoRoot,
        env: applyEnvironment(),
        fetch: async (url, options) => {
          requests.push({ options, url: new URL(url) });
          return new Response(null, { status: requests.length === 1 ? 200 : 404 });
        },
        runCommand: (_command, args) => {
          calls.push(args);
          return missingObject();
        },
        writeOutput: () => {},
      }),
      /origin.*already exists|not absent|HTTP 200/i,
    );
    assert.equal(calls.length, 40);
    assert.equal(requests.length, 30);
    assert.equal(
      requests.every(
        ({ options, url }) =>
          options.cache === "no-store" &&
          options.method === "GET" &&
          options.redirect === "error" &&
          url.searchParams.get("parrot-word-game-media-check") ===
            "preflight-fixture",
      ),
      true,
    );
    assert.equal(calls.some((args) => args.includes("put")), false);
  });

  it("uploads private provenance and public cards with the exact buckets and headers", async () => {
    const prepared = await wordGameMedia.prepareWordGameMediaUploads(
      wordGameMedia.createWordGameMediaPublishPlan(manifest),
      { cwd: repoRoot },
    );
    const events = [];
    const puts = [];
    const result = await wordGamePublisher.runWordGameMediaPublisher({
      args: ["--apply"],
      cacheBust: "fixture",
      cwd: repoRoot,
      env: applyEnvironment(),
      fetch: async (url) => {
        const parsed = new URL(url);
        const phase = parsed.searchParams.get("parrot-word-game-media-check");
        events.push(phase);
        if (phase === "preflight-fixture") {
          return new Response(null, { status: 404 });
        }
        const output = prepared.publicOutputs.find(
          ({ key }) => key === parsed.pathname.slice(1),
        );
        return deliveryResponse(output.bytes);
      },
      runCommand: () => {
        events.push("r2-get");
        return missingObject();
      },
      createUploader: async () => ({
        close: async () => {},
        put: async (upload) => {
          events.push("r2-put");
          puts.push(upload);
        },
      }),
      writeOutput: () => {},
    });

    assert.equal(result.applied, true);
    assert.equal(result.uploadCount, 40);
    assert.equal(result.verified.length, 30);
    assert.equal(puts.length, 40);
    const firstPut = events.indexOf("r2-put");
    assert.equal(events.slice(0, firstPut).filter((value) => value === "r2-get").length, 40);
    assert.equal(events.slice(0, firstPut).filter((value) => value === "preflight-fixture").length, 30);
    assert.equal(events.slice(firstPut, firstPut + 40).every((value) => value === "r2-put"), true);

    const privatePuts = puts.filter(({ bucket }) => bucket === "private-source");
    const publicPuts = puts.filter(({ bucket }) => bucket === "public-media");
    assert.equal(privatePuts.length, 10);
    assert.equal(publicPuts.length, 30);
    assert.equal(
      privatePuts.every(({ cacheControl }) => cacheControl === undefined),
      true,
    );
    assert.equal(
      privatePuts.filter(({ contentType }) => contentType === "application/json").length,
      5,
    );
    assert.equal(
      privatePuts.filter(({ contentType }) => contentType === "image/png").length,
      5,
    );
    assert.equal(
      publicPuts.every(
        ({ cacheControl, contentType }) =>
          contentType === "image/webp" &&
          cacheControl === "public, max-age=31536000, immutable",
      ),
      true,
    );
  });

  it("stops on a failed immutable upload without retrying or verifying", async () => {
    let puts = 0;
    let originRequests = 0;
    await assert.rejects(
      wordGamePublisher.runWordGameMediaPublisher({
        args: ["--apply"],
        cacheBust: "fixture",
        cwd: repoRoot,
        env: applyEnvironment(),
        fetch: async () => {
          originRequests += 1;
          return new Response(null, { status: 404 });
        },
        runCommand: () => missingObject(),
        createUploader: async () => ({
          close: async () => {},
          put: async () => {
            puts += 1;
            if (puts === 3) throw new Error("upload failed");
          },
        }),
        writeOutput: () => {},
      }),
      /upload failed.*do not retry|do not retry.*upload failed/i,
    );
    assert.equal(puts, 3);
    assert.equal(originRequests, 30);
  });

  it("retains a failed immutable upload when helper cleanup also fails", async () => {
    let closes = 0;
    let puts = 0;
    let originRequests = 0;
    await assert.rejects(
      wordGamePublisher.runWordGameMediaPublisher({
        args: ["--apply"],
        cacheBust: "fixture",
        createUploader: async () => ({
          close: async () => {
            closes += 1;
            throw new Error("cleanup failed");
          },
          put: async () => {
            puts += 1;
            if (puts === 3) throw new Error("upload failed");
          },
        }),
        cwd: repoRoot,
        env: applyEnvironment(),
        fetch: async () => {
          originRequests += 1;
          return new Response(null, { status: 404 });
        },
        runCommand: () => missingObject(),
        writeOutput: () => {},
      }),
      /upload failed.*do not retry.*cleanup failed/i,
    );
    assert.equal(puts, 3);
    assert.equal(closes, 1);
    assert.equal(originRequests, 30);
  });

  it("verifies delivery after all puts even when helper cleanup fails", async () => {
    const prepared = await wordGameMedia.prepareWordGameMediaUploads(
      wordGameMedia.createWordGameMediaPublishPlan(manifest),
      { cwd: repoRoot },
    );
    let originRequests = 0;
    let puts = 0;
    await assert.rejects(
      wordGamePublisher.runWordGameMediaPublisher({
        args: ["--apply"],
        cacheBust: "fixture",
        createUploader: async () => ({
          close: async () => { throw new Error("cleanup failed"); },
          put: async () => { puts += 1; },
        }),
        cwd: repoRoot,
        env: applyEnvironment(),
        fetch: async (url) => {
          originRequests += 1;
          const parsed = new URL(url);
          if (parsed.searchParams.get("parrot-word-game-media-check") === "preflight-fixture") {
            return new Response(null, { status: 404 });
          }
          const output = prepared.publicOutputs.find(
            ({ key }) => key === parsed.pathname.slice(1),
          );
          return deliveryResponse(output.bytes);
        },
        runCommand: () => missingObject(),
        writeOutput: () => {},
      }),
      /40 uploads completed.*30 delivery objects verified.*cleanup failed/i,
    );
    assert.equal(puts, 40);
    assert.equal(originRequests, 60);
  });

  it("uses an atomic R2 create-only condition and refuses a concurrent creation", async () => {
    const calls = [];
    const stored = new Map();
    const bucket = {
      put: async (key, body, options) => {
        calls.push({ body: Buffer.from(await new Response(body).arrayBuffer()), key, options });
        if (stored.has(key)) return null;
        const object = { key };
        stored.set(key, object);
        return object;
      },
    };
    const environment = { PUBLIC_BUCKET: bucket, SOURCE_BUCKET: bucket };
    const request = (body) => new Request(
      "http://127.0.0.1/upload?scope=public&key=assets%2Fv8%2Fword-games%2Fanimals%2Fcat.webp",
      {
        body,
        headers: {
          "cache-control": "public, max-age=31536000, immutable",
          "content-type": "image/webp",
          "x-parrot-upload-secret": "secret",
        },
        method: "PUT",
      },
    );

    const created = await wordGamePublisher.atomicR2WorkerFetch(
      request("first"),
      environment,
      "secret",
    );
    const concurrent = await wordGamePublisher.atomicR2WorkerFetch(
      request("second"),
      environment,
      "secret",
    );

    assert.equal(created.status, 201);
    assert.equal(concurrent.status, 412);
    assert.deepEqual(calls.map(({ options }) => options.onlyIf), [
      { etagDoesNotMatch: "*" },
      { etagDoesNotMatch: "*" },
    ]);
    assert.deepEqual(calls[0].options.httpMetadata, {
      cacheControl: "public, max-age=31536000, immutable",
      contentType: "image/webp",
    });
    assert.equal(stored.size, 1);
    assert.equal(calls[0].body.toString(), "first");
    assert.equal(calls[1].body.toString(), "second");
  });

  it("rejects unauthorized or malformed atomic worker requests before R2", async () => {
    let puts = 0;
    const environment = {
      PUBLIC_BUCKET: { put: async () => { puts += 1; } },
      SOURCE_BUCKET: { put: async () => { puts += 1; } },
    };
    for (const request of [
      new Request("http://127.0.0.1/upload?scope=public&key=key", {
        body: "bytes",
        method: "PUT",
      }),
      new Request("http://127.0.0.1/upload?scope=wrong&key=key", {
        body: "bytes",
        headers: { "x-parrot-upload-secret": "secret" },
        method: "PUT",
      }),
      new Request("http://127.0.0.1/upload?scope=public", {
        body: "bytes",
        headers: { "x-parrot-upload-secret": "secret" },
        method: "PUT",
      }),
      new Request("http://127.0.0.1/upload?scope=public&key=key", {
        headers: { "x-parrot-upload-secret": "secret" },
        method: "GET",
      }),
    ]) {
      const response = await wordGamePublisher.atomicR2WorkerFetch(
        request,
        environment,
        "secret",
      );
      assert.equal(response.status >= 400, true);
    }
    assert.equal(puts, 0);
  });

  it("builds an isolated two-binding remote helper configuration", () => {
    const definition = wordGamePublisher.createAtomicR2HelperDefinition({
      publicBucket: "public-media",
      sourceBucket: "private-source",
      workerFile: "/private/helper/worker.mjs",
      workerName: "parrot-wg-fixture",
    });

    assert.deepEqual(definition.config.r2_buckets, [
      { binding: "PUBLIC_BUCKET", bucket_name: "public-media", remote: true },
      { binding: "SOURCE_BUCKET", bucket_name: "private-source", remote: true },
    ]);
    assert.equal(definition.config.vars, undefined);
    assert.equal(JSON.stringify(definition.config).includes("capability"), false);
    assert.equal(definition.config.main, "/private/helper/worker.mjs");
    assert.match(definition.source, /etagDoesNotMatch:\s*"\*"/);
  });

  it("removes the temporary helper directory when startup fails", async () => {
    const events = [];
    await assert.rejects(
      wordGamePublisher.startAtomicR2Uploader(
        {
          cwd: repoRoot,
          publicBucket: "public-media",
          sourceBucket: "private-source",
        },
        {
          makeTemporaryDirectory: async () => "/private/helper",
          removeDirectory: async (directory) => { events.push(["remove", directory]); },
          reservePort: async () => 12345,
          write: async (filename, contents) => {
            events.push(["write", filename, String(contents).includes("capability")]);
            if (filename.endsWith("wrangler.json")) throw new Error("config write failed");
          },
        },
      ),
      /config write failed/i,
    );
    assert.deepEqual(events.map(([event]) => event), ["write", "write", "remove"]);
    assert.deepEqual(events.at(-1), ["remove", "/private/helper"]);
  });

  it("binds the helper to loopback and attempts stop plus removal on close", async () => {
    const cleanup = [];
    const launches = [];
    const writes = new Map();
    const uploader = await wordGamePublisher.startAtomicR2Uploader(
      {
        cwd: repoRoot,
        publicBucket: "public-media",
        sourceBucket: "private-source",
      },
      {
        fetchImplementation: async () => new Response(null, { status: 204 }),
        makeTemporaryDirectory: async () => "/private/helper",
        removeDirectory: async () => {
          cleanup.push("remove");
          throw new Error("remove failed");
        },
        reservePort: async () => 12345,
        spawnProcess: (_command, args) => {
          launches.push(args);
          return fakeHelperChild();
        },
        stopChild: async () => {
          cleanup.push("stop");
          throw new Error("stop failed");
        },
        write: async (filename, contents) => { writes.set(filename, String(contents)); },
      },
    );

    assert.equal(launches.length, 1);
    assert.equal(launches[0].includes("--remote"), false);
    assert.equal(launches[0].includes("--var"), true);
    assert.equal(
      launches[0].some((argument) => argument.startsWith("UPLOAD_SECRET:")),
      true,
    );
    assert.deepEqual(
      launches[0].slice(launches[0].indexOf("--ip"), launches[0].indexOf("--ip") + 2),
      ["--ip", "127.0.0.1"],
    );
    const config = JSON.parse(writes.get("/private/helper/wrangler.json"));
    assert.equal(JSON.stringify(config).includes("UPLOAD_SECRET"), false);
    assert.equal(config.r2_buckets.length, 2);
    assert.equal(config.r2_buckets.every(({ remote }) => remote === true), true);
    await assert.rejects(uploader.close(), /stop failed.*remove failed/i);
    assert.deepEqual(cleanup, ["stop", "remove"]);
  });

  it("bounds helper puts and reports a timeout as indeterminate and no-retry", async () => {
    let requests = 0;
    const uploader = await wordGamePublisher.startAtomicR2Uploader(
      {
        cwd: repoRoot,
        publicBucket: "public-media",
        sourceBucket: "private-source",
      },
      {
        createTimeoutSignal: () => ({ aborted: true }),
        fetchImplementation: async (_url, options) => {
          requests += 1;
          if (options.method === "PUT") throw new Error("aborted");
          return new Response(null, { status: 204 });
        },
        makeTemporaryDirectory: async () => "/private/helper",
        removeDirectory: async () => {},
        reservePort: async () => 12345,
        spawnProcess: () => fakeHelperChild(),
        stopChild: async () => {},
        write: async () => {},
      },
    );

    await assert.rejects(
      uploader.put({
        bytes: Buffer.from("bytes"),
        contentType: "image/webp",
        key: "assets/v8/word-games/animals/cat.webp",
        scope: "public",
      }),
      /timed out.*indeterminate.*do not retry/i,
    );
    await uploader.close();
    assert.equal(requests, 2);
  });

  it("stops when a key is created concurrently after preflight", async () => {
    let puts = 0;
    let requests = 0;
    await assert.rejects(
      wordGamePublisher.runWordGameMediaPublisher({
        args: ["--apply"],
        cacheBust: "fixture",
        createUploader: async () => ({
          close: async () => {},
          put: async () => {
            puts += 1;
            if (puts === 3) {
              throw new Error("was created concurrently; do not retry this media version");
            }
          },
        }),
        cwd: repoRoot,
        env: applyEnvironment(),
        fetch: async () => {
          requests += 1;
          return new Response(null, { status: 404 });
        },
        runCommand: () => missingObject(),
        writeOutput: () => {},
      }),
      /created concurrently.*do not retry/i,
    );
    assert.equal(puts, 3);
    assert.equal(requests, 30);
  });
});
