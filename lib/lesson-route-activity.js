// @ts-check

export function createLessonRouteActivityGuard() {
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

/**
 * @param {ReturnType<typeof createLessonRouteActivityGuard>} activityGuard
 * @param {() => void} cancelPendingWork
 */
export function invalidateLessonRouteActivity(
  activityGuard,
  cancelPendingWork,
) {
  activityGuard.invalidate();
  cancelPendingWork();
}
