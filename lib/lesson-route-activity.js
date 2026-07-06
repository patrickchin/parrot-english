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

/**
 * @template PendingEvent
 * @param {{ current: PendingEvent | null }} pendingRoutedEventRef
 * @param {ReturnType<typeof createLessonRouteActivityGuard>} activityGuard
 * @param {() => void} cancelPendingWork
 */
export function exitLessonRouteActivity(
  pendingRoutedEventRef,
  activityGuard,
  cancelPendingWork,
) {
  pendingRoutedEventRef.current = null;
  invalidateLessonRouteActivity(activityGuard, cancelPendingWork);
}

export function createLessonRouteExitRegistry() {
  /** @type {(() => void) | null} */
  let activeBarrier = null;

  return {
    /** @param {() => void} barrier */
    register(barrier) {
      activeBarrier = barrier;
      return () => {
        if (activeBarrier === barrier) activeBarrier = null;
      };
    },
    exit() {
      activeBarrier?.();
    },
  };
}
