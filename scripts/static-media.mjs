/* global URL */

import { setTimeout as wait } from "node:timers/promises";
import sharp from "sharp";

const CACHE_CONTROL = "public, max-age=31536000, immutable";
const MEDIA_FETCH_ATTEMPTS = 3;
const MEDIA_FETCH_CONCURRENCY = 16;
const MEDIA_FETCH_RETRY_DELAY_MS = 250;

const lessonIds = [
  "01-peppas-high-ball",
  "02-garden-colors",
  "03-snack-time",
  "04-playground-words",
  "05-market-day",
  "06-picnic-time",
  "07-bedtime-story",
];

const fullSceneFiles = {
  "01-peppas-high-ball": [
    "01-ball-up-high",
    "02-cannot-reach",
    "03-asking-for-help",
    "04-dolly-flies-up",
    "05-ball-comes-down",
  ],
  "02-garden-colors": [
    "01-colorful-flowers",
    "02-color-question",
    "03-red-one",
    "04-flower-found",
    "05-finished-basket",
  ],
  "03-snack-time": [
    "01-snack-basket",
    "02-fruit-for-snack",
    "03-peppa-asks-politely",
    "04-apple-for-peppa",
    "05-happy-snack",
  ],
  "04-playground-words": [
    "01-dolly-swinging",
    "02-peppa-waits",
    "03-ask-for-a-turn",
    "04-peppas-turn",
    "05-playing-together",
  ],
  "05-market-day": [
    "01-fruit-stand",
    "02-asking-price",
    "03-two-coins",
    "04-choosing-apples",
    "05-apples-ready",
  ],
  "06-picnic-time": [
    "01-picnic-blanket",
    "02-dolly-offers-juice",
    "03-peppa-says-yes",
    "04-cup-of-juice",
    "05-picnic-time-together",
  ],
  "07-bedtime-story": [
    "01-story-ends",
    "02-quiet-evening",
    "03-peppa-feels-sleepy",
    "04-blanket-ready",
    "05-good-night",
  ],
};

const storyIds = [
  "a-snack-for-two",
  "big-box-small-box",
  "boots-in-the-rain",
  "kite-come-back",
  "lina-goes-to-sleep",
  "ready-maya-ready",
  "robo-tries",
  "seed-wake-up",
  "soup-for-five",
  "tess-can-help",
  "the-lantern-trail",
  "the-moon-bus",
  "the-noisy-little-band",
  "the-picnic-blanket-search",
  "the-red-ball",
  "three-apples",
  "wake-up-nori",
  "wally-finds-the-way",
  "where-is-dot",
  "which-hat",
];

const storyPageFiles = [
  "the-red-ball-ball-home",
  "the-red-ball-my-red-ball",
  "the-red-ball-roll-away",
  "the-red-ball-roll-to-me",
  "the-red-ball-stop-ball",
  "three-apples-one-apple",
  "three-apples-one-each",
  "three-apples-one-falls",
  "three-apples-three-apples-counted",
  "three-apples-two-apples",
  "three-apples-two-left",
  "wake-up-nori-nori-claps",
  "wake-up-nori-nori-dances",
  "wake-up-nori-nori-jumps",
  "wake-up-nori-nori-sleeps-again",
  "wake-up-nori-nori-sleeps",
  "wake-up-nori-nori-wakes",
  "where-is-dot-dot-and-box",
  "where-is-dot-dot-found",
  "where-is-dot-look-under",
  "where-is-dot-not-in",
  "where-is-dot-not-on",
  "which-hat-blue-hat",
  "which-hat-hat-on-head",
  "which-hat-red-hat",
  "which-hat-three-hats",
  "which-hat-yellow-hat",
];

function webp(path, options = {}) {
  return { contentType: "image/webp", path, ...options };
}

function responsiveWebps(path, options = {}) {
  return [384, 768].map((resizeWidth) =>
    webp(path.replace(/\.webp$/, `-${resizeWidth}.webp`), {
      resizeWidth,
      sourcePath: path,
      ...options,
    }),
  );
}

const peppaResponsiveStates = [
  "happy",
  "listening",
  "sad",
  "surprised",
  "talking",
];
const characterAssets = [
  webp("characters/peppa/peppa-idle.webp"),
  ...peppaResponsiveStates.flatMap((state) =>
    ["1024", "384", "768", null].map((width) =>
      webp(
        `characters/peppa/peppa-${state}${width ? `-${width}` : ""}.webp`,
      ),
    ),
  ),
  ...["happy", "idle", "listening", "sad", "surprised", "talking"].map(
    (state) => webp(`characters/dolly/dolly-${state}.webp`),
  ),
];
const fullSceneAssets = lessonIds.flatMap((lessonId) =>
  fullSceneFiles[lessonId].flatMap((filename) => {
    const path = `full-scenes/${lessonId}/${filename}.webp`;
    return [webp(path), ...responsiveWebps(path)];
  }),
);
const dubbingV6Files = [
  "nursery-rhymes-cover.webp",
  "five-little-ducks/scene-1-five-ducklings.webp",
  "five-little-ducks/scene-2-four-ducklings.webp",
  "five-little-ducks/scene-3-three-ducklings.webp",
  "five-little-ducks/scene-4-two-ducklings.webp",
  "five-little-ducks/scene-5-one-duckling.webp",
  "five-little-ducks/scene-6-family-reunion.webp",
  "twinkle-twinkle/scene-1-little-star.webp",
  "twinkle-twinkle/scene-2-world-below.webp",
  "twinkle-twinkle/scene-3-diamond-sky.webp",
  "row-row-row-your-boat/scene-1-gentle-stream.webp",
  "row-row-row-your-boat/scene-2-merry-dream.webp",
  "mary-had-a-little-lamb/scene-1-white-lamb.webp",
  "mary-had-a-little-lamb/scene-2-lamb-follows.webp",
  "humpty-dumpty/scene-1-on-the-wall.webp",
  "humpty-dumpty/scene-2-helping-humpty.webp",
];
const dubbingV7Files = [
  "row-row-row-your-boat/line-2-gentle-stream.webp",
  "row-row-row-your-boat/line-3-merrily.webp",
  "humpty-dumpty/line-2-great-fall.webp",
  "humpty-dumpty/line-3-royal-help.webp",
];
const dubbingV8Files = [
  "old-macdonald/scene-1-cows.webp",
  "old-macdonald/scene-2-ducks.webp",
  "old-macdonald/scene-3-pigs.webp",
  "old-macdonald/scene-4-dog.webp",
  "old-macdonald/scene-5-sheep.webp",
];
const dubbingResponsiveAssets = [
  ...dubbingV6Files.map((path) => ({ path, version: 6 })),
  ...dubbingV7Files.map((path) => ({ path, version: 7 })),
  ...dubbingV8Files.map((path) => ({ path, version: 8 })),
].flatMap(({ path, version }) =>
  responsiveWebps(`dubbing/${path}`, {
    sourceVersion: version,
    targetVersion: version,
  }),
);
const lessonCoverAssets = lessonIds.flatMap((lessonId) =>
  ["384", "768", null].map((width) =>
    webp(`lesson-covers/${lessonId}${width ? `-${width}` : ""}.webp`),
  ),
);
const storyCoverAssets = storyIds.flatMap((storyId) =>
  ["384", "768", null].map((width) =>
    webp(`stories/${storyId}-cover${width ? `-${width}` : ""}.webp`),
  ),
);
const storyPageAssets = storyPageFiles.map((filename) =>
  webp(`story-pages/${filename}.webp`),
);
const brandAssets = [
  "apple-touch-icon.png",
  "favicon.png",
  "icon-192.png",
  "icon-512.png",
  "social-card.png",
].map((filename) => ({
  contentType: "image/png",
  path: `brand/${filename}`,
}));

export const STATIC_MEDIA_ASSETS = Object.freeze([
  ...characterAssets,
  ...fullSceneAssets,
  ...dubbingResponsiveAssets,
  ...lessonCoverAssets,
  webp("personalization/the-red-ball-scene-reference.webp"),
  ...storyCoverAssets,
  ...storyPageAssets,
  ...brandAssets,
]);

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeOrigin(value) {
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

function requireVersion(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function parseAsset(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`assets[${index}] must be an object`);
  }
  const assetPath = requireText(value.path, `assets[${index}].path`);
  if (
    assetPath.includes("\\") ||
    assetPath.startsWith("/") ||
    assetPath.split("/").includes("..") ||
    !/^[a-z0-9][a-z0-9./-]*\.(?:png|webp)$/.test(assetPath)
  ) {
    throw new Error(`assets[${index}].path must be a safe relative image path`);
  }
  if (!["image/png", "image/webp"].includes(value.contentType)) {
    throw new Error(`assets[${index}].contentType must be image/png or image/webp`);
  }
  if (
    (assetPath.endsWith(".png") && value.contentType !== "image/png") ||
    (assetPath.endsWith(".webp") && value.contentType !== "image/webp")
  ) {
    throw new Error(`assets[${index}] extension must match its content type`);
  }
  const sourcePath = value.sourcePath === undefined
    ? assetPath
    : requireText(value.sourcePath, `assets[${index}].sourcePath`);
  if (
    sourcePath.includes("\\") ||
    sourcePath.startsWith("/") ||
    sourcePath.split("/").includes("..") ||
    !/^[a-z0-9][a-z0-9./-]*\.(?:png|webp)$/.test(sourcePath)
  ) {
    throw new Error(`assets[${index}].sourcePath must be a safe relative image path`);
  }
  if (
    (sourcePath.endsWith(".png") && value.contentType !== "image/png") ||
    (sourcePath.endsWith(".webp") && value.contentType !== "image/webp")
  ) {
    throw new Error(`assets[${index}] source extension must match its content type`);
  }
  const resizeWidth = value.resizeWidth === undefined
    ? undefined
    : requireVersion(value.resizeWidth, `assets[${index}].resizeWidth`);
  if (resizeWidth !== undefined && value.contentType !== "image/webp") {
    throw new Error(`assets[${index}].resizeWidth requires image/webp`);
  }
  return {
    contentType: value.contentType,
    path: assetPath,
    resizeWidth,
    sourcePath,
    sourceVersion: value.sourceVersion === undefined
      ? undefined
      : requireVersion(value.sourceVersion, `assets[${index}].sourceVersion`),
    targetVersion: value.targetVersion === undefined
      ? undefined
      : requireVersion(value.targetVersion, `assets[${index}].targetVersion`),
  };
}

export function createStaticMediaPublishPlan(assetsValue, optionsValue) {
  if (!Array.isArray(assetsValue) || assetsValue.length === 0) {
    throw new Error("assets must be a non-empty array");
  }
  if (!optionsValue || typeof optionsValue !== "object") {
    throw new Error("options must be an object");
  }
  const bucket = requireText(optionsValue.bucket, "bucket");
  const mediaOrigin = normalizeOrigin(optionsValue.mediaOrigin);
  const sourceVersion = requireVersion(
    optionsValue.sourceVersion,
    "sourceVersion",
  );
  const targetVersion = requireVersion(
    optionsValue.targetVersion,
    "targetVersion",
  );
  if (targetVersion <= sourceVersion) {
    throw new Error("targetVersion must be newer than sourceVersion");
  }

  const assets = assetsValue.map(parseAsset);
  if (new Set(assets.map(({ path }) => path)).size !== assets.length) {
    throw new Error("asset paths must be unique");
  }

  return assets.map(({
    contentType,
    path,
    resizeWidth,
    sourcePath,
    sourceVersion: assetSourceVersion,
    targetVersion: assetTargetVersion,
  }, index) => {
    const resolvedSourceVersion = assetSourceVersion ?? sourceVersion;
    const resolvedTargetVersion = assetTargetVersion ?? targetVersion;
    if (
      resolvedTargetVersion < resolvedSourceVersion ||
      (resolvedTargetVersion === resolvedSourceVersion &&
        (resizeWidth === undefined || sourcePath === path))
    ) {
      throw new Error(
        `assets[${index}] targetVersion must be newer unless it creates a resized path`,
      );
    }
    const sourceKey = `assets/v${resolvedSourceVersion}/${sourcePath}`;
    const targetKey = `assets/v${resolvedTargetVersion}/${path}`;
    return {
      bucket,
      cacheControl: CACHE_CONTROL,
      contentType,
      path,
      ...(resizeWidth === undefined ? {} : { resizeWidth }),
      sourceKey,
      sourceUrl: `${mediaOrigin}/${sourceKey}`,
      targetKey,
      targetUrl: `${mediaOrigin}/${targetKey}`,
    };
  });
}

function hasImmutableYearCache(value) {
  const directives = value
    .split(",")
    .map((directive) => directive.trim().toLowerCase())
    .filter(Boolean);
  const maxAges = directives.flatMap((directive) => {
    const match = /^max-age\s*=\s*"?(\d+)"?$/.exec(directive);
    return match ? [Number(match[1])] : [];
  });
  return (
    directives.filter((directive) => directive === "public").length === 1 &&
    directives.filter((directive) => directive === "immutable").length === 1 &&
    !directives.some((directive) =>
      ["private", "no-cache", "no-store"].includes(
        directive.split("=", 1)[0],
      ),
    ) &&
    maxAges.length === 1 &&
    maxAges[0] >= 31_536_000
  );
}

function checkedUrl(value, phase, cacheBust) {
  const url = new URL(value);
  url.searchParams.set("parrot-media-check", `${phase}-${cacheBust}`);
  return url.href;
}

function createMediaFetch(fetch, retryDelay) {
  let activeRequests = 0;
  const queuedRequests = [];

  async function acquireRequestSlot() {
    if (activeRequests < MEDIA_FETCH_CONCURRENCY) {
      activeRequests += 1;
      return;
    }
    await new Promise((resolve) => queuedRequests.push(resolve));
  }

  function releaseRequestSlot() {
    const next = queuedRequests.shift();
    if (next) {
      next();
      return;
    }
    activeRequests -= 1;
  }

  return async (...args) => {
    await acquireRequestSlot();
    try {
      for (let attempt = 1; attempt <= MEDIA_FETCH_ATTEMPTS; attempt += 1) {
        try {
          return await fetch(...args);
        } catch (error) {
          if (attempt === MEDIA_FETCH_ATTEMPTS) throw error;
          await retryDelay(
            MEDIA_FETCH_RETRY_DELAY_MS * (2 ** (attempt - 1)),
          );
        }
      }
      throw new Error("Media fetch retry loop ended unexpectedly");
    } finally {
      releaseRequestSlot();
    }
  };
}

function imageBytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

async function inspectTargets(
  plan,
  { cacheBust, fetch, phase, responsiveVariants },
) {
  const checks = await Promise.all(
    plan.map(async (asset) => {
      let response;
      try {
        response = await fetch(
          checkedUrl(asset.targetUrl, phase, cacheBust),
          { method: "HEAD", redirect: "error" },
        );
      } catch (error) {
        return { asset, error: `could not be requested: ${error.message}` };
      }
      if (!response.ok) {
        return {
          asset,
          error: `returned HTTP ${response.status}`,
          missing: response.status === 404,
        };
      }
      const contentType = (response.headers.get("content-type") ?? "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (contentType !== asset.contentType) {
        return {
          asset,
          error: `must return ${asset.contentType}`,
          exists: true,
        };
      }
      if (
        !hasImmutableYearCache(response.headers.get("cache-control") ?? "")
      ) {
        return {
          asset,
          error: "must use immutable caching for at least one year",
          exists: true,
        };
      }
      const bytes = Number(response.headers.get("content-length"));
      if (!Number.isSafeInteger(bytes) || bytes < 1) {
        return {
          asset,
          error: "must return a positive content-length",
          exists: true,
        };
      }
      if (asset.resizeWidth !== undefined) {
        let imageResponse;
        try {
          imageResponse = await fetch(
            checkedUrl(asset.targetUrl, `${phase}-image`, cacheBust),
            { method: "GET", redirect: "error" },
          );
        } catch (error) {
          return {
            asset,
            error: `image bytes could not be requested: ${error.message}`,
            exists: true,
          };
        }
        if (!imageResponse.ok) {
          return {
            asset,
            error: `image bytes returned HTTP ${imageResponse.status}`,
            exists: true,
          };
        }
        const imageType = (imageResponse.headers.get("content-type") ?? "")
          .split(";", 1)[0]
          .trim()
          .toLowerCase();
        if (imageType !== asset.contentType) {
          return {
            asset,
            error: `image bytes must return ${asset.contentType}`,
            exists: true,
          };
        }
        try {
          const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
          const metadata = await sharp(imageBytes, { failOn: "error" }).metadata();
          const expected = responsiveVariants.get(asset.targetUrl);
          if (!expected) {
            return {
              asset,
              error: "has no prepared canonical derivative",
              exists: true,
            };
          }
          if (metadata.format !== expected.format) {
            return {
              asset,
              error: `must decode as ${expected.format}`,
              exists: true,
            };
          }
          if (metadata.width !== expected.width) {
            return {
              asset,
              error: `must decode to exactly ${expected.width}px wide`,
              exists: true,
            };
          }
          if (metadata.height !== expected.height) {
            return {
              asset,
              error: `must decode to exactly ${expected.height}px high`,
              exists: true,
            };
          }
          if (!imageBytesEqual(imageBytes, expected.bytes)) {
            return {
              asset,
              error: "must match its canonical source",
              exists: true,
            };
          }
        } catch (error) {
          return {
            asset,
            error: `must be a decodable image: ${error.message}`,
            exists: true,
          };
        }
      }
      return { asset, bytes };
    }),
  );
  return {
    invalid: checks.filter(({ error }) => error),
    verified: checks.filter(({ error }) => !error),
  };
}

async function prepareResponsiveVariants(plan, { cacheBust, fetch }) {
  const sources = new Map();
  for (const asset of plan) {
    if (asset.resizeWidth === undefined) continue;
    const current = sources.get(asset.sourceUrl);
    if (current) {
      current.requiredWidth = Math.max(current.requiredWidth, asset.resizeWidth);
      continue;
    }
    sources.set(asset.sourceUrl, {
      asset,
      requiredWidth: asset.resizeWidth,
    });
  }

  const loaded = new Map();
  await Promise.all([...sources.entries()].map(async ([sourceUrl, source]) => {
    const sourcePath = source.asset.sourceKey.replace(/^assets\/v\d+\//, "");
    const response = await fetch(
      checkedUrl(sourceUrl, "source", cacheBust),
      { method: "GET", redirect: "error" },
    );
    if (!response.ok) {
      throw new Error(`${sourcePath} source returned HTTP ${response.status}`);
    }
    const contentType = (response.headers.get("content-type") ?? "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (contentType !== source.asset.contentType) {
      throw new Error(`${sourcePath} source must return ${source.asset.contentType}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 1) {
      throw new Error(`${sourcePath} source must not be empty`);
    }
    let metadata;
    try {
      metadata = await sharp(bytes, { failOn: "error" }).metadata();
    } catch (error) {
      throw new Error(`${sourcePath} source must be a decodable image: ${error.message}`);
    }
    if (metadata.format !== "webp") {
      throw new Error(`${sourcePath} source must decode as webp`);
    }
    if (!metadata.width || metadata.width < source.requiredWidth) {
      throw new Error(
        `${sourcePath} source must be at least ${source.requiredWidth}px wide`,
      );
    }
    if (!metadata.height) {
      throw new Error(`${sourcePath} source must have a positive height`);
    }
    loaded.set(sourceUrl, bytes);
  }));

  const variants = new Map();
  await Promise.all(plan.map(async (asset) => {
    if (asset.resizeWidth === undefined) return;
    const sourceBytes = loaded.get(asset.sourceUrl);
    const { data, info } = await sharp(sourceBytes, { failOn: "error" })
      .resize({ width: asset.resizeWidth })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    variants.set(asset.targetUrl, {
      bytes: new Uint8Array(data),
      format: info.format,
      height: info.height,
      width: info.width,
    });
  }));
  return variants;
}

function verificationError(invalid) {
  return new Error(
    `Static media verification failed:\n${invalid
      .map(({ asset, error }) => `- ${asset.path} ${error}`)
      .sort()
      .join("\n")}`,
  );
}

export async function ensureStaticMedia(
  plan,
  {
    cacheBust,
    fetch = globalThis.fetch,
    putObject,
    retryDelay = wait,
  },
) {
  if (!Array.isArray(plan) || plan.length === 0) {
    throw new Error("plan must be a non-empty array");
  }
  if (typeof fetch !== "function") throw new Error("fetch must be available");
  if (typeof putObject !== "function") {
    throw new Error("putObject must be a function");
  }
  if (typeof retryDelay !== "function") {
    throw new Error("retryDelay must be a function");
  }
  const token = requireText(cacheBust, "cacheBust");
  const mediaFetch = createMediaFetch(fetch, retryDelay);
  const responsiveVariants = await prepareResponsiveVariants(plan, {
    cacheBust: token,
    fetch: mediaFetch,
  });
  const preflight = await inspectTargets(plan, {
    cacheBust: token,
    fetch: mediaFetch,
    phase: "preflight",
    responsiveVariants,
  });
  const existingInvalid = preflight.invalid.filter(({ exists }) => exists);
  if (existingInvalid.length > 0) {
    throw new Error(
      `${existingInvalid
        .map(({ asset, error }) => `${asset.path} ${error}`)
        .sort()
        .join(", ")} and already exists with invalid immutable metadata; use a new asset version`,
    );
  }
  const unavailable = preflight.invalid.filter(
    ({ exists, missing }) => !exists && !missing,
  );
  if (unavailable.length > 0) throw verificationError(unavailable);
  const published = [];

  for (const { asset } of preflight.invalid.filter(({ missing }) => missing)) {
    let bytes;
    if (asset.resizeWidth !== undefined) {
      bytes = responsiveVariants.get(asset.targetUrl)?.bytes;
      if (!bytes) {
        throw new Error(`${asset.path} has no prepared canonical derivative`);
      }
    } else {
      const sourceResponse = await mediaFetch(
        checkedUrl(asset.sourceUrl, "source", token),
        { method: "GET", redirect: "error" },
      );
      if (!sourceResponse.ok) {
        throw new Error(`${asset.path} source returned HTTP ${sourceResponse.status}`);
      }
      const sourceType = (sourceResponse.headers.get("content-type") ?? "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (sourceType !== asset.contentType) {
        throw new Error(`${asset.path} source must return ${asset.contentType}`);
      }
      bytes = new Uint8Array(await sourceResponse.arrayBuffer());
      if (bytes.byteLength < 1) {
        throw new Error(`${asset.path} source must not be empty`);
      }
    }
    await putObject(asset, bytes);
    published.push(asset.path);
  }

  const verification = await inspectTargets(plan, {
    cacheBust: token,
    fetch: mediaFetch,
    phase: "verify",
    responsiveVariants,
  });
  if (verification.invalid.length > 0) {
    throw verificationError(verification.invalid);
  }

  return {
    published: published.sort(),
    verified: verification.verified.map(({ asset }) => asset.path).sort(),
  };
}
