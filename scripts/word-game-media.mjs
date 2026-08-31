/* global Buffer, URL, process */

import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const CACHE_CONTROL = "public, max-age=31536000, immutable";
const EXPECTED_ITEMS = Object.freeze({
  animals: ["cat", "dog", "bird", "fish", "duck", "frog"],
  "body-parts": ["eyes", "ears", "nose", "mouth", "hand", "foot"],
  food: ["apple", "banana", "carrot", "orange", "bread", "cheese"],
  toys: ["ball", "toy-car", "doll", "kite", "blocks", "teddy-bear"],
  feelings: ["happy", "sad", "angry", "sleepy", "surprised", "silly"],
});
const AUDIT_FIELDS = [
  "correctIsolatedSubject",
  "adequateMargin",
  "noAdjacentCellLeakage",
  "noAccidentalText",
];

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function requireSha256(value, label) {
  const text = requireText(value, label);
  if (!/^[a-f0-9]{64}$/.test(text)) {
    throw new Error(`${label} must be a lowercase SHA-256`);
  }
  return text;
}

function requireSafePath(value, label, prefix, extensionPattern) {
  const filename = requireText(value, label);
  if (
    filename.includes("\\") ||
    filename.startsWith("/") ||
    filename.split("/").includes("..") ||
    !filename.startsWith(prefix) ||
    !extensionPattern.test(filename.slice(prefix.length))
  ) {
    throw new Error(`${label} must be a safe path beneath ${prefix}`);
  }
  return filename;
}

function rectanglesOverlap(first, second) {
  return (
    first.left < second.left + second.width &&
    first.left + first.width > second.left &&
    first.top < second.top + second.height &&
    first.top + first.height > second.top
  );
}

function parseCrop(value, label, sheet) {
  const crop = requireRecord(value, label);
  const parsed = {};
  for (const field of ["left", "top", "width", "height"]) {
    if (!Number.isSafeInteger(crop[field])) {
      throw new Error(`${label}.${field} must be an integer`);
    }
    parsed[field] = crop[field];
  }
  if (
    parsed.left < 0 ||
    parsed.top < 0 ||
    parsed.width < 1 ||
    parsed.height < 1 ||
    parsed.left + parsed.width > sheet.width ||
    parsed.top + parsed.height > sheet.height
  ) {
    throw new Error(`${label} must stay inside the source sheet bounds`);
  }
  return parsed;
}

function parseSourceSheet(value, label) {
  const source = requireRecord(value, label);
  const ignoredPath = requireSafePath(
    source.ignoredPath,
    `${label}.ignoredPath`,
    "tmp/imagegen/word-games/v8/sheets/",
    /^[a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp)$/,
  );
  const format = requireText(source.format, `${label}.format`).toLowerCase();
  const expectedFormat = ignoredPath.endsWith(".jpg") || ignoredPath.endsWith(".jpeg")
    ? "jpeg"
    : ignoredPath.split(".").at(-1);
  if (format !== expectedFormat) {
    throw new Error(`${label}.format must match its source path`);
  }
  const width = requirePositiveInteger(source.width, `${label}.width`);
  const height = requirePositiveInteger(source.height, `${label}.height`);
  if (width !== 1536 || height !== 1024) {
    throw new Error(`${label} geometry must be 1536x1024`);
  }
  return {
    bytes: requirePositiveInteger(source.bytes, `${label}.bytes`),
    format,
    height,
    ignoredPath,
    sha256: requireSha256(source.sha256, `${label}.sha256`),
    width,
  };
}

function parseOutput(value, label) {
  const output = requireRecord(value, label);
  if (output.format !== "webp") throw new Error(`${label}.format must be webp`);
  if (output.width !== 512) throw new Error(`${label}.width must be 512`);
  if (output.height !== 512) throw new Error(`${label}.height must be 512`);
  return {
    bytes: requirePositiveInteger(output.bytes, `${label}.bytes`),
    format: "webp",
    height: 512,
    sha256: requireSha256(output.sha256, `${label}.sha256`),
    width: 512,
  };
}

function parseAudit(value, label) {
  const audit = requireRecord(value, label);
  if (
    Object.keys(audit).length !== AUDIT_FIELDS.length ||
    AUDIT_FIELDS.some((field) => audit[field] !== true)
  ) {
    throw new Error(`${label} must contain four accepted audit booleans`);
  }
  return Object.fromEntries(AUDIT_FIELDS.map((field) => [field, true]));
}

function validateManifestFrame(manifest) {
  if (manifest.schema !== "parrot-english.word-game-media") {
    throw new Error("manifest.schema must be parrot-english.word-game-media");
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error("manifest.schemaVersion must be 1");
  }
  if (manifest.mediaVersion !== 8) {
    throw new Error("manifest.mediaVersion must be 8");
  }
  const canvas = requireRecord(
    requireRecord(manifest.layout, "manifest.layout").canvas,
    "manifest.layout.canvas",
  );
  const cell = requireRecord(manifest.layout.cell, "manifest.layout.cell");
  if (
    canvas.width !== 1536 ||
    canvas.height !== 1024 ||
    manifest.layout.columns !== 3 ||
    manifest.layout.rows !== 2 ||
    cell.width !== 512 ||
    cell.height !== 512
  ) {
    throw new Error("manifest.layout must describe a 1536x1024 grid of six 512x512 cells");
  }
  const normalization = requireRecord(
    manifest.normalization,
    "manifest.normalization",
  );
  if (
    normalization.format !== "webp" ||
    normalization.width !== 512 ||
    normalization.height !== 512
  ) {
    throw new Error("manifest.normalization must be 512x512 WebP");
  }
}

export function createWordGameMediaPublishPlan(manifestValue) {
  const manifest = requireRecord(manifestValue, "manifest");
  validateManifestFrame(manifest);
  if (!Array.isArray(manifest.topics)) {
    throw new Error("manifest.topics must be an array");
  }
  const expectedTopics = Object.keys(EXPECTED_ITEMS);
  if (
    manifest.topics.length !== expectedTopics.length ||
    manifest.topics.some((topic, index) => topic?.id !== expectedTopics[index])
  ) {
    throw new Error("manifest topics must contain the exact five non-colors topics");
  }

  const topics = manifest.topics.map((topicValue, topicIndex) => {
    const topic = requireRecord(topicValue, `topics[${topicIndex}]`);
    const topicId = expectedTopics[topicIndex];
    const promptFile = requireSafePath(
      topic.promptFile,
      `topics[${topicIndex}].promptFile`,
      "content/media/prompts/word-games-v8/",
      /^[a-z0-9][a-z0-9-]*\.json$/,
    );
    if (promptFile !== `content/media/prompts/word-games-v8/${topicId}.json`) {
      throw new Error(`topics[${topicIndex}].promptFile must match its topic`);
    }
    const promptBytes = requirePositiveInteger(
      topic.promptBytes,
      `topics[${topicIndex}].promptBytes`,
    );
    const promptSha256 = requireSha256(
      topic.promptSha256,
      `topics[${topicIndex}].promptSha256`,
    );
    const sourceSheet = parseSourceSheet(
      topic.sourceSheet,
      `topics[${topicIndex}].sourceSheet`,
    );
    if (!Array.isArray(topic.items)) {
      throw new Error(`topics[${topicIndex}].items must be an array`);
    }
    const expectedItems = EXPECTED_ITEMS[topicId];
    if (
      topic.items.length !== expectedItems.length ||
      topic.items.some(
        (item, itemIndex) =>
          item?.topicId !== topicId || item?.itemId !== expectedItems[itemIndex],
      )
    ) {
      throw new Error(`${topicId} items must match the exact six-item inventory`);
    }
    const items = topic.items.map((itemValue, itemIndex) => {
      const label = `topics[${topicIndex}].items[${itemIndex}]`;
      const item = requireRecord(itemValue, label);
      const itemId = expectedItems[itemIndex];
      const ignoredOutputPath = requireSafePath(
        item.ignoredOutputPath,
        `${label}.ignoredOutputPath`,
        "tmp/imagegen/word-games/v8/cards/",
        /^[a-z0-9][a-z0-9/-]*\.webp$/,
      );
      const publicKey = requireText(item.publicKey, `${label}.publicKey`);
      return {
        audit: parseAudit(item.audit, `${label}.audit`),
        crop: parseCrop(item.crop, `${label}.crop`, sourceSheet),
        ignoredOutputPath,
        itemId,
        output: parseOutput(item.output, `${label}.output`),
        publicKey,
        topicId,
      };
    });
    for (let first = 0; first < items.length; first += 1) {
      for (let second = first + 1; second < items.length; second += 1) {
        if (rectanglesOverlap(items[first].crop, items[second].crop)) {
          throw new Error(`${topicId} crop rectangles must not overlap`);
        }
      }
    }
    return {
      id: topicId,
      items,
      promptBytes,
      promptFile,
      promptSha256,
      sourceSheet,
    };
  });

  const publicKeys = topics.flatMap(({ items }) =>
    items.map(({ publicKey }) => publicKey),
  );
  if (new Set(publicKeys).size !== publicKeys.length) {
    throw new Error("word-game public keys must be unique");
  }
  for (const topic of topics) {
    for (const item of topic.items) {
      const expected = `assets/v8/word-games/${topic.id}/${item.itemId}.webp`;
      if (item.publicKey !== expected) {
        throw new Error(`${item.topicId}/${item.itemId} public key must be ${expected}`);
      }
    }
  }

  const privateObjects = topics.flatMap((topic) => [
    {
      contentType: `image/${topic.sourceSheet.format}`,
      file: topic.sourceSheet.ignoredPath,
      key: `provenance/word-games/v8/${topic.id}/source.${topic.sourceSheet.format === "jpeg" ? "jpg" : topic.sourceSheet.format}`,
      kind: "source",
      topicId: topic.id,
    },
    {
      contentType: "application/json",
      file: topic.promptFile,
      key: `provenance/word-games/v8/${topic.id}/prompt.json`,
      kind: "prompt",
      topicId: topic.id,
    },
  ]);
  const publicOutputs = topics.flatMap((topic) =>
    topic.items.map((item) => ({
      bytesExpected: item.output.bytes,
      cacheControl: CACHE_CONTROL,
      contentType: "image/webp",
      file: item.ignoredOutputPath,
      height: 512,
      itemId: item.itemId,
      key: item.publicKey,
      sha256Expected: item.output.sha256,
      topicId: topic.id,
      width: 512,
    })),
  );

  return { mediaVersion: 8, privateObjects, publicOutputs, topics };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readContainedFile(cwd, filename, relativeRoot, realRoot) {
  const root = path.resolve(cwd, relativeRoot);
  const resolved = path.resolve(cwd, filename);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${filename} must resolve inside ${relativeRoot}`);
  }
  const realFile = await realpath(resolved);
  if (!realFile.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error(`${filename} must resolve inside ${relativeRoot}`);
  }
  return readFile(realFile);
}

async function imageMetadata(bytes, filename) {
  try {
    return await sharp(bytes, { failOn: "error" }).metadata();
  } catch {
    throw new Error(`${filename} could not be decoded by Sharp`);
  }
}

function checkBytes(bytes, expectedBytes, expectedSha256, filename) {
  if (bytes.length !== expectedBytes) {
    throw new Error(
      `${filename} bytes mismatch: expected ${expectedBytes}, received ${bytes.length}`,
    );
  }
  if (sha256(bytes) !== expectedSha256) {
    throw new Error(`${filename} SHA-256 mismatch`);
  }
}

export async function prepareWordGameMediaUploads(planValue, options = {}) {
  const plan = requireRecord(planValue, "plan");
  if (!Array.isArray(plan.topics) || plan.topics.length !== 5) {
    throw new Error("plan.topics must contain five topics");
  }
  if (!Array.isArray(plan.privateObjects) || plan.privateObjects.length !== 10) {
    throw new Error("plan.privateObjects must contain ten objects");
  }
  if (!Array.isArray(plan.publicOutputs) || plan.publicOutputs.length !== 30) {
    throw new Error("plan.publicOutputs must contain 30 objects");
  }
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const stagingRoot = "tmp/imagegen/word-games/v8";
  const promptRoot = "content/media/prompts/word-games-v8";
  const [realRepositoryRoot, realStagingRoot, realPromptRoot] = await Promise.all([
    realpath(cwd),
    realpath(path.resolve(cwd, stagingRoot)),
    realpath(path.resolve(cwd, promptRoot)),
  ]);
  for (const [label, root] of [
    [stagingRoot, realStagingRoot],
    [promptRoot, realPromptRoot],
  ]) {
    if (!root.startsWith(`${realRepositoryRoot}${path.sep}`)) {
      throw new Error(`${label} root must resolve inside the repository root`);
    }
  }
  const topicBytes = new Map();

  await Promise.all(
    plan.topics.map(async (topic) => {
      const [sourceBytes, promptBytes] = await Promise.all([
        readContainedFile(
          cwd,
          topic.sourceSheet.ignoredPath,
          stagingRoot,
          realStagingRoot,
        ),
        readContainedFile(cwd, topic.promptFile, promptRoot, realPromptRoot),
      ]);
      checkBytes(
        sourceBytes,
        topic.sourceSheet.bytes,
        topic.sourceSheet.sha256,
        topic.sourceSheet.ignoredPath,
      );
      checkBytes(
        promptBytes,
        topic.promptBytes,
        topic.promptSha256,
        topic.promptFile,
      );
      const sourceMetadata = await imageMetadata(
        sourceBytes,
        topic.sourceSheet.ignoredPath,
      );
      if (
        sourceMetadata.format !== topic.sourceSheet.format ||
        sourceMetadata.width !== topic.sourceSheet.width ||
        sourceMetadata.height !== topic.sourceSheet.height
      ) {
        throw new Error(
          `${topic.sourceSheet.ignoredPath} must decode as ${topic.sourceSheet.format} at 1536x1024 dimensions`,
        );
      }
      let prompt;
      try {
        prompt = JSON.parse(promptBytes.toString("utf8"));
      } catch {
        throw new Error(`${topic.promptFile} must contain valid JSON`);
      }
      requireRecord(prompt, topic.promptFile);
      if (
        prompt.schemaVersion !== 1 ||
        prompt.topic !== topic.id ||
        prompt.generationMode !== "built-in-imagegen" ||
        typeof prompt.prompt !== "string" ||
        !prompt.prompt.trim()
      ) {
        throw new Error(`${topic.promptFile} prompt provenance must match topic ${topic.id}`);
      }
      topicBytes.set(topic.id, { promptBytes, sourceBytes });
    }),
  );

  const publicUploads = await Promise.all(
    plan.publicOutputs.map(async (output) => {
      const bytes = await readContainedFile(
        cwd,
        output.file,
        stagingRoot,
        realStagingRoot,
      );
      checkBytes(
        bytes,
        output.bytesExpected,
        output.sha256Expected,
        output.file,
      );
      const metadata = await imageMetadata(bytes, output.file);
      if (
        metadata.format !== "webp" ||
        metadata.width !== output.width ||
        metadata.height !== output.height
      ) {
        throw new Error(`${output.file} must decode as WebP at 512x512 dimensions`);
      }
      return {
        ...output,
        bytes,
        scope: "public",
        sha256: sha256(bytes),
      };
    }),
  );
  const privateUploads = plan.privateObjects.map((object) => {
    const bytesByKind = topicBytes.get(object.topicId);
    const bytes = object.kind === "source"
      ? bytesByKind.sourceBytes
      : bytesByKind.promptBytes;
    return {
      ...object,
      bytes,
      scope: "private",
      sha256: sha256(bytes),
    };
  });

  return {
    privateUploads,
    publicOutputs: publicUploads,
    uploads: [...privateUploads, ...publicUploads],
  };
}

function normalizeMediaOrigin(value) {
  const text = requireText(value, "mediaOrigin");
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("mediaOrigin must be an absolute URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("mediaOrigin must contain only an https origin");
  }
  return url.origin;
}

export async function verifyWordGameMediaDelivery(preparedValue, options = {}) {
  const prepared = requireRecord(preparedValue, "prepared");
  if (!Array.isArray(prepared.publicOutputs) || prepared.publicOutputs.length < 1) {
    throw new Error("prepared.publicOutputs must be a non-empty array");
  }
  const mediaOrigin = normalizeMediaOrigin(options.mediaOrigin);
  const cacheBust = requireText(options.cacheBust, "cacheBust");
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function") {
    throw new Error("fetch must be available");
  }
  const errors = [];
  const verified = [];

  await Promise.all(
    prepared.publicOutputs.map(async (output) => {
      const url = new URL(`${mediaOrigin}/${output.key}`);
      url.searchParams.set(
        "parrot-word-game-media-check",
        `verify-${cacheBust}`,
      );
      let response;
      try {
        response = await fetchImplementation(url.href, {
          cache: "no-store",
          method: "GET",
          redirect: "error",
        });
      } catch (error) {
        errors.push(`${output.key} could not be requested: ${error.message}`);
        return;
      }
      if (response.status !== 200) {
        errors.push(`${output.key} returned HTTP ${response.status}`);
        return;
      }
      const contentType = (response.headers.get("content-type") ?? "")
        .trim()
        .toLowerCase();
      const cacheControl = (response.headers.get("cache-control") ?? "").trim();
      const contentLength = Number(response.headers.get("content-length"));
      if (contentType !== "image/webp") {
        errors.push(`${output.key} must return exact image/webp`);
      }
      if (cacheControl !== CACHE_CONTROL) {
        errors.push(`${output.key} must return the exact immutable cache policy`);
      }
      if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
        errors.push(`${output.key} must return a positive content-length`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (sha256(bytes) !== output.sha256) {
        errors.push(`${output.key} SHA-256 mismatch`);
      }
      let metadata;
      try {
        metadata = await sharp(bytes, { failOn: "error" }).metadata();
        await sharp(bytes, { failOn: "error" }).raw().toBuffer();
      } catch {
        errors.push(`${output.key} must decode as WebP`);
        return;
      }
      if (metadata.format !== "webp") {
        errors.push(`${output.key} must decode as WebP`);
      }
      if (metadata.width !== 512 || metadata.height !== 512) {
        errors.push(
          `${output.key} must be 512x512; received ${metadata.width}x${metadata.height}`,
        );
      }
      if (
        contentType === "image/webp" &&
        cacheControl === CACHE_CONTROL &&
        Number.isSafeInteger(contentLength) &&
        contentLength > 0 &&
        sha256(bytes) === output.sha256 &&
        metadata.format === "webp" &&
        metadata.width === 512 &&
        metadata.height === 512
      ) {
        verified.push(output.key);
      }
    }),
  );

  if (errors.length > 0) {
    throw new Error(
      `Word-game media delivery verification failed:\n${errors
        .sort()
        .map((error) => `- ${error}`)
        .join("\n")}`,
    );
  }
  return { verified: verified.sort() };
}
