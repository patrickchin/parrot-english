type OutputClock = Pick<AudioContext, 'currentTime' | 'baseLatency' | 'outputLatency' | 'getOutputTimestamp'>;

// AudioContext.currentTime describes rendering ahead of the speakers. Use the
// device's output timestamp to relate rendered samples to the picture's clock.
export function audibleContextTime(context: OutputClock, now = performance.now()) {
  const stamp = context.getOutputTimestamp?.();
  const sampleTime = stamp?.contextTime, samplePerformanceTime = stamp?.performanceTime;
  if (typeof sampleTime === 'number' && typeof samplePerformanceTime === 'number' && sampleTime > 0 && samplePerformanceTime > 0 && now >= samplePerformanceTime && now - samplePerformanceTime < 1000) {
    return Math.min(context.currentTime, sampleTime + (now - samplePerformanceTime) / 1000);
  }
  // Older engines do not expose output timestamps. Keep the platform's latency
  // estimate, including before the first output block; do not invent a constant.
  return context.currentTime - (context.baseLatency || 0) - (context.outputLatency || 0);
}

export function decodeTake(cache: WeakMap<Blob, Promise<AudioBuffer>>, context: Pick<AudioContext, 'decodeAudioData'>, blob: Blob) {
  let pending = cache.get(blob);
  if (!pending) {
    pending = blob.arrayBuffer().then(bytes => context.decodeAudioData(bytes)).catch(error => {
      cache.delete(blob); throw error;
    });
    cache.set(blob, pending);
  }
  return pending;
}
