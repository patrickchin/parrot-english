import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FRAME_SIZE,
  PLAYER_START,
  SPRITE_COLUMNS,
  SPRITE_ROWS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  getActorDepth,
  getIntegerScale,
  getSpriteFrame,
  moveActor,
} from "../public/prototypes/pixel-stage/sprite-state.js";

describe("pixel stage sprite state", () => {
  it("uses one low-resolution grid for the world and character frames", () => {
    assert.equal(WORLD_WIDTH, 240);
    assert.equal(WORLD_HEIGHT, 160);
    assert.equal(FRAME_SIZE, 64);
    assert.equal(SPRITE_COLUMNS, 4);
    assert.equal(SPRITE_ROWS, 4);
  });

  it("only enlarges the virtual world by whole-number pixel scales", () => {
    assert.equal(getIntegerScale(366, 244), 1);
    assert.equal(getIntegerScale(480, 320), 2);
    assert.equal(getIntegerScale(1_080, 680), 4);
    assert.equal(getIntegerScale(160, 120), 1);
  });

  it("moves Peppa through the world in two-pixel steps", () => {
    assert.deepEqual(moveActor(PLAYER_START, "right"), {
      facing: "right",
      x: 122,
      y: 112,
    });
    assert.deepEqual(moveActor(PLAYER_START, "left"), {
      facing: "left",
      x: 118,
      y: 112,
    });
    assert.deepEqual(moveActor(PLAYER_START, "up"), {
      facing: "right",
      x: 120,
      y: 110,
    });
  });

  it("keeps Peppa inside the yard and out of scenery", () => {
    assert.deepEqual(
      moveActor({ facing: "right", x: 36, y: 90 }, "left"),
      { facing: "left", x: 36, y: 90 },
    );
    assert.deepEqual(
      moveActor({ facing: "right", x: 166, y: 90 }, "right"),
      { facing: "right", x: 166, y: 90 },
    );
    assert.deepEqual(
      moveActor({ facing: "right", x: 86, y: 122 }, "down"),
      { facing: "right", x: 86, y: 122 },
    );
    assert.deepEqual(
      moveActor({ facing: "right", x: 120, y: 122 }, "down"),
      { facing: "right", x: 120, y: 124 },
    );
  });

  it("derives render depth from Peppa's feet", () => {
    assert.equal(getActorDepth(112), 212);
    assert.equal(getActorDepth(140), 240);
  });

  it("maps each demonstration state to its own animation row", () => {
    assert.deepEqual(getSpriteFrame("idle", 0), { column: 0, row: 0 });
    assert.deepEqual(getSpriteFrame("talking", 0), { column: 0, row: 1 });
    assert.deepEqual(getSpriteFrame("happy", 0), { column: 0, row: 2 });
    assert.deepEqual(getSpriteFrame("surprised", 0), { column: 0, row: 3 });
  });

  it("loops frames at a state-specific pace", () => {
    assert.deepEqual(getSpriteFrame("talking", 140), { column: 1, row: 1 });
    assert.deepEqual(getSpriteFrame("talking", 560), { column: 0, row: 1 });
    assert.deepEqual(getSpriteFrame("idle", 1_100), { column: 2, row: 0 });
  });

  it("keeps a stable first frame for reduced motion and unknown states", () => {
    assert.deepEqual(getSpriteFrame("happy", 900, { reducedMotion: true }), {
      column: 0,
      row: 2,
    });
    assert.deepEqual(getSpriteFrame("missing", 900), { column: 1, row: 0 });
  });
});
