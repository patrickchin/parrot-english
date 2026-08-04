import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FRAME_SIZE,
  SPRITE_COLUMNS,
  SPRITE_ROWS,
  getSpriteFrame,
} from "../public/prototypes/pixel-stage/sprite-state.js";

describe("pixel stage sprite state", () => {
  it("uses a compact four-by-four sheet of 64px game frames", () => {
    assert.equal(FRAME_SIZE, 64);
    assert.equal(SPRITE_COLUMNS, 4);
    assert.equal(SPRITE_ROWS, 4);
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
