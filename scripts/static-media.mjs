/* global URL */

const CACHE_CONTROL = "public, max-age=31536000, immutable";

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

function webp(path) {
  return { contentType: "image/webp", path };
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
  fullSceneFiles[lessonId].map((filename) =>
    webp(`full-scenes/${lessonId}/${filename}.webp`),
  ),
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
  return { contentType: value.contentType, path: assetPath };
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

  return assets.map(({ contentType, path }) => {
    const sourceKey = `assets/v${sourceVersion}/${path}`;
    const targetKey = `assets/v${targetVersion}/${path}`;
    return {
      bucket,
      cacheControl: CACHE_CONTROL,
      contentType,
      path,
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

async function inspectTargets(plan, { cacheBust, fetch, phase }) {
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
      return { asset, bytes };
    }),
  );
  return {
    invalid: checks.filter(({ error }) => error),
    verified: checks.filter(({ error }) => !error),
  };
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
  },
) {
  if (!Array.isArray(plan) || plan.length === 0) {
    throw new Error("plan must be a non-empty array");
  }
  if (typeof fetch !== "function") throw new Error("fetch must be available");
  if (typeof putObject !== "function") {
    throw new Error("putObject must be a function");
  }
  const token = requireText(cacheBust, "cacheBust");
  const preflight = await inspectTargets(plan, {
    cacheBust: token,
    fetch,
    phase: "preflight",
  });
  const existingInvalid = preflight.invalid.filter(({ exists }) => exists);
  if (existingInvalid.length > 0) {
    throw new Error(
      `${existingInvalid
        .map(({ asset }) => asset.path)
        .sort()
        .join(", ")} already exists with invalid immutable metadata; use a new asset version`,
    );
  }
  const unavailable = preflight.invalid.filter(
    ({ exists, missing }) => !exists && !missing,
  );
  if (unavailable.length > 0) throw verificationError(unavailable);
  const published = [];

  for (const { asset } of preflight.invalid.filter(({ missing }) => missing)) {
    const sourceResponse = await fetch(
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
    const bytes = new Uint8Array(await sourceResponse.arrayBuffer());
    if (bytes.byteLength < 1) {
      throw new Error(`${asset.path} source must not be empty`);
    }
    await putObject(asset, bytes);
    published.push(asset.path);
  }

  const verification = await inspectTargets(plan, {
    cacheBust: token,
    fetch,
    phase: "verify",
  });
  if (verification.invalid.length > 0) {
    throw verificationError(verification.invalid);
  }

  return {
    published: published.sort(),
    verified: verification.verified.map(({ asset }) => asset.path).sort(),
  };
}
