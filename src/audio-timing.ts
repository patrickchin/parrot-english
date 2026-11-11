type OutputClock = Pick<AudioContext, 'currentTime' | 'baseLatency' | 'outputLatency' | 'getOutputTimestamp'>;

// A context may report running before its render thread has actually started.
// Wait for two native render quanta before relating it to the picture clock.
export function waitForAudioClock(context: Pick<AudioContext, 'currentTime' | 'sampleRate' | 'state'>, signal: AbortSignal) {
  signal.throwIfAborted();
  const readyAt = context.currentTime + 256 / context.sampleRate;
  return new Promise<void>((resolve, reject) => {
    let poll: ReturnType<typeof setTimeout>;
    const deadline = setTimeout(() => finish(new Error('播放或录音暂时中断了，请再试一次。')), 8000);
    const finish = (error?: unknown) => {
      clearTimeout(poll); clearTimeout(deadline); signal.removeEventListener('abort', cancelled);
      error ? reject(error) : resolve();
    };
    const cancelled = () => finish(new DOMException('Cancelled', 'AbortError'));
    const check = () => {
      if (context.state !== 'running') finish(new Error('播放或录音暂时中断了，请再试一次。'));
      else if (context.currentTime >= readyAt) finish();
      else poll = setTimeout(check, 5);
    };
    signal.addEventListener('abort', cancelled, { once: true }); check();
  });
}

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
