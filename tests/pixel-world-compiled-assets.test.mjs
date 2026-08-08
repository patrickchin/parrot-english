import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { PIXEL_WORLD_PACK } from "../prototypes/pixel-stage/world-pack.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const runtimeRoot = path.join(projectRoot, "public", "assets", "pixel-world");
const runtimePrefix = "/assets/pixel-world/";

const palette = new Set(
  PIXEL_WORLD_PACK.renderProfile.palette.map((color) => {
    const [red, green, blue] = Buffer.from(color.slice(1), "hex");
    return `${red},${green},${blue}`;
  }),
);

async function listPngs(directory, relativeDirectory = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        return listPngs(path.join(directory, entry.name), relativePath);
      }
      return entry.isFile() && entry.name.endsWith(".png") ? [relativePath] : [];
    }),
  );
  return paths.flat();
}

function formatRgba(data, offset) {
  return `[${data[offset]}, ${data[offset + 1]}, ${data[offset + 2]}, ${data[offset + 3]}]`;
}

function assertAlignedArtCells(assetId, data, width, height) {
  const cellSize = PIXEL_WORLD_PACK.renderProfile.artCellWorldPixels;
  assert.equal(width % cellSize, 0, `${assetId} width must align to ${cellSize}px cells`);
  assert.equal(height % cellSize, 0, `${assetId} height must align to ${cellSize}px cells`);

  for (let cellY = 0; cellY < height; cellY += cellSize) {
    for (let cellX = 0; cellX < width; cellX += cellSize) {
      const expectedOffset = (cellY * width + cellX) * 4;
      for (let y = cellY; y < cellY + cellSize; y += 1) {
        for (let x = cellX; x < cellX + cellSize; x += 1) {
          const actualOffset = (y * width + x) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            assert.equal(
              data[actualOffset + channel],
              data[expectedOffset + channel],
              `${assetId} cell at (${cellX}, ${cellY}) must repeat one RGBA pixel; ` +
                `found ${formatRgba(data, actualOffset)} at (${x}, ${y}) instead of ` +
                `${formatRgba(data, expectedOffset)}`,
            );
          }
        }
      }
    }
  }
}

describe("compiled pixel-world runtime assets", () => {
  it("matches the dimensions, palette, alpha, and aligned art-cell contract", async (t) => {
    const assets = Object.entries(PIXEL_WORLD_PACK.assets);
    const declaredPaths = assets
      .map(([assetId, asset]) => {
        assert.ok(
          asset.src.startsWith(runtimePrefix),
          `${assetId} must use the local pixel-world runtime prefix`,
        );
        return asset.src.slice(runtimePrefix.length);
      })
      .sort();
    const compiledPaths = (await listPngs(runtimeRoot)).sort();

    assert.deepEqual(
      compiledPaths,
      declaredPaths,
      "PIXEL_WORLD_PACK must declare every compiled runtime PNG and only those PNGs",
    );

    for (const [assetId, asset] of assets) {
      await t.test(assetId, async () => {
        const relativePath = asset.src.slice(runtimePrefix.length);
        const { data, info } = await sharp(path.join(runtimeRoot, relativePath))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        assert.deepEqual(
          { height: info.height, width: info.width },
          { height: asset.nativeHeight, width: asset.nativeWidth },
          `${assetId} must match its declared native dimensions`,
        );
        assert.equal(info.channels, 4, `${assetId} must decode to RGBA`);

        const alphaValues = new Set();
        const unexpectedColors = new Set();
        for (let offset = 0; offset < data.length; offset += 4) {
          const alpha = data[offset + 3];
          alphaValues.add(alpha);
          if (alpha !== 0) {
            const color = `${data[offset]},${data[offset + 1]},${data[offset + 2]}`;
            if (!palette.has(color)) unexpectedColors.add(color);
          }
        }

        assert.deepEqual(
          [...alphaValues].filter((alpha) => alpha !== 0 && alpha !== 255),
          [],
          `${assetId} must use binary alpha`,
        );
        assert.deepEqual(
          [...unexpectedColors],
          [],
          `${assetId} visible pixels must belong to the shared palette`,
        );
        if (asset.kind === "ground") {
          assert.deepEqual([...alphaValues], [255], `${assetId} must be fully opaque`);
        }

        assertAlignedArtCells(assetId, data, info.width, info.height);
      });
    }
  });
});
