export const TILE_SIZE = 16;
export const CAMERA_ZOOM = 2;
export const VIEWPORT_SIZE = Object.freeze({ height: 160, width: 240 });
export const VISIBLE_WORLD_SIZE = Object.freeze({
  height: VIEWPORT_SIZE.height / CAMERA_ZOOM,
  width: VIEWPORT_SIZE.width / CAMERA_ZOOM,
});
export const WORLD_GRID = Object.freeze({ columns: 15, rows: 10 });
export const WORLD_SIZE = Object.freeze({
  height: WORLD_GRID.rows * TILE_SIZE,
  width: WORLD_GRID.columns * TILE_SIZE,
});

export const PLAYER_START = Object.freeze({ x: 128, y: 64 });
export const SPRITE_FRAME_SIZE = 64;
export const PLAYER_SCALE = 0.5;
export const PLAYER_SPEED = 48;
export const PLAYER_BODY = Object.freeze({
  height: 10,
  offsetX: 22,
  offsetY: 52,
  width: 20,
});

export const DYNAMIC_DEPTH_BASE = 1_000;
export const getDepthForFootY = (footY) =>
  DYNAMIC_DEPTH_BASE + Math.round(footY);

export const TILE_FRAMES = Object.freeze({
  flowerGrass: 2,
  grass: 0,
  grassDetail: 1,
  pathBottom: 37,
  pathBottomLeft: 36,
  pathBottomRight: 38,
  pathCenter: 25,
  pathLeft: 24,
  pathRight: 26,
  pathTop: 13,
  pathTopLeft: 12,
  pathTopRight: 14,
});

export const PATH_AREAS = Object.freeze([
  { height: 10, width: 3, x: 5, y: 0 },
  { height: 3, width: 12, x: 2, y: 4 },
  { height: 6, width: 3, x: 11, y: 4 },
]);

export const GROUND_DETAILS = Object.freeze([
  { frame: 2, x: 1, y: 1 },
  { frame: 1, x: 3, y: 2 },
  { frame: 2, x: 8, y: 1 },
  { frame: 1, x: 10, y: 2 },
  { frame: 2, x: 13, y: 1 },
  { frame: 1, x: 1, y: 5 },
  { frame: 2, x: 3, y: 7 },
  { frame: 1, x: 8, y: 7 },
  { frame: 2, x: 10, y: 8 },
  { frame: 1, x: 14, y: 6 },
  { frame: 2, x: 2, y: 9 },
  { frame: 1, x: 9, y: 9 },
  { frame: 2, x: 14, y: 9 },
]);

const tileRow = (frames, y = -8) =>
  frames.map((frame, index) => ({
    frame,
    x: (index - (frames.length - 1) / 2) * TILE_SIZE,
    y,
  }));

const tileGrid = (rows) =>
  rows.flatMap((frames, rowIndex) =>
    frames.map((frame, columnIndex) => ({
      frame,
      x: (columnIndex - (frames.length - 1) / 2) * TILE_SIZE,
      y: -((rows.length - rowIndex) - 0.5) * TILE_SIZE,
    })),
  );

const greenMapleTiles = Object.freeze([
  { frame: 4, x: -10, y: -24 },
  { frame: 16, x: -10, y: -8 },
  { frame: 4, x: 8, y: -28 },
  { frame: 16, x: 8, y: -12 },
  { frame: 4, x: 0, y: -36 },
  { frame: 16, x: 0, y: -20 },
  { frame: 5, x: -10, y: -13 },
  { frame: 5, x: 8, y: -17 },
  { frame: 5, x: 0, y: -25 },
]);

const orangeMapleTiles = Object.freeze([
  { frame: 3, x: -10, y: -24 },
  { frame: 15, x: -10, y: -8 },
  { frame: 3, x: 8, y: -28 },
  { frame: 15, x: 8, y: -12 },
  { frame: 3, x: 0, y: -36 },
  { frame: 15, x: 0, y: -20 },
  { frame: 27, x: -10, y: -13 },
  { frame: 27, x: 8, y: -17 },
  { frame: 27, x: 0, y: -25 },
]);

const evergreenTiles = tileGrid([[4], [16]]);

export const WORLD_OBJECTS = Object.freeze([
  {
    collision: { height: 10, offsetX: -30, offsetY: -10, width: 60 },
    footY: 88,
    id: "schoolhouse",
    tiles: tileGrid([
      [48, 49, 49, 50],
      [60, 61, 63, 62],
      [72, 73, 73, 75],
      [84, 84, 85, 87],
    ]),
    x: 96,
    y: 88,
  },
  {
    collision: { height: 8, offsetX: -5, offsetY: -8, width: 10 },
    footY: 96,
    id: "village-maple",
    tiles: greenMapleTiles,
    x: 128,
    y: 96,
  },
  {
    collision: { height: 8, offsetX: -5, offsetY: -8, width: 10 },
    footY: 80,
    id: "orange-maple",
    tiles: orangeMapleTiles,
    x: 208,
    y: 80,
  },
  {
    collision: { height: 7, offsetX: -4, offsetY: -7, width: 8 },
    footY: 128,
    id: "orchard-tree-west",
    tiles: evergreenTiles,
    x: 208,
    y: 128,
  },
  {
    collision: { height: 7, offsetX: -4, offsetY: -7, width: 8 },
    footY: 152,
    id: "orchard-tree-east",
    tiles: evergreenTiles,
    x: 224,
    y: 152,
  },
  {
    collision: { height: 7, offsetX: -4, offsetY: -7, width: 8 },
    footY: 56,
    id: "north-evergreen",
    tiles: evergreenTiles,
    x: 176,
    y: 56,
  },
  {
    collision: { height: 7, offsetX: -4, offsetY: -7, width: 8 },
    footY: 112,
    id: "west-evergreen",
    tiles: evergreenTiles,
    x: 32,
    y: 112,
  },
  {
    collision: { height: 4, offsetX: -5, offsetY: -4, width: 10 },
    footY: 112,
    id: "village-shrub",
    tiles: tileGrid([[5]]),
    x: 176,
    y: 112,
  },
  {
    collision: { height: 3, offsetX: -4, offsetY: -3, width: 8 },
    footY: 96,
    id: "mushroom-patch",
    tiles: tileGrid([[29]]),
    x: 192,
    y: 96,
  },
  {
    collision: { height: 5, offsetX: -40, offsetY: -5, width: 80 },
    footY: 136,
    id: "west-fence",
    tiles: tileRow([80, 81, 81, 81, 82]),
    x: 48,
    y: 136,
  },
  {
    collision: { height: 5, offsetX: -48, offsetY: -5, width: 96 },
    footY: 136,
    id: "east-fence",
    tiles: tileRow([80, 81, 81, 81, 81, 82]),
    x: 184,
    y: 136,
  },
  {
    collision: { height: 4, offsetX: -5, offsetY: -4, width: 10 },
    footY: 104,
    id: "notice-board",
    tiles: tileGrid([[83]]),
    x: 112,
    y: 104,
  },
  {
    collision: { height: 5, offsetX: -6, offsetY: -5, width: 12 },
    footY: 120,
    id: "bee-hive",
    tiles: tileGrid([[94]]),
    x: 200,
    y: 120,
  },
  {
    collision: { height: 5, offsetX: -6, offsetY: -5, width: 12 },
    footY: 56,
    id: "mailbox",
    tiles: tileGrid([[95]]),
    x: 144,
    y: 56,
  },
  {
    collision: { height: 5, offsetX: -6, offsetY: -5, width: 12 },
    footY: 144,
    id: "village-well",
    tiles: tileGrid([[104]]),
    x: 160,
    y: 144,
  },
]);

export const ANIMATIONS = Object.freeze([
  { end: 3, frameRate: 2, key: "idle", repeat: -1, start: 0 },
  { end: 3, frameRate: 9, key: "walking", repeat: -1, start: 0 },
  { end: 7, frameRate: 7, key: "talking", repeat: -1, start: 4 },
  { end: 11, frameRate: 6, key: "happy", repeat: -1, start: 8 },
  { end: 15, frameRate: 4, key: "surprised", repeat: -1, start: 12 },
]);
