import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PIXEL_WORLD_PACK } from "../prototypes/pixel-stage/world-pack.js";
import {
  compileRgbaToPixelGrid,
  expandRgbaCells,
  mergeCompiledAssetEntries,
  validatePixelAssetContract,
} from "./lib/pixel-art-compiler.mjs";

const projectRoot = fileURLToPath(new globalThis.URL("..", import.meta.url));
const sourceRoot = path.join(projectRoot, "art-source", "pixel-world", "sources");
const outputRoot = path.join(projectRoot, "public", "assets", "pixel-world");
const publicPrefix = "/assets/pixel-world/";
const alphaThreshold = 128;
const transparent = Object.freeze({ alpha: 0, b: 0, g: 0, r: 0 });
const spriteSheetPoseRows = Object.freeze([
  "walking",
  "talking",
  "happy",
  "surprised",
]);

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
      fit: "cover",
      kernel: sharp.kernel.lanczos3,
      position: "centre",
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, info };
}

async function normalizeLayerStrip(input, width, height) {
  const trimmed = await sharp(input)
    .ensureAlpha()
    .trim({ background: transparent, threshold: 8 })
    .png()
    .toBuffer();
  const { data, info } = await sharp(trimmed)
    .resize(width, height, {
      background: transparent,
      fit: "contain",
      kernel: sharp.kernel.lanczos3,
      position: "south",
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

function copyEllipse({
  centerX,
  centerY,
  data,
  height,
  output,
  radiusX,
  radiusY,
  width,
}) {
  let visiblePixelCount = 0;
  const left = Math.max(0, Math.floor(centerX - radiusX));
  const right = Math.min(width - 1, Math.ceil(centerX + radiusX));
  const top = Math.max(0, Math.floor(centerY - radiusY));
  const bottom = Math.min(height - 1, Math.ceil(centerY + radiusY));

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const xRatio = (x - centerX) / radiusX;
      const yRatio = (y - centerY) / radiusY;
      if (xRatio * xRatio + yRatio * yRatio > 1) continue;
      const offset = (y * width + x) * 4;
      output[offset] = data[offset];
      output[offset + 1] = data[offset + 1];
      output[offset + 2] = data[offset + 2];
      output[offset + 3] = data[offset + 3];
      if (data[offset + 3] >= alphaThreshold) visiblePixelCount += 1;
    }
  }
  return visiblePixelCount;
}

function findNearestVisiblePixel({ centerX, centerY, data, frame, width }) {
  let nearest = null;
  for (let y = frame.top; y < frame.bottom; y += 1) {
    for (let x = frame.left; x < frame.right; x += 1) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] < alphaThreshold) continue;
      const distanceSquared = (x - centerX) ** 2 + (y - centerY) ** 2;
      if (!nearest || distanceSquared < nearest.distanceSquared) {
        nearest = { distanceSquared, x, y };
      }
    }
  }
  return nearest;
}

async function deriveFrontHandOverlaySource(character) {
  const bodySheet = character.spriteSheet;
  const overlaySheet = character.overlays?.mainHandFront;
  if (!overlaySheet) return null;
  if (
    bodySheet.columns !== overlaySheet.columns ||
    bodySheet.rows !== overlaySheet.rows ||
    bodySheet.frameWidth !== overlaySheet.frameWidth ||
    bodySheet.frameHeight !== overlaySheet.frameHeight
  ) {
    throw new Error(`${character.id} body and front-hand overlay geometry must match.`);
  }

  const bodyAsset = PIXEL_WORLD_PACK.assets[bodySheet.assetId];
  const overlayAsset = PIXEL_WORLD_PACK.assets[overlaySheet.assetId];
  if (!bodyAsset || !overlayAsset) {
    throw new Error(`${character.id} requires declared body and front-hand assets.`);
  }

  const cellSize = PIXEL_WORLD_PACK.renderProfile.artCellWorldPixels;
  const authoredWidth = overlayAsset.nativeWidth / cellSize;
  const authoredHeight = overlayAsset.nativeHeight / cellSize;
  const body = await normalizeFullCanvas(
    await readFile(sourcePathFor(bodyAsset)),
    authoredWidth,
    authoredHeight,
  );
  const overlay = new Uint8ClampedArray(body.data.length);
  const authoredFrameWidth = overlaySheet.frameWidth / cellSize;
  const authoredFrameHeight = overlaySheet.frameHeight / cellSize;
  const radiusX = Math.max(4, (overlaySheet.frameWidth * 0.07) / cellSize);
  const radiusY = Math.max(5, (overlaySheet.frameHeight * 0.09) / cellSize);
  const anchorsByPose = character.sockets?.mainHand?.byPose;

  for (let row = 0; row < spriteSheetPoseRows.length; row += 1) {
    const pose = spriteSheetPoseRows[row];
    const anchors = anchorsByPose?.[pose];
    if (!anchors?.length) {
      throw new Error(`${character.id} is missing ${pose} main-hand anchors.`);
    }
    for (let column = 0; column < overlaySheet.columns; column += 1) {
      const anchor = anchors[column % anchors.length];
      if (
        anchor.depth !== "front" ||
        anchor.overlayRole !== "mainHandFront"
      ) {
        continue;
      }
      const socketX =
        column * authoredFrameWidth +
        (overlaySheet.frameWidth / 2 + anchor.x) / cellSize;
      const socketY =
        row * authoredFrameHeight +
        (overlaySheet.frameHeight + anchor.y) / cellSize;
      const nearestVisiblePixel = findNearestVisiblePixel({
        centerX: socketX,
        centerY: socketY,
        data: body.data,
        frame: {
          bottom: (row + 1) * authoredFrameHeight,
          left: column * authoredFrameWidth,
          right: (column + 1) * authoredFrameWidth,
          top: row * authoredFrameHeight,
        },
        width: authoredWidth,
      });
      if (!nearestVisiblePixel) {
        throw new Error(
          `${character.id} frame ${row * overlaySheet.columns + column} is empty.`,
        );
      }
      const visiblePixelCount = copyEllipse({
        centerX: nearestVisiblePixel.x,
        centerY: nearestVisiblePixel.y,
        data: body.data,
        height: authoredHeight,
        output: overlay,
        radiusX,
        radiusY,
        width: authoredWidth,
      });
      if (!visiblePixelCount) {
        throw new Error(
          `${character.id} frame ${row * overlaySheet.columns + column} ` +
            "has no front-hand pixels.",
        );
      }
    }
  }

  const overlaySourcePath = sourcePathFor(overlayAsset);
  await mkdir(path.dirname(overlaySourcePath), { recursive: true });
  await sharp(overlay, {
    raw: { channels: 4, height: authoredHeight, width: authoredWidth },
  })
    .png({ compressionLevel: 9, palette: false })
    .toFile(overlaySourcePath);
  return overlaySheet.assetId;
}

async function deriveSelectedCharacterOverlays(selectedAssetIds) {
  const selected = new Set(selectedAssetIds);
  for (const character of PIXEL_WORLD_PACK.characters ?? []) {
    const overlayAssetId = character.overlays?.mainHandFront?.assetId;
    if (overlayAssetId && selected.has(overlayAssetId)) {
      await deriveFrontHandOverlaySource(character);
    }
  }
}

function includeDerivedCharacterOverlays(selectedAssetIds) {
  const expandedAssetIds = [...selectedAssetIds];
  const selected = new Set(expandedAssetIds);
  for (const character of PIXEL_WORLD_PACK.characters ?? []) {
    const bodyAssetId = character.spriteSheet?.assetId;
    const overlayAssetId = character.overlays?.mainHandFront?.assetId;
    if (
      bodyAssetId &&
      overlayAssetId &&
      selected.has(bodyAssetId) &&
      !selected.has(overlayAssetId)
    ) {
      selected.add(overlayAssetId);
      expandedAssetIds.push(overlayAssetId);
    }
  }
  return expandedAssetIds;
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
    : asset.kind === "layer" && !assetId.startsWith("sky-")
      ? await normalizeLayerStrip(input, authoredWidth, authoredHeight)
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
  const allAssetIds = Object.keys(PIXEL_WORLD_PACK.assets);
  const selectedAssetIds = includeDerivedCharacterOverlays(requestedAssetIds());
  await deriveSelectedCharacterOverlays(selectedAssetIds);
  const results = [];
  for (const assetId of selectedAssetIds) {
    results.push(await compileAsset(assetId, PIXEL_WORLD_PACK.assets[assetId]));
  }
  let existingEntries = [];
  if (selectedAssetIds.length !== allAssetIds.length) {
    const existingManifestPath = path.join(outputRoot, "manifest.json");
    const existingManifest = JSON.parse(
      await readFile(existingManifestPath, "utf8").catch((error) => {
        throw new Error(
          "Partial compilation requires an existing complete runtime manifest.",
          { cause: error },
        );
      }),
    );
    existingEntries = existingManifest.assets ?? [];
  }
  const manifest = {
    assets: mergeCompiledAssetEntries({
      assetIds: allAssetIds,
      compiledEntries: results,
      existingEntries,
    }),
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
