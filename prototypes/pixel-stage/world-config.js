export const RENDER_SCALE = 3;
export const ART_PIXEL_SIZE = 1;
export const TILE_SIZE = 16 * RENDER_SCALE;
export const CAMERA_ZOOM = 2;
export const GROUND_SOURCE_SCALE = 2;
export const TEXTURE_TO_WORLD_SCALE = 0.5;
export const VIEWPORT_SIZE = Object.freeze({ height: 240, width: 360 });
export const VISIBLE_WORLD_SIZE = Object.freeze({
  height: VIEWPORT_SIZE.height / CAMERA_ZOOM,
  width: VIEWPORT_SIZE.width / CAMERA_ZOOM,
});
export const WORLD_GRID = Object.freeze({ columns: 15, rows: 10 });
export const WORLD_SIZE = Object.freeze({
  height: WORLD_GRID.rows * TILE_SIZE,
  width: WORLD_GRID.columns * TILE_SIZE,
});

export const PLAYER_START = Object.freeze({ x: 450, y: 192 });
export const SPRITE_FRAME_SIZE = 320;
export const SPRITE_WORLD_FRAME_SIZE =
  SPRITE_FRAME_SIZE * TEXTURE_TO_WORLD_SCALE;
export const SPRITE_SCREEN_FRAME_SIZE =
  SPRITE_WORLD_FRAME_SIZE * CAMERA_ZOOM;
export const PLAYER_SPEED = 144;
export const PLAYER_BODY = Object.freeze({
  height: 24,
  offsetX: 56,
  offsetY: 136,
  width: 48,
});

export const DYNAMIC_DEPTH_BASE = 1_000;
export const getDepthForFootY = (footY) =>
  DYNAMIC_DEPTH_BASE + Math.round(footY);

export const WORLD_OBJECTS = Object.freeze([
  {
    asset: "garden-tree-ball",
    collision: { height: 36, offsetX: -49.5, offsetY: -36, width: 99 },
    footY: 300,
    id: "lesson-tree",
    x: 270,
    y: 300,
  },
  {
    asset: "garden-flowers",
    collision: { height: 21, offsetX: -48, offsetY: -21, width: 96 },
    footY: 156,
    id: "flower-patch",
    x: 540,
    y: 156,
  },
  {
    asset: "garden-basket",
    collision: { height: 18, offsetX: -27, offsetY: -18, width: 54 },
    footY: 330,
    id: "lesson-basket",
    x: 480,
    y: 330,
  },
  {
    asset: "garden-market",
    collision: { height: 36, offsetX: -72, offsetY: -36, width: 144 },
    footY: 408,
    id: "apple-counter",
    x: 600,
    y: 408,
  },
]);

export const ANIMATIONS = Object.freeze([
  { end: 0, frameRate: 1, key: "idle", repeat: -1, start: 0 },
  { end: 3, frameRate: 9, key: "walking", repeat: -1, start: 0 },
  { end: 7, frameRate: 7, key: "talking", repeat: -1, start: 4 },
  { end: 11, frameRate: 6, key: "happy", repeat: -1, start: 8 },
  { end: 15, frameRate: 4, key: "surprised", repeat: -1, start: 12 },
]);
