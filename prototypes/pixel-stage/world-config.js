export const WORLD_SIZE = Object.freeze({ height: 160, width: 240 });
export const PLAYER_START = Object.freeze({ x: 120, y: 112 });
export const SPRITE_FRAME_SIZE = 64;
export const PLAYER_SPEED = 58;
export const PLAYER_BODY = Object.freeze({
  height: 8,
  offsetX: 25,
  offsetY: 56,
  width: 14,
});
export const WALKABLE_BOUNDS = Object.freeze({
  height: 82,
  width: 190,
  x: 29,
  y: 64,
});
export const PLAYER_DEPTH_BASE = 100;
export const FOREGROUND_DEPTH = 400;

export const ANIMATIONS = Object.freeze([
  { end: 3, frameRate: 2, key: "idle", repeat: -1, start: 0 },
  { end: 3, frameRate: 9, key: "walking", repeat: -1, start: 0 },
  { end: 7, frameRate: 7, key: "talking", repeat: -1, start: 4 },
  { end: 11, frameRate: 6, key: "happy", repeat: -1, start: 8 },
  { end: 15, frameRate: 4, key: "surprised", repeat: -1, start: 12 },
]);

export const SCENERY_COLLIDERS = Object.freeze([
  { height: 28, name: "schoolhouse", width: 36, x: 54, y: 86 },
  { height: 40, name: "tree", width: 40, x: 188, y: 88 },
  { height: 38, name: "sign", width: 10, x: 207, y: 91 },
  { height: 22, name: "left fence", width: 52, x: 62, y: 135 },
  { height: 22, name: "right fence", width: 84, x: 170, y: 135 },
]);
