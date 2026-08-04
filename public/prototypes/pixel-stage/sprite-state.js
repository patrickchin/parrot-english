export const WORLD_WIDTH = 240;
export const WORLD_HEIGHT = 160;
export const FRAME_SIZE = 64;
export const SPRITE_COLUMNS = 4;
export const SPRITE_ROWS = 4;
export const PLAYER_START = Object.freeze({ facing: "right", x: 120, y: 112 });

const MOVE_STEP = 2;
const playerBounds = Object.freeze({
  maxX: 212,
  maxY: 146,
  minX: 36,
  minY: 72,
});
const obstacles = Object.freeze([
  { maxX: 72, maxY: 100, minX: 36, minY: 72 },
  { maxX: 208, maxY: 108, minX: 168, minY: 68 },
  { maxX: 212, maxY: 110, minX: 202, minY: 72 },
  { maxX: 88, maxY: 146, minX: 36, minY: 124 },
  { maxX: 212, maxY: 146, minX: 128, minY: 124 },
]);
const directionSteps = Object.freeze({
  down: { dx: 0, dy: MOVE_STEP },
  left: { dx: -MOVE_STEP, dy: 0 },
  right: { dx: MOVE_STEP, dy: 0 },
  up: { dx: 0, dy: -MOVE_STEP },
});

const animations = Object.freeze({
  idle: { duration: 550, row: 0 },
  walking: { duration: 120, row: 0 },
  talking: { duration: 140, row: 1 },
  happy: { duration: 180, row: 2 },
  surprised: { duration: 260, row: 3 },
});

export function getIntegerScale(availableWidth, availableHeight) {
  const horizontalScale = Math.floor(Math.max(0, availableWidth) / WORLD_WIDTH);
  const verticalScale = Math.floor(Math.max(0, availableHeight) / WORLD_HEIGHT);

  return Math.max(1, Math.min(horizontalScale, verticalScale));
}

function isBlocked(x, y) {
  return obstacles.some(
    (obstacle) =>
      x >= obstacle.minX &&
      x <= obstacle.maxX &&
      y >= obstacle.minY &&
      y <= obstacle.maxY,
  );
}

export function moveActor(position, direction) {
  const step = directionSteps[direction];
  if (!step) return { ...position };

  const facing = step.dx < 0 ? "left" : step.dx > 0 ? "right" : position.facing;
  const x = Math.max(
    playerBounds.minX,
    Math.min(playerBounds.maxX, position.x + step.dx),
  );
  const y = Math.max(
    playerBounds.minY,
    Math.min(playerBounds.maxY, position.y + step.dy),
  );

  return isBlocked(x, y) ? { ...position, facing } : { facing, x, y };
}

export function getActorDepth(y) {
  return 100 + Math.round(y);
}

export function getSpriteFrame(state, elapsedMs, { reducedMotion = false } = {}) {
  const animation = animations[state] ?? animations.idle;
  const column = reducedMotion
    ? 0
    : Math.floor(Math.max(0, elapsedMs) / animation.duration) % SPRITE_COLUMNS;

  return { column, row: animation.row };
}
