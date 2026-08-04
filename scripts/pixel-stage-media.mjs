/* global URL */

import { createHash } from "node:crypto";

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

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function hasImmutableYearCache(cacheControl) {
  const maxAge = /(?:^|,)\s*max-age=(\d+)\s*(?:,|$)/i.exec(cacheControl);
  return (
    /(?:^|,)\s*immutable\s*(?:,|$)/i.test(cacheControl) &&
    Number(maxAge?.[1] ?? 0) >= 31_536_000
  );
}

function readPngDimensions(buffer) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    buffer.length < 24 ||
    !signature.every((byte, index) => buffer[index] === byte) ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new Error("is not a PNG with an IHDR header");
  }
  return {
    height: buffer.readUInt32BE(20),
    width: buffer.readUInt32BE(16),
  };
}

function parseCatalog(catalogValue) {
  const catalog = requireRecord(catalogValue, "catalog");
  if (catalog.schemaVersion !== 1) {
    throw new Error("catalog.schemaVersion must be 1");
  }
  const mediaRootText = requireText(catalog.mediaRoot, "catalog.mediaRoot");
  let mediaRoot;
  try {
    mediaRoot = new URL(mediaRootText);
  } catch {
    throw new Error("catalog.mediaRoot must be an absolute URL");
  }
  if (
    mediaRoot.protocol !== "https:" ||
    mediaRoot.origin !== "https://media.parrotbook.com" ||
    !/^\/prototypes\/pixel-stage\/v[1-9]\d*$/.test(mediaRoot.pathname) ||
    mediaRoot.search ||
    mediaRoot.hash
  ) {
    throw new Error(
      "catalog.mediaRoot must use a versioned media.parrotbook.com pixel-stage path",
    );
  }
  if (!Array.isArray(catalog.assets) || catalog.assets.length === 0) {
    throw new Error("catalog.assets must be a non-empty array");
  }

  const seenFilenames = new Set();
  const assets = catalog.assets.map((value, index) => {
    const asset = requireRecord(value, `catalog.assets[${index}]`);
    const filename = requireText(
      asset.filename,
      `catalog.assets[${index}].filename`,
    );
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.png$/.test(filename)) {
      throw new Error(`catalog.assets[${index}].filename must be a PNG filename`);
    }
    if (seenFilenames.has(filename)) {
      throw new Error(`${filename} is duplicated`);
    }
    seenFilenames.add(filename);
    const sha256 = requireText(
      asset.sha256,
      `catalog.assets[${index}].sha256`,
    ).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new Error(`catalog.assets[${index}].sha256 must be a SHA-256 hash`);
    }
    return {
      filename,
      height: requirePositiveInteger(
        asset.height,
        `catalog.assets[${index}].height`,
      ),
      sha256,
      width: requirePositiveInteger(
        asset.width,
        `catalog.assets[${index}].width`,
      ),
    };
  });

  return { assets, mediaRoot: mediaRoot.href.replace(/\/$/, "") };
}

export async function verifyPixelStageMedia(catalogValue, options = {}) {
  const { assets, mediaRoot } = parseCatalog(catalogValue);
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function") {
    throw new Error("fetch must be available");
  }

  const errors = [];
  const verified = [];
  await Promise.all(
    assets.map(async (asset) => {
      const src = `${mediaRoot}/${asset.filename}`;
      let response;
      try {
        response = await fetchImplementation(src);
      } catch (error) {
        errors.push(`${asset.filename} could not be requested: ${error.message}`);
        return;
      }
      if (!response.ok) {
        errors.push(`${asset.filename} returned HTTP ${response.status}`);
        return;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.split(";", 1)[0].trim().toLowerCase() !== "image/png") {
        errors.push(`${asset.filename} must return image/png`);
      }
      const cacheControl = response.headers.get("cache-control") ?? "";
      if (!hasImmutableYearCache(cacheControl)) {
        errors.push(
          `${asset.filename} must use immutable caching for at least one year`,
        );
      }
      if (response.headers.get("access-control-allow-origin") !== "*") {
        errors.push(`${asset.filename} must allow cross-origin loading`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      let dimensions;
      try {
        dimensions = readPngDimensions(buffer);
      } catch (error) {
        errors.push(`${asset.filename} ${error.message}`);
      }
      if (
        dimensions &&
        (dimensions.width !== asset.width || dimensions.height !== asset.height)
      ) {
        errors.push(
          `${asset.filename} must be ${asset.width}x${asset.height}; received ${dimensions.width}x${dimensions.height}`,
        );
      }
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      if (sha256 !== asset.sha256) {
        errors.push(`${asset.filename} does not match its catalog SHA-256`);
      }
      const declaredBytes = Number(response.headers.get("content-length"));
      if (declaredBytes !== buffer.length || buffer.length < 1) {
        errors.push(`${asset.filename} must return its exact positive content-length`);
      }

      if (
        contentType.split(";", 1)[0].trim().toLowerCase() === "image/png" &&
        hasImmutableYearCache(cacheControl) &&
        response.headers.get("access-control-allow-origin") === "*" &&
        dimensions?.width === asset.width &&
        dimensions.height === asset.height &&
        sha256 === asset.sha256 &&
        declaredBytes === buffer.length &&
        buffer.length > 0
      ) {
        verified.push({ bytes: buffer.length, filename: asset.filename, src });
      }
    }),
  );

  if (errors.length > 0) {
    throw new Error(
      `Pixel-stage media verification failed:\n${errors
        .sort()
        .map((error) => `- ${error}`)
        .join("\n")}`,
    );
  }

  return {
    verified: verified.sort((left, right) =>
      left.filename.localeCompare(right.filename),
    ),
  };
}
