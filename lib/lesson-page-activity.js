// @ts-check

export function createLessonPageActivityGuard() {
  let generation = 0;

  return {
    capture() {
      return generation;
    },
    invalidate() {
      generation += 1;
    },
    /** @param {number} capturedGeneration */
    isCurrent(capturedGeneration) {
      return capturedGeneration === generation;
    },
  };
}
