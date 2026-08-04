/* global URL, process */

import { readFile } from "node:fs/promises";
import path from "node:path";

const CACHE_CONTROL = "public, max-age=31536000, immutable";
const EXPECTED_HEIGHT = 1152;
const EXPECTED_WIDTH = 2048;
const STAGING_ROOT = "tmp/imagegen/backgrounds";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeMediaOrigin(value) {
  const text = requireText(value, "mediaOrigin");
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("mediaOrigin must be an absolute URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("mediaOrigin must use https");
  }
  if (
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

function requireStagedPath(value, label, extensions) {
  const text = requireText(value, label);
  if (text.includes("\\") || path.posix.isAbsolute(text)) {
    throw new Error(`${label} must be inside ${STAGING_ROOT}`);
  }
  const normalized = path.posix.normalize(text);
  if (!normalized.startsWith(`${STAGING_ROOT}/`)) {
    throw new Error(`${label} must be inside ${STAGING_ROOT}`);
  }
  if (!extensions.includes(path.posix.extname(normalized).toLowerCase())) {
    throw new Error(`${label} must use ${extensions.join(" or ")}`);
  }
  return normalized;
}

function sourceContentType(filename) {
  return path.posix.extname(filename).toLowerCase() === ".png"
    ? "image/png"
    : "image/webp";
}

function parseAsset(value, index) {
  const asset = requireRecord(value, `assets[${index}]`);
  const id = requireText(asset.id, `assets[${index}].id`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`assets[${index}].id must be lowercase kebab-case`);
  }
  if (!Number.isInteger(asset.version) || asset.version < 1) {
    throw new Error(`assets[${index}].version must be a positive integer`);
  }

  return {
    alt: requireText(asset.alt, `assets[${index}].alt`),
    finalFile: requireStagedPath(
      asset.finalFile,
      `assets[${index}].finalFile`,
      [".webp"],
    ),
    id,
    promptFile: requireStagedPath(
      asset.promptFile,
      `assets[${index}].promptFile`,
      [".json"],
    ),
    sourceFile: requireStagedPath(
      asset.sourceFile,
      `assets[${index}].sourceFile`,
      [".png", ".webp"],
    ),
    version: asset.version,
  };
}

export function createBackgroundPublishPlan(manifestValue, optionsValue) {
  const manifest = requireRecord(manifestValue, "manifest");
  const options = requireRecord(optionsValue, "options");
  if (manifest.schemaVersion !== 1) {
    throw new Error("manifest.schemaVersion must be 1");
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    throw new Error("manifest.assets must be a non-empty array");
  }

  const mediaOrigin = normalizeMediaOrigin(options.mediaOrigin);
  const publicBucket = requireText(options.publicBucket, "publicBucket");
  const sourceBucket = requireText(options.sourceBucket, "sourceBucket");
  const assets = manifest.assets.map(parseAsset);
  if (new Set(assets.map(({ id }) => id)).size !== assets.length) {
    throw new Error("asset IDs must be unique within a publish manifest");
  }

  const catalogEntries = [];
  const uploads = [];
  for (const asset of assets) {
    const prefix = `backgrounds/${asset.id}/v${asset.version}`;
    const publicKey = `${prefix}/landscape.webp`;
    const sourceExtension = path.posix.extname(asset.sourceFile).toLowerCase();
    catalogEntries.push({
      alt: asset.alt,
      id: asset.id,
      src: `${mediaOrigin}/${publicKey}`,
    });
    uploads.push(
      {
        assetId: asset.id,
        bucket: sourceBucket,
        contentType: sourceContentType(asset.sourceFile),
        file: asset.sourceFile,
        key: `${prefix}/original${sourceExtension}`,
      },
      {
        assetId: asset.id,
        bucket: sourceBucket,
        contentType: "application/json",
        file: asset.promptFile,
        key: `${prefix}/prompt.json`,
      },
      {
        assetId: asset.id,
        bucket: publicBucket,
        cacheControl: CACHE_CONTROL,
        contentType: "image/webp",
        file: asset.finalFile,
        key: publicKey,
      },
    );
  }

  return {
    assets,
    catalogEntries,
    mediaOrigin,
    publicBucket,
    sourceBucket,
    uploads,
  };
}

function readWebpDimensions(buffer) {
  if (
    buffer.length < 20 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw new Error("is not a valid WebP file");
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (data + size > buffer.length) break;

    if (type === "VP8X" && size >= 10) {
      return {
        height: buffer.readUIntLE(data + 7, 3) + 1,
        width: buffer.readUIntLE(data + 4, 3) + 1,
      };
    }
    if (
      type === "VP8 " &&
      size >= 10 &&
      buffer[data + 3] === 0x9d &&
      buffer[data + 4] === 0x01 &&
      buffer[data + 5] === 0x2a
    ) {
      return {
        height: buffer.readUInt16LE(data + 8) & 0x3fff,
        width: buffer.readUInt16LE(data + 6) & 0x3fff,
      };
    }
    if (type === "VP8L" && size >= 5 && buffer[data] === 0x2f) {
      const bits = buffer.readUInt32LE(data + 1);
      return {
        height: ((bits >> 14) & 0x3fff) + 1,
        width: (bits & 0x3fff) + 1,
      };
    }

    offset = data + size + (size % 2);
  }

  throw new Error("does not contain a supported WebP image chunk");
}

function resolveStagedFile(cwd, filename) {
  const root = path.resolve(cwd, STAGING_ROOT);
  const resolved = path.resolve(cwd, filename);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${filename} must resolve inside ${STAGING_ROOT}`);
  }
  return resolved;
}

export async function inspectBackgroundPublishFiles(planValue, options = {}) {
  const plan = requireRecord(planValue, "plan");
  const cwd = path.resolve(options.cwd ?? process.cwd());
  if (!Array.isArray(plan.assets)) throw new Error("plan.assets must be an array");

  return Promise.all(
    plan.assets.map(async (asset) => {
      const [finalBuffer, sourceBuffer, promptBuffer] = await Promise.all([
        readFile(resolveStagedFile(cwd, asset.finalFile)),
        readFile(resolveStagedFile(cwd, asset.sourceFile)),
        readFile(resolveStagedFile(cwd, asset.promptFile)),
      ]);
      if (sourceBuffer.length === 0) {
        throw new Error(`${asset.sourceFile} must not be empty`);
      }

      let prompt;
      try {
        prompt = JSON.parse(promptBuffer.toString("utf8"));
      } catch {
        throw new Error(`${asset.promptFile} must contain valid JSON`);
      }
      requireRecord(prompt, asset.promptFile);
      requireText(prompt.prompt, `${asset.promptFile}.prompt`);

      let dimensions;
      try {
        dimensions = readWebpDimensions(finalBuffer);
      } catch (error) {
        throw new Error(`${asset.finalFile} ${error.message}`);
      }
      if (
        dimensions.width !== EXPECTED_WIDTH ||
        dimensions.height !== EXPECTED_HEIGHT
      ) {
        throw new Error(
          `${asset.finalFile} must be ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}; received ${dimensions.width}x${dimensions.height}`,
        );
      }

      return {
        height: dimensions.height,
        id: asset.id,
        version: asset.version,
        width: dimensions.width,
      };
    }),
  );
}

function hasImmutableYearCache(cacheControl) {
  const maxAge = /(?:^|,)\s*max-age=(\d+)\s*(?:,|$)/i.exec(cacheControl);
  return (
    /(?:^|,)\s*immutable\s*(?:,|$)/i.test(cacheControl) &&
    Number(maxAge?.[1] ?? 0) >= 31_536_000
  );
}

export async function verifyBackgroundCatalogMedia(
  backgroundsValue,
  options = {},
) {
  if (!Array.isArray(backgroundsValue)) {
    throw new Error("backgrounds must be an array");
  }
  const mediaOrigin = normalizeMediaOrigin(options.mediaOrigin);
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function") {
    throw new Error("fetch must be available");
  }

  const skipped = [];
  const errors = [];
  const remote = [];
  const seenIds = new Set();
  for (const [index, value] of backgroundsValue.entries()) {
    const background = requireRecord(value, `backgrounds[${index}]`);
    const id = requireText(background.id, `backgrounds[${index}].id`);
    const src = requireText(background.src, `backgrounds[${index}].src`);
    if (seenIds.has(id)) errors.push(`${id} is duplicated`);
    seenIds.add(id);
    if (src.startsWith("/")) {
      skipped.push(id);
      continue;
    }

    let url;
    try {
      url = new URL(src);
    } catch {
      errors.push(`${id} has an invalid media URL`);
      continue;
    }
    if (url.origin !== mediaOrigin) {
      errors.push(`${id} must use media origin ${mediaOrigin}`);
      continue;
    }
    if (!/^\/backgrounds\/[a-z0-9-]+\/v[1-9]\d*\/landscape\.webp$/.test(url.pathname)) {
      errors.push(`${id} must use a versioned background media path`);
      continue;
    }
    remote.push({ id, src });
  }

  const verified = [];
  await Promise.all(
    remote.map(async ({ id, src }) => {
      let response;
      try {
        response = await fetchImplementation(src, { method: "HEAD" });
      } catch (error) {
        errors.push(`${id} could not be requested: ${error.message}`);
        return;
      }
      if (!response.ok) {
        errors.push(`${id} returned HTTP ${response.status}`);
        return;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.split(";", 1)[0].trim().toLowerCase() !== "image/webp") {
        errors.push(`${id} must return image/webp`);
      }
      const cacheControl = response.headers.get("cache-control") ?? "";
      if (!hasImmutableYearCache(cacheControl)) {
        errors.push(`${id} must use immutable caching for at least one year`);
      }
      const bytes = Number(response.headers.get("content-length"));
      if (!Number.isSafeInteger(bytes) || bytes < 1) {
        errors.push(`${id} must return a positive content-length`);
      }
      if (
        contentType.split(";", 1)[0].trim().toLowerCase() === "image/webp" &&
        hasImmutableYearCache(cacheControl) &&
        Number.isSafeInteger(bytes) &&
        bytes > 0
      ) {
        verified.push({ bytes, id, src });
      }
    }),
  );

  if (errors.length > 0) {
    throw new Error(
      `Background media verification failed:\n${errors
        .sort()
        .map((error) => `- ${error}`)
        .join("\n")}`,
    );
  }

  return {
    skipped: skipped.sort(),
    verified: verified.sort((left, right) => left.id.localeCompare(right.id)),
  };
}
