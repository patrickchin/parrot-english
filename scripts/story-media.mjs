/* global Buffer, URL, process */

import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const CACHE_CONTROL = "public, max-age=31536000, immutable";
const COVER_WIDTHS = [1536, 768, 384];
const LONG_STORY_PAGE_IDS = new Map([
  [
    "the-gruffalo",
    Array.from(
      { length: 12 },
      (_, index) => `page-${String(index + 1).padStart(3, "0")}`,
    ),
  ],
  [
    "we-re-going-on-a-bear-hunt",
    Array.from(
      { length: 5 },
      (_, index) => `page-${String(index + 1).padStart(3, "0")}`,
    ),
  ],
]);
const FIRST_ENGLISH_WORD_PAGE_IDS = new Map([
  [
    "hello-cat",
    ["cat-hello", "dog-hello", "bird-hello", "friends-hello", "friends-bye"],
  ],
  ["marys-face", ["face", "eyes", "ears", "nose", "mouth"]],
  [
    "wash-sam-wash",
    [
      "dirty-hands",
      "water-on-hands",
      "soap-on-hands",
      "wash-hands",
      "clean-hands",
    ],
  ],
]);
const LEARNER_STORY_PAGE_IDS = new Map([
  [
    "boots-in-the-rain",
    ["rain-falls", "wet-feet", "boots-on", "coat-on", "stay-dry", "warm-home"],
  ],
  [
    "big-box-small-box",
    [
      "bo-big-box",
      "pia-small-box",
      "bo-does-not-fit",
      "pia-box-too-big",
      "big-for-bo",
      "small-for-pia",
    ],
  ],
  [
    "lina-goes-to-sleep",
    [
      "it-is-night",
      "one-star",
      "moon-up",
      "light-off",
      "eyes-shut",
      "sleep-well",
    ],
  ],
  [
    "seed-wake-up",
    [
      "seed-sleeps",
      "seed-water",
      "seed-sun",
      "seed-starts-growing",
      "seed-grows",
      "hello-flower",
    ],
  ],
  [
    "a-snack-for-two",
    [
      "two-crackers",
      "bo-hungry",
      "cracker-please",
      "we-can-share",
      "one-for-each",
      "thank-you",
    ],
  ],
  [
    "the-lantern-trail",
    [
      "pip-sees-light",
      "flicker-is-lost",
      "pip-can-help",
      "walk-by-water",
      "family-lights",
      "flicker-home",
    ],
  ],
  [
    "the-noisy-little-band",
    ["bo-drum", "mia-bell", "tomo-shaker", "too-loud", "play-quiet", "band-sings"],
  ],
  [
    "robo-tries",
    [
      "robo-walks",
      "robo-jumps",
      "robo-runs",
      "robo-tries-flying",
      "robo-tries-swimming",
      "robo-can-try",
    ],
  ],
  [
    "tess-can-help",
    ["cart-broken", "can-i-help", "find-wheel", "put-wheel-on", "fix-cart", "cart-rolls"],
  ],
  [
    "ready-maya-ready",
    [
      "maya-wakes",
      "maya-washes",
      "maya-dresses",
      "maya-eats",
      "maya-brushes",
      "maya-ready",
    ],
  ],
  [
    "kite-come-back",
    [
      "kite-flies",
      "wind-pulls",
      "kite-stuck",
      "ana-pulls",
      "ask-dad",
      "kite-free",
      "fly-together",
    ],
  ],
  [
    "the-picnic-blanket-search",
    [
      "blanket-missing",
      "little-hill",
      "low-branch",
      "little-bridge",
      "short-tunnel",
      "blanket-inside",
      "picnic-time",
    ],
  ],
  [
    "soup-for-five",
    [
      "make-soup",
      "carrots-in",
      "peas-in",
      "corn-in",
      "mix-round",
      "taste-soup",
      "bowl-each",
    ],
  ],
  [
    "wally-finds-the-way",
    [
      "which-way-home",
      "swim-straight",
      "turn-left",
      "turn-right",
      "home-is-near",
      "red-rock",
      "wally-home",
    ],
  ],
  [
    "the-moon-bus",
    [
      "bus-to-moon",
      "leo-ticket",
      "rabbit-seats",
      "three-stars",
      "moon-bounce",
      "blue-earth",
      "bus-home",
    ],
  ],
]);
const COLLECTIONS = new Map([
  [
    "long-stories",
    {
      inventoryError:
        "manifest.assets must contain exactly two covers and seventeen original scene images",
      pageIdsByStory: LONG_STORY_PAGE_IDS,
      pageIdPattern: /^page-\d{3}$/,
      pageIdRequirement: "must use page-NNN",
      supportsCovers: true,
    },
  ],
  [
    "learner-story-pages",
    {
      inventoryError:
        "manifest.assets must contain exactly ninety-five learner story page images",
      pageIdsByStory: LEARNER_STORY_PAGE_IDS,
      pageIdPattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      pageIdRequirement: "must use a lowercase slug",
      supportsCovers: false,
    },
  ],
  [
    "first-english-words",
    {
      inventoryError:
        "manifest.assets must contain exactly three covers and fifteen first English word page images",
      pageIdsByStory: FIRST_ENGLISH_WORD_PAGE_IDS,
      pageIdPattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      pageIdRequirement: "must use a lowercase slug",
      supportsCovers: true,
    },
  ],
]);

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

function requireStagedFile(value, label, version, extensions) {
  const filename = requireText(value, label);
  const stagingRoot = `tmp/imagegen/story-media/v${version}`;
  if (filename.includes("\\") || path.posix.isAbsolute(filename)) {
    throw new Error(`${label} must be inside ${stagingRoot}`);
  }
  const normalized = path.posix.normalize(filename);
  if (!normalized.startsWith(`${stagingRoot}/`)) {
    throw new Error(`${label} must be inside ${stagingRoot}`);
  }
  if (!extensions.includes(path.posix.extname(normalized).toLowerCase())) {
    throw new Error(`${label} must use ${extensions.join(" or ")}`);
  }
  return normalized;
}

function parseAsset(value, index, version, collection) {
  const asset = requireRecord(value, `assets[${index}]`);
  const storyId = requireText(asset.storyId, `assets[${index}].storyId`);
  if (!collection.pageIdsByStory.has(storyId)) {
    throw new Error(`assets[${index}].storyId is not supported by this collection`);
  }
  if (!["cover", "page"].includes(asset.kind)) {
    throw new Error(`assets[${index}].kind must be cover or page`);
  }
  if (asset.kind === "cover" && !collection.supportsCovers) {
    throw new Error(`assets[${index}].kind must be page for this collection`);
  }
  let pageId;
  if (asset.kind === "page") {
    pageId = requireText(asset.pageId, `assets[${index}].pageId`);
    if (!collection.pageIdPattern.test(pageId)) {
      throw new Error(
        `assets[${index}].pageId ${collection.pageIdRequirement}`,
      );
    }
  } else if (asset.pageId !== undefined) {
    throw new Error(`assets[${index}].pageId is only valid for page assets`);
  }
  const assetName = pageId ?? "cover";
  const assetId = `${storyId}/${assetName}`;
  return {
    assetId,
    kind: asset.kind,
    pageId,
    promptFile: requireStagedFile(
      asset.promptFile,
      `assets[${index}].promptFile`,
      version,
      [".json"],
    ),
    sourceFile: requireStagedFile(
      asset.sourceFile,
      `assets[${index}].sourceFile`,
      version,
      [".png", ".webp"],
    ),
    storyId,
  };
}

function expectedAssetIds(collection) {
  return [...collection.pageIdsByStory].flatMap(([storyId, pageIds]) => [
    ...(collection.supportsCovers ? [`${storyId}/cover`] : []),
    ...pageIds.map((pageId) => `${storyId}/${pageId}`),
  ]);
}

function validateInventory(assets, collection) {
  const actualIds = assets.map(({ assetId }) => assetId);
  const expectedIds = expectedAssetIds(collection);
  if (
    actualIds.length !== expectedIds.length ||
    new Set(actualIds).size !== actualIds.length ||
    expectedIds.some((id) => !actualIds.includes(id))
  ) {
    throw new Error(collection.inventoryError);
  }
}

function sourceContentType(filename) {
  return filename.endsWith(".png") ? "image/png" : "image/webp";
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

export function createStoryMediaPublishPlan(manifestValue) {
  const manifest = requireRecord(manifestValue, "manifest");
  if (manifest.schemaVersion !== 1) {
    throw new Error("manifest.schemaVersion must be 1");
  }
  if (!Number.isSafeInteger(manifest.version) || manifest.version < 1) {
    throw new Error("manifest.version must be a positive integer");
  }
  if (!Array.isArray(manifest.assets)) {
    throw new Error("manifest.assets must be an array");
  }
  const collectionName = manifest.collection === undefined
    ? "long-stories"
    : requireText(manifest.collection, "manifest.collection");
  const collection = COLLECTIONS.get(collectionName);
  if (!collection) throw new Error("manifest.collection is not supported");

  const assets = manifest.assets.map((asset, index) =>
    parseAsset(asset, index, manifest.version, collection),
  );
  validateInventory(assets, collection);
  if (new Set(assets.map(({ sourceFile }) => sourceFile)).size !== assets.length) {
    throw new Error("story media source files must be unique");
  }
  if (new Set(assets.map(({ promptFile }) => promptFile)).size !== assets.length) {
    throw new Error("story media prompt files must be unique");
  }

  const privateObjects = assets.flatMap((asset) => {
    const prefix = `story-media/${asset.storyId}/v${manifest.version}/${asset.pageId ?? "cover"}`;
    const sourceExtension = path.posix.extname(asset.sourceFile).toLowerCase();
    return [
      {
        assetId: asset.assetId,
        contentType: sourceContentType(asset.sourceFile),
        file: asset.sourceFile,
        key: `${prefix}/original${sourceExtension}`,
      },
      {
        assetId: asset.assetId,
        contentType: "application/json",
        file: asset.promptFile,
        key: `${prefix}/prompt.json`,
      },
    ];
  });
  const publicOutputs = assets.flatMap((asset) => {
    if (asset.kind === "page") {
      return [{
        assetId: asset.assetId,
        contentType: "image/webp",
        height: 512,
        key: `assets/v${manifest.version}/story-pages/${asset.storyId}-${asset.pageId}.webp`,
        width: 768,
      }];
    }
    return COVER_WIDTHS.map((width) => ({
      assetId: asset.assetId,
      contentType: "image/webp",
      height: (width * 2) / 3,
      key: `assets/v${manifest.version}/stories/${asset.storyId}-cover${width === 1536 ? "" : `-${width}`}.webp`,
      width,
    }));
  });

  return {
    assets,
    collection: collectionName,
    privateObjects,
    publicOutputs,
    version: manifest.version,
  };
}

function resolveStagedFile(cwd, filename, version) {
  const stagingRoot = path.resolve(cwd, `tmp/imagegen/story-media/v${version}`);
  const resolved = path.resolve(cwd, filename);
  if (!resolved.startsWith(`${stagingRoot}${path.sep}`)) {
    throw new Error(
      `${filename} must resolve inside tmp/imagegen/story-media/v${version}`,
    );
  }
  return resolved;
}

async function readStagedFile(cwd, filename, version, realStagingRoot) {
  const resolved = resolveStagedFile(cwd, filename, version);
  const realFile = await realpath(resolved);
  if (!realFile.startsWith(`${realStagingRoot}${path.sep}`)) {
    throw new Error(
      `${filename} must resolve inside tmp/imagegen/story-media/v${version}`,
    );
  }
  return readFile(realFile);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function prepareStoryMediaUploads(planValue, options = {}) {
  const plan = requireRecord(planValue, "plan");
  if (!Array.isArray(plan.assets)) throw new Error("plan.assets must be an array");
  if (!Array.isArray(plan.privateObjects)) {
    throw new Error("plan.privateObjects must be an array");
  }
  if (!Array.isArray(plan.publicOutputs)) {
    throw new Error("plan.publicOutputs must be an array");
  }
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const realStagingRoot = await realpath(
    path.resolve(cwd, `tmp/imagegen/story-media/v${plan.version}`),
  );
  const preparedAssets = new Map();

  await Promise.all(
    plan.assets.map(async (asset) => {
      const [sourceBytes, promptBytes] = await Promise.all([
        readStagedFile(
          cwd,
          asset.sourceFile,
          plan.version,
          realStagingRoot,
        ),
        readStagedFile(
          cwd,
          asset.promptFile,
          plan.version,
          realStagingRoot,
        ),
      ]);
      let metadata;
      try {
        metadata = await sharp(sourceBytes, { failOn: "error" }).metadata();
      } catch {
        throw new Error(`${asset.sourceFile} could not be decoded by Sharp`);
      }
      const expectedFormat = asset.sourceFile.endsWith(".png") ? "png" : "webp";
      if (metadata.format !== expectedFormat) {
        throw new Error(`${asset.sourceFile} extension must match its decoded format`);
      }
      if (!metadata.width || !metadata.height) {
        throw new Error(`${asset.sourceFile} must have image dimensions`);
      }
      if (metadata.width * 2 !== metadata.height * 3) {
        throw new Error(`${asset.sourceFile} must use a 3:2 aspect ratio`);
      }
      if (metadata.width < 1536 || metadata.height < 1024) {
        throw new Error(
          `${asset.sourceFile} must be at least 1536x1024; received ${metadata.width}x${metadata.height}`,
        );
      }

      let prompt;
      try {
        prompt = JSON.parse(promptBytes.toString("utf8"));
      } catch {
        throw new Error(`${asset.promptFile} must contain valid JSON`);
      }
      requireRecord(prompt, asset.promptFile);
      requireText(prompt.prompt, `${asset.promptFile}.prompt`);
      preparedAssets.set(asset.assetId, { promptBytes, sourceBytes });
    }),
  );

  const privateUploads = plan.privateObjects.map((object) => {
    const asset = preparedAssets.get(object.assetId);
    const bytes = object.contentType === "application/json"
      ? asset.promptBytes
      : asset.sourceBytes;
    return {
      ...object,
      bytes,
      scope: "private",
      sha256: sha256(bytes),
    };
  });
  const publicUploads = await Promise.all(
    plan.publicOutputs.map(async (output) => {
      const { sourceBytes } = preparedAssets.get(output.assetId);
      const bytes = await sharp(sourceBytes, { failOn: "error" })
        .resize(output.width, output.height, { fit: "fill" })
        .webp({ quality: 90 })
        .toBuffer();
      return {
        ...output,
        bytes,
        cacheControl: CACHE_CONTROL,
        scope: "public",
        sha256: sha256(bytes),
      };
    }),
  );

  return {
    assets: plan.assets,
    collection: plan.collection,
    publicOutputs: publicUploads,
    uploads: [...privateUploads, ...publicUploads],
    version: plan.version,
  };
}

function hasStrictImmutableCache(value) {
  const directives = value
    .split(",")
    .map((directive) => directive.trim().toLowerCase())
    .filter(Boolean);
  const maxAges = directives.flatMap((directive) => {
    const match = /^max-age\s*=\s*"?(\d+)"?$/.exec(directive);
    return match ? [Number(match[1])] : [];
  });
  return (
    directives.length === 3 &&
    directives.filter((directive) => directive === "public").length === 1 &&
    directives.filter((directive) => directive === "immutable").length === 1 &&
    maxAges.length === 1 &&
    maxAges[0] >= 31_536_000 &&
    !directives.some((directive) =>
      ["private", "no-cache", "no-store"].includes(
        directive.split("=", 1)[0],
      ),
    )
  );
}

function publicUrl(mediaOrigin, key) {
  return `${mediaOrigin}/${key}`;
}

function createMappings(prepared, mediaOrigin) {
  const storyIds = [...new Set(prepared.assets.map(({ storyId }) => storyId))];
  return storyIds.map((storyId) => {
    const cover = prepared.publicOutputs.find(
      (output) =>
        output.assetId === `${storyId}/cover` && output.width === 1536,
    );
    const pageSrcById = Object.fromEntries(
      prepared.assets
        .filter((asset) => asset.storyId === storyId && asset.kind === "page")
        .map((asset) => {
          const output = prepared.publicOutputs.find(
            (candidate) => candidate.assetId === asset.assetId,
          );
          return [asset.pageId, publicUrl(mediaOrigin, output.key)];
        }),
    );
    return {
      ...(cover ? { coverSrc: publicUrl(mediaOrigin, cover.key) } : {}),
      pageSrcById,
      storyId,
    };
  });
}

export async function verifyStoryMediaDelivery(preparedValue, options = {}) {
  const prepared = requireRecord(preparedValue, "prepared");
  if (!Array.isArray(prepared.assets)) {
    throw new Error("prepared.assets must be an array");
  }
  if (!Array.isArray(prepared.publicOutputs)) {
    throw new Error("prepared.publicOutputs must be an array");
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
      const url = new URL(publicUrl(mediaOrigin, output.key));
      url.searchParams.set(
        "parrot-story-media-check",
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
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (contentType !== "image/webp") {
        errors.push(`${output.key} must return image/webp`);
      }
      if (
        !hasStrictImmutableCache(response.headers.get("cache-control") ?? "")
      ) {
        errors.push(`${output.key} must use strict public immutable caching`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (sha256(bytes) !== output.sha256) {
        errors.push(`${output.key} SHA-256 mismatch`);
      }
      let metadata;
      try {
        metadata = await sharp(bytes, { failOn: "error" }).metadata();
      } catch {
        errors.push(`${output.key} must decode as WebP`);
        return;
      }
      if (metadata.format !== "webp") {
        errors.push(`${output.key} must decode as WebP`);
      }
      if (metadata.width !== output.width || metadata.height !== output.height) {
        errors.push(
          `${output.key} must be ${output.width}x${output.height}; received ${metadata.width}x${metadata.height}`,
        );
      }
      if (
        contentType === "image/webp" &&
        hasStrictImmutableCache(response.headers.get("cache-control") ?? "") &&
        sha256(bytes) === output.sha256 &&
        metadata.format === "webp" &&
        metadata.width === output.width &&
        metadata.height === output.height
      ) {
        verified.push(output.key);
      }
    }),
  );

  if (errors.length > 0) {
    throw new Error(
      `Story media verification failed:\n${errors
        .sort()
        .map((error) => `- ${error}`)
        .join("\n")}`,
    );
  }
  return {
    mappings: createMappings(prepared, mediaOrigin),
    verified: verified.sort(),
  };
}
