type Now = () => number;

function browserNow() {
  return globalThis.performance.now();
}

export function createResponseLatencyTimer(now: Now = browserNow) {
  let startedAt: number | null = null;

  return {
    start() {
      startedAt = now();
    },

    finish() {
      if (startedAt === null) return null;
      const elapsedMs = Math.max(0, now() - startedAt);
      startedAt = null;
      return Math.round(elapsedMs);
    },

    reset() {
      startedAt = null;
    },
  };
}

export function formatResponseLatency(latencyMs: number) {
  return `${(Math.max(0, latencyMs) / 1_000).toFixed(2)} s`;
}
