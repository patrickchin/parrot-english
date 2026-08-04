import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FRAME_SIZE,
  SPRITE_COLUMNS,
  SPRITE_ROWS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  getIntegerScale,
  getSpriteFrame,
} from "../public/prototypes/pixel-stage/sprite-state.js";

describe("pixel stage sprite state", () => {
  it("uses one low-resolution grid for the world and character frames", () => {
    assert.equal(WORLD_WIDTH, 120);
    assert.equal(WORLD_HEIGHT, 80);
    assert.equal(FRAME_SIZE, 32);
    assert.equal(SPRITE_COLUMNS, 4);
    assert.equal(SPRITE_ROWS, 4);
  });

  it("only enlarges the virtual world by whole-number pixel scales", () => {
    assert.equal(getIntegerScale(366, 244), 3);
    assert.equal(getIntegerScale(280, 200), 2);
    assert.equal(getIntegerScale(1_080, 680), 8);
    assert.equal(getIntegerScale(80, 60), 1);
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
