/* global Buffer, structuredClone */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const temporaryDirectories = [];
const EXPECTED_ITEMS = Object.freeze({
  animals: ["cat", "dog", "bird", "fish", "duck", "frog"],
  "body-parts": ["eyes", "ears", "nose", "mouth", "hand", "foot"],
  food: ["apple", "banana", "carrot", "orange", "bread", "cheese"],
  toys: ["ball", "toy-car", "doll", "kite", "blocks", "teddy-bear"],
  feelings: ["happy", "sad", "angry", "sleepy", "surprised", "silly"],
});

function cloneManifest(value = manifest) {
  return structuredClone(value);
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

function applyEnvironment(overrides = {}) {
  return {
    PARROT_MEDIA_ORIGIN: "https://media.example.com",
    PARROT_MEDIA_PUBLIC_BUCKET: "public-media",
    PARROT_MEDIA_SOURCE_BUCKET: "private-source",
    ...overrides,
  };
}

async function createManifestOnlyFixture() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "parrot-word-game-media-"));
  temporaryDirectories.push(cwd);
  await mkdir(path.join(cwd, "content/media"), { recursive: true });
  await writeFile(
    path.join(cwd, "content/media/word-games-v8.json"),
    JSON.stringify(manifest),
  );
  return cwd;
}

async function writeSyntheticImage(cwd, filename, format, width, height, index) {
  await mkdir(path.dirname(path.join(cwd, filename)), { recursive: true });
  const bytes = await sharp({
    create: {
      background: {
        b: (index * 53) % 256,
        g: (index * 37) % 256,
        r: (index * 19) % 256,
      },
      channels: 3,
      height,
      width,
    },
  })[format]().toBuffer();
  await writeFile(path.join(cwd, filename), bytes);
  return bytes;
}

async function createPublishFixture() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "parrot-word-game-media-"));
  temporaryDirectories.push(cwd);
  const fixtureManifest = cloneManifest();
  await cp(
    new URL("../content/media/prompts/word-games-v8", import.meta.url),
    path.join(cwd, "content/media/prompts/word-games-v8"),
    { recursive: true },
  );
  await Promise.all(
    fixtureManifest.topics.flatMap((topic, topicIndex) => [
      writeSyntheticImage(
        cwd,
        topic.sourceSheet.ignoredPath,
        "png",
        1536,
        1024,
        topicIndex,
      ).then((bytes) => {
        Object.assign(topic.sourceSheet, {
          bytes: bytes.length,
          sha256: sha256(bytes),
        });
      }),
      ...topic.items.map((item, itemIndex) =>
        writeSyntheticImage(
          cwd,
          item.ignoredOutputPath,
          "webp",
          512,
          512,
          topicIndex * topic.items.length + itemIndex,
        ).then((bytes) => {
          Object.assign(item.output, {
            bytes: bytes.length,
            sha256: sha256(bytes),
          });
        }),
      ),
    ]),
  );
  await mkdir(path.join(cwd, "content/media"), { recursive: true });
  await writeFile(
    path.join(cwd, "content/media/word-games-v8.json"),
    JSON.stringify(fixtureManifest),
  );
  return { cwd, manifest: fixtureManifest };
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

  it("prepares pinned fixture cards and private provenance bytes", async () => {
    const fixture = await createPublishFixture();
    const plan = wordGameMedia.createWordGameMediaPublishPlan(fixture.manifest);
    const prepared = await wordGameMedia.prepareWordGameMediaUploads(plan, {
      cwd: fixture.cwd,
    });

    assert.equal(prepared.publicOutputs.length, 30);
    assert.equal(prepared.privateUploads.length, 10);
    assert.equal(prepared.uploads.length, 40);
    for (const output of prepared.publicOutputs) {
      const accepted = await readFile(path.join(fixture.cwd, output.file));
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
    const fixture = await createPublishFixture();
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
      const value = cloneManifest(fixture.manifest);
      mutate(value);
      const plan = wordGameMedia.createWordGameMediaPublishPlan(value);
      await assert.rejects(
        wordGameMedia.prepareWordGameMediaUploads(plan, { cwd: fixture.cwd }),
        /bytes|sha-?256|hash/i,
      );
    }
  });

  it("rejects decoded source or WebP dimension mismatches", async () => {
    const fixture = await createPublishFixture();
    const { cwd } = fixture;
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
    const originalSourceBytes = await readFile(sourcePath);
    await writeFile(sourcePath, sourceBytes);
    const badSource = cloneManifest(fixture.manifest);
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
    await writeFile(sourcePath, originalSourceBytes);
    await writeFile(cardPath, cardBytes);
    const badCard = cloneManifest(fixture.manifest);
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
      const fixture = await createPublishFixture();
      const { cwd } = fixture;
      const filename = path.join(cwd, relativeFile);
      const outside = path.join(cwd, "outside-file");
      await writeFile(outside, await readFile(filename));
      await unlink(filename);
      await symlink(outside, filename);
      await assert.rejects(
        wordGameMedia.prepareWordGameMediaUploads(
          wordGameMedia.createWordGameMediaPublishPlan(fixture.manifest),
          { cwd },
        ),
        /resolve inside|symlink|beneath/i,
        relativeFile,
      );
    }
  });

  it("rejects staging and prompt roots that are symlinks outside the repository", async () => {
    for (const relativeRoot of [
      "tmp/imagegen/word-games/v8",
      "content/media/prompts/word-games-v8",
    ]) {
      const fixture = await createPublishFixture();
      const { cwd } = fixture;
      const root = path.join(cwd, relativeRoot);
      await rm(root, { recursive: true });
      await symlink(path.dirname(cwd), root, "dir");
      await assert.rejects(
        wordGameMedia.prepareWordGameMediaUploads(
          wordGameMedia.createWordGameMediaPublishPlan(fixture.manifest),
          { cwd },
        ),
        /root.*repository|repository.*root|resolve inside/i,
        relativeRoot,
      );
    }
  });

  it("rejects prompts whose JSON provenance does not match the topic", async () => {
    const fixture = await createPublishFixture();
    const { cwd } = fixture;
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
    const changed = cloneManifest(fixture.manifest);
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
    const fixture = await createPublishFixture();
    const prepared = await wordGameMedia.prepareWordGameMediaUploads(
      wordGameMedia.createWordGameMediaPublishPlan(fixture.manifest),
      { cwd: fixture.cwd },
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
    const fixture = await createPublishFixture();
    const prepared = await wordGameMedia.prepareWordGameMediaUploads(
      wordGameMedia.createWordGameMediaPublishPlan(fixture.manifest),
      { cwd: fixture.cwd },
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
    const cwd = await createManifestOnlyFixture();
    for (const args of [[], ["--dry-run"]]) {
      const output = [];
      const result = await wordGamePublisher.runWordGameMediaPublisher({
        args,
        cwd,
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
    const fixture = await createPublishFixture();
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
          cwd: fixture.cwd,
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
    const fixture = await createPublishFixture();
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
          cwd: fixture.cwd,
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
    const fixture = await createPublishFixture();
    const calls = [];
    const requests = [];
    await assert.rejects(
      wordGamePublisher.runWordGameMediaPublisher({
        args: ["--apply"],
        cacheBust: "fixture",
        cwd: fixture.cwd,
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
    const fixture = await createPublishFixture();
    const prepared = await wordGameMedia.prepareWordGameMediaUploads(
      wordGameMedia.createWordGameMediaPublishPlan(fixture.manifest),
      { cwd: fixture.cwd },
    );
    const events = [];
    const commands = [];
    const result = await wordGamePublisher.runWordGameMediaPublisher({
      args: ["--apply"],
      cacheBust: "fixture",
      cwd: fixture.cwd,
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
      runCommand: (command, args, options) => {
        const operation = args.includes("get") ? "r2-get" : "r2-put";
        events.push(operation);
        commands.push({ args, command, options });
        return operation === "r2-get" ? missingObject() : successfulCommand();
      },
      writeOutput: () => {},
    });

    assert.equal(result.applied, true);
    assert.equal(result.uploadCount, 40);
    assert.equal(result.verified.length, 30);
    const puts = commands.filter(({ args }) => args.includes("put"));
    assert.equal(puts.length, 40);
    const firstPut = events.indexOf("r2-put");
    assert.equal(events.slice(0, firstPut).filter((value) => value === "r2-get").length, 40);
    assert.equal(events.slice(0, firstPut).filter((value) => value === "preflight-fixture").length, 30);
    assert.equal(events.slice(firstPut, firstPut + 40).every((value) => value === "r2-put"), true);

    assert.equal(
      commands.every(({ args }) => !args.includes("deploy") && !args.includes("delete")),
      true,
    );
    const privatePuts = puts.filter(({ args }) =>
      args.some((value) => value.startsWith("private-source/")),
    );
    const publicPuts = puts.filter(({ args }) =>
      args.some((value) => value.startsWith("public-media/")),
    );
    assert.equal(privatePuts.length, 10);
    assert.equal(publicPuts.length, 30);
    for (const [index, call] of puts.entries()) {
      const upload = prepared.uploads[index];
      const bucket = upload.scope === "public" ? "public-media" : "private-source";
      const expectedArgs = [
        "exec",
        "--offline",
        "--",
        "wrangler",
        "r2",
        "object",
        "put",
        `${bucket}/${upload.key}`,
        "--pipe",
        "--remote",
        "--content-type",
        upload.contentType,
      ];
      if (upload.cacheControl) {
        expectedArgs.push("--cache-control", upload.cacheControl);
      }
      assert.equal(call.command, "npm");
      assert.equal(call.options.cwd, fixture.cwd);
      assert.deepEqual(call.args, expectedArgs);
      assert.deepEqual(call.options.input, upload.bytes);
    }
  });

  it("stops on a failed immutable upload without retrying or verifying", async () => {
    const fixture = await createPublishFixture();
    let puts = 0;
    let originRequests = 0;
    await assert.rejects(
      wordGamePublisher.runWordGameMediaPublisher({
        args: ["--apply"],
        cacheBust: "fixture",
        cwd: fixture.cwd,
        env: applyEnvironment(),
        fetch: async () => {
          originRequests += 1;
          return new Response(null, { status: 404 });
        },
        runCommand: (_command, args) => {
          if (args.includes("get")) return missingObject();
          puts += 1;
          return puts === 3
            ? { status: 1, stderr: "upload failed", stdout: "" }
            : successfulCommand();
        },
        writeOutput: () => {},
      }),
      /upload failed.*do not retry|do not retry.*upload failed/i,
    );
    assert.equal(puts, 3);
    assert.equal(originRequests, 30);
  });

});
