import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PIXEL_WORLD_PACK } from "../prototypes/pixel-stage/world-pack.js";
import {
  flattenSceneLayers,
  getLayerScrollFactor,
  resolveHeldItemTransform,
} from "../prototypes/pixel-stage/world-runtime.js";

describe("pixel world runtime model", () => {
  it("flattens scene layers in deterministic back-to-front order", () => {
    const layers = flattenSceneLayers(PIXEL_WORLD_PACK.scenes[0]);
    assert.deepEqual(
      layers.map(({ role }) => role),
      ["sky", "far", "far", "mid", "play"],
    );
    assert.ok(
      layers.every((layer, index) =>
        index === 0 || layer.depth >= layers[index - 1].depth,
      ),
    );
  });

  it("makes parallax an accessible A/B choice", () => {
    const layer = { scrollFactorX: 0.2, scrollFactorY: 0.1 };
    assert.deepEqual(getLayerScrollFactor(layer, "camera", false), {
      x: 0.2,
      y: 0.1,
    });
    assert.deepEqual(getLayerScrollFactor(layer, "off", false), { x: 1, y: 1 });
    assert.deepEqual(getLayerScrollFactor(layer, "ambient", true), {
      x: 1,
      y: 1,
    });
  });

  it("mirrors one generic item attachment around the character socket", () => {
    const anchors = PIXEL_WORLD_PACK.player.sockets.mainHand.byPose.walking;
    const itemHold = {
      offsetX: 2,
      offsetY: -4,
      originX: 0.5,
      originY: 0.5,
      rotation: -20,
    };
    assert.deepEqual(
      resolveHeldItemTransform({ anchors, flipX: false, frameIndex: 1, itemHold }),
      {
        depth: "front",
        flipX: false,
        originX: 0.5,
        originY: 0.5,
        rotation: -20,
        x: 36,
        y: -110,
      },
    );
    assert.deepEqual(
      resolveHeldItemTransform({ anchors, flipX: true, frameIndex: 1, itemHold }),
      {
        depth: "front",
        flipX: true,
        originX: 0.5,
        originY: 0.5,
        rotation: 20,
        x: -36,
        y: -110,
      },
    );
  });
});
