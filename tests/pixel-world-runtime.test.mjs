import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PIXEL_WORLD_PACK } from "../prototypes/pixel-stage/world-pack.js";
import * as worldRuntime from "../prototypes/pixel-stage/world-runtime.js";

const {
  flattenSceneLayers,
  getLayerScrollFactor,
  resolveHeldItemTransform,
  resolvePlacementSlot,
} = worldRuntime;

const getCharacter = (id) => {
  assert.ok(
    Array.isArray(PIXEL_WORLD_PACK.characters),
    "The runtime requires PIXEL_WORLD_PACK.characters[]",
  );
  const character = PIXEL_WORLD_PACK.characters.find((entry) => entry.id === id);
  assert.ok(character, `Missing character ${id}`);
  return character;
};

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

  it("resolves all semantic placement slots to bounded integer positions", () => {
    assert.equal(
      typeof resolvePlacementSlot,
      "function",
      "The runtime must export resolvePlacementSlot(slotId)",
    );
    assert.ok(Array.isArray(PIXEL_WORLD_PACK.placementSlots));

    const resolved = new Map(
      PIXEL_WORLD_PACK.placementSlots.map(({ id }) => [
        id,
        resolvePlacementSlot(id),
      ]),
    );
    assert.equal(resolved.size, 9);
    for (const [slotId, position] of resolved) {
      assert.equal(Number.isInteger(position.x), true, `${slotId} x must be integer`);
      assert.equal(Number.isInteger(position.y), true, `${slotId} y must be integer`);
      assert.ok(position.x >= PIXEL_WORLD_PACK.renderProfile.playfield.left);
      assert.ok(position.x <= PIXEL_WORLD_PACK.renderProfile.playfield.right);
      assert.ok(position.y >= PIXEL_WORLD_PACK.renderProfile.playfield.top);
      assert.ok(position.y <= PIXEL_WORLD_PACK.renderProfile.playfield.bottom);
    }

    assert.ok(resolved.get("back-left").x < resolved.get("center").x);
    assert.ok(resolved.get("front-right").x > resolved.get("center").x);
    assert.ok(resolved.get("back-left").y < resolved.get("center").y);
    assert.ok(resolved.get("front-right").y > resolved.get("center").y);
    assert.throws(
      () => resolvePlacementSlot("outside-the-world"),
      /unknown placement slot/i,
    );
  });

  it("mirrors a generic item attachment and identifies its hand overlay", () => {
    const anchors = getCharacter("peppa").sockets.mainHand.byPose.walking;
    const itemHold = {
      offsetX: 2,
      offsetY: -4,
      originX: 0.5,
      originY: 0.5,
    };
    assert.deepEqual(
      resolveHeldItemTransform({ anchors, flipX: false, frameIndex: 1, itemHold }),
      {
        depth: "front",
        flipX: false,
        originX: 0.5,
        originY: 0.5,
        overlayRole: "mainHandFront",
        x: 63,
        y: -57,
      },
    );
    assert.deepEqual(
      resolveHeldItemTransform({ anchors, flipX: true, frameIndex: 1, itemHold }),
      {
        depth: "front",
        flipX: true,
        originX: 0.5,
        originY: 0.5,
        overlayRole: "mainHandFront",
        x: -63,
        y: -57,
      },
    );
  });

  it("preserves Polly's overlay role when her attachment is mirrored", () => {
    const anchors = getCharacter("polly").sockets.mainHand.byPose.idle;
    const itemHold = {
      offsetX: 3,
      offsetY: 2,
      originX: 0.5,
      originY: 0.82,
    };

    const facingRight = resolveHeldItemTransform({
      anchors,
      flipX: false,
      frameIndex: 0,
      itemHold,
    });
    const facingLeft = resolveHeldItemTransform({
      anchors,
      flipX: true,
      frameIndex: 0,
      itemHold,
    });

    assert.equal(facingRight.overlayRole, "mainHandFront");
    assert.equal(facingLeft.overlayRole, "mainHandFront");
    assert.equal(facingLeft.x, -facingRight.x);
    assert.equal(facingLeft.y, facingRight.y);
    assert.equal(facingLeft.originX, facingRight.originX);
    assert.equal(facingLeft.originY, facingRight.originY);
  });
});
