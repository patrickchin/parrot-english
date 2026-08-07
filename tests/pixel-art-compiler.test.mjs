import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compileRgbaToPixelGrid,
  expandRgbaCells,
  validatePixelAssetContract,
} from "../scripts/lib/pixel-art-compiler.mjs";

describe("pixel art compiler", () => {
  it("hardens alpha and maps every visible pixel to the approved palette", () => {
    const source = new Uint8ClampedArray([
      250, 12, 20, 255,
      18, 240, 24, 200,
      20, 20, 20, 80,
    ]);

    const output = compileRgbaToPixelGrid({
      alphaThreshold: 128,
      data: source,
      palette: ["#ff0000", "#00ff00", "#000000"],
    });

    assert.deepEqual([...output], [
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 0, 0,
    ]);
  });

  it("rejects fractional runtime scale and dimension drift", () => {
    assert.throws(
      () =>
        validatePixelAssetContract({
          actualHeight: 64,
          actualWidth: 64,
          expectedHeight: 64,
          expectedWidth: 64,
          worldScale: 0.5,
        }),
      /worldScale must be 1/,
    );
    assert.throws(
      () =>
        validatePixelAssetContract({
          actualHeight: 64,
          actualWidth: 63,
          expectedHeight: 64,
          expectedWidth: 64,
          worldScale: 1,
        }),
      /expected 64x64 but received 63x64/,
    );
  });

  it("accepts exact native dimensions at one world pixel per source pixel", () => {
    assert.doesNotThrow(() =>
      validatePixelAssetContract({
        actualHeight: 160,
        actualWidth: 160,
        expectedHeight: 160,
        expectedWidth: 160,
        worldScale: 1,
      }),
    );
  });

  it("expands every authored cell to the same square world-space block", () => {
    const red = [255, 0, 0, 255];
    const green = [0, 255, 0, 255];
    const expanded = expandRgbaCells({
      cellSize: 2,
      data: new Uint8ClampedArray([...red, ...green]),
      height: 1,
      width: 2,
    });

    assert.deepEqual(
      { height: expanded.height, width: expanded.width },
      { height: 2, width: 4 },
    );
    assert.deepEqual([...expanded.data], [
      ...red, ...red, ...green, ...green,
      ...red, ...red, ...green, ...green,
    ]);
  });
});
