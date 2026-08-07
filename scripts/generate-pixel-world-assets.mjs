import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PIXEL_WORLD_PACK } from "../prototypes/pixel-stage/world-pack.js";
import {
  compileRgbaToPixelGrid,
  expandRgbaCells,
  validatePixelAssetContract,
} from "./lib/pixel-art-compiler.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = path.join(projectRoot, "art-source", "pixel-world", "sources");
const outputRoot = path.join(projectRoot, "public", "assets", "pixel-world");
const publicPrefix = "/assets/pixel-world/";
const alphaThreshold = 128;
const transparent = Object.freeze({ alpha: 0, b: 0, g: 0, r: 0 });

function relativeAssetPath(asset) {
  if (!asset.src.startsWith(publicPrefix)) {
    throw new Error(`Pixel-world assets must be local: ${asset.src}`);
  }
  return asset.src.slice(publicPrefix.length);
}

function sourcePathFor(asset) {
  return path.join(sourceRoot, relativeAssetPath(asset));
}

function outputPathFor(asset) {
  return path.join(outputRoot, relativeAssetPath(asset));
}

async function normalizeFullCanvas(input, width, height) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .resize(width, height, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, info };
}

async function normalizeSprite(input, width, height, asset) {
  const trimmed = await sharp(input)
    .ensureAlpha()
    .trim({ background: transparent, threshold: 8 })
    .png()
    .toBuffer();
  const trimmedMetadata = await sharp(trimmed).metadata();
  if (!trimmedMetadata.width || !trimmedMetadata.height) {
    throw new Error(`Source sprite is empty: ${sourcePathFor(asset)}`);
  }

  const inset = Math.max(1, Math.round(Math.min(width, height) * 0.04));
  const maxWidth = Math.max(1, width - inset * 2);
  const maxHeight = Math.max(1, height - inset * 2);
  const resized = await sharp(trimmed)
    .resize(maxWidth, maxHeight, {
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const resizedMetadata = await sharp(resized).metadata();
  const resizedWidth = resizedMetadata.width ?? maxWidth;
  const resizedHeight = resizedMetadata.height ?? maxHeight;
  const left = Math.floor((width - resizedWidth) / 2);
  const top = Math.max(0, height - resizedHeight - inset);

  const { data, info } = await sharp({
    create: {
      background: transparent,
      channels: 4,
      height,
      width,
    },
  })
    .composite([{ input: resized, left, top }])
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, info };
}

function inspectCompiledPixels(data) {
  const alphaValues = new Set();
  const colors = new Set();
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3];
    alphaValues.add(alpha);
    if (alpha > 0) {
      colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]}`);
    }
  }
  return {
    alphaValues: [...alphaValues].sort((left, right) => left - right),
    colorCount: colors.size,
  };
}

async function compileAsset(assetId, asset) {
  const inputPath = sourcePathFor(asset);
  const outputPath = outputPathFor(asset);
  const input = await readFile(inputPath).catch((error) => {
    throw new Error(`Missing source for ${assetId}: ${inputPath}`, { cause: error });
  });
  const cellSize = PIXEL_WORLD_PACK.renderProfile.artCellWorldPixels;
  if (asset.nativeWidth % cellSize !== 0 || asset.nativeHeight % cellSize !== 0) {
    throw new Error(`${assetId} dimensions must be divisible by the ${cellSize}px art cell.`);
  }
  const authoredWidth = asset.nativeWidth / cellSize;
  const authoredHeight = asset.nativeHeight / cellSize;
  const normalized = asset.kind === "sprite"
    ? await normalizeSprite(input, authoredWidth, authoredHeight, asset)
    : await normalizeFullCanvas(input, authoredWidth, authoredHeight);

  const authoredPixels = compileRgbaToPixelGrid({
    alphaThreshold,
    data: normalized.data,
    palette: PIXEL_WORLD_PACK.renderProfile.palette,
  });
  const compiled = expandRgbaCells({
    cellSize,
    data: authoredPixels,
    height: authoredHeight,
    width: authoredWidth,
  });
  validatePixelAssetContract({
    actualHeight: compiled.height,
    actualWidth: compiled.width,
    expectedHeight: asset.nativeHeight,
    expectedWidth: asset.nativeWidth,
    worldScale: asset.worldScale,
  });
  const inspection = inspectCompiledPixels(compiled.data);
  if (inspection.alphaValues.some((value) => value !== 0 && value !== 255)) {
    throw new Error(`${assetId} contains non-binary alpha.`);
  }
  if (asset.alpha === "opaque" && inspection.alphaValues.some((value) => value !== 255)) {
    throw new Error(`${assetId} must be fully opaque.`);
  }
  if (inspection.colorCount > PIXEL_WORLD_PACK.renderProfile.palette.length) {
    throw new Error(`${assetId} exceeds the approved palette.`);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  const png = await sharp(compiled.data, {
    raw: {
      channels: 4,
      height: asset.nativeHeight,
      width: asset.nativeWidth,
    },
  })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  await writeFile(outputPath, png);

  return {
    alphaValues: inspection.alphaValues,
    bytes: png.byteLength,
    colorCount: inspection.colorCount,
    height: asset.nativeHeight,
    id: assetId,
    output: relativeAssetPath(asset),
    sha256: createHash("sha256").update(png).digest("hex"),
    source: path.relative(projectRoot, inputPath),
    width: asset.nativeWidth,
  };
}

function requestedAssetIds() {
  const onlyFlagIndex = process.argv.indexOf("--only");
  if (onlyFlagIndex === -1) return Object.keys(PIXEL_WORLD_PACK.assets);
  const requested = process.argv[onlyFlagIndex + 1]
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!requested?.length) throw new Error("--only requires an asset ID.");
  for (const assetId of requested) {
    if (!PIXEL_WORLD_PACK.assets[assetId]) {
      throw new Error(`Unknown pixel-world asset: ${assetId}`);
    }
  }
  return requested;
}

async function main() {
  const results = [];
  for (const assetId of requestedAssetIds()) {
    results.push(await compileAsset(assetId, PIXEL_WORLD_PACK.assets[assetId]));
  }
  const manifest = {
    assets: results,
    compiler: {
      alphaThreshold,
      artCellWorldPixels: PIXEL_WORLD_PACK.renderProfile.artCellWorldPixels,
      cameraZoom: PIXEL_WORLD_PACK.renderProfile.cameraZoom,
      palette: PIXEL_WORLD_PACK.renderProfile.palette,
      sourcePixelsPerWorldPixel:
        PIXEL_WORLD_PACK.renderProfile.sourcePixelsPerWorldPixel,
      screenPixelsPerArtPixel:
        PIXEL_WORLD_PACK.renderProfile.screenPixelsPerArtPixel,
      textureToWorldScale:
        PIXEL_WORLD_PACK.renderProfile.textureToWorldScale,
    },
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    worldPackId: PIXEL_WORLD_PACK.id,
  };
  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    path.join(outputRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `Compiled ${results.length} pixel-world assets on the native logical grid.\n`,
  );
}

await main();
