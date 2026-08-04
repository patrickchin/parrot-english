export const WORLD_WIDTH = 240;
export const WORLD_HEIGHT = 160;
export const FRAME_SIZE = 64;
export const SPRITE_COLUMNS = 4;
export const SPRITE_ROWS = 4;

const animations = Object.freeze({
  idle: { duration: 550, row: 0 },
  talking: { duration: 140, row: 1 },
  happy: { duration: 180, row: 2 },
  surprised: { duration: 260, row: 3 },
});

export function getIntegerScale(availableWidth, availableHeight) {
  const horizontalScale = Math.floor(Math.max(0, availableWidth) / WORLD_WIDTH);
  const verticalScale = Math.floor(Math.max(0, availableHeight) / WORLD_HEIGHT);

  return Math.max(1, Math.min(horizontalScale, verticalScale));
}

export function getSpriteFrame(state, elapsedMs, { reducedMotion = false } = {}) {
  const animation = animations[state] ?? animations.idle;
  const column = reducedMotion
    ? 0
    : Math.floor(Math.max(0, elapsedMs) / animation.duration) % SPRITE_COLUMNS;

  return { column, row: animation.row };
}
