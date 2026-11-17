// All video waits share cancellation, listener cleanup, and a deadline.
// Synchronized playback also waits for the picture clock to advance: WebKit can
// emit `playing` while currentTime is still parked at the starting frame.
export function waitForVideo(video: HTMLVideoElement, event: 'seeked' | 'canplay' | 'playing', signal: AbortSignal, {
  start, delay = 0, timeout = 8000, timeoutMessage = "errors.seekTimeout", progress = false, onReady, onLateError,
}: {
  start?: () => void | Promise<void>; delay?: number; timeout?: number; timeoutMessage?: string;
  progress?: boolean; onReady?: () => void; onLateError?: (error: unknown) => void;
} = {}) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let starter: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;
    const initialTime = video.currentTime;
    const deadline = setTimeout(() => finish(new Error(timeoutMessage)), delay + timeout);
    const cleanup = () => {
      clearTimeout(deadline); clearTimeout(starter);
      if (frame !== undefined) cancelAnimationFrame(frame);
      video.removeEventListener(event, ready); video.removeEventListener('error', failed);
      signal.removeEventListener('abort', cancelled);
    };
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true; cleanup();
      if (error) reject(error);
      else {
        try { onReady?.(); resolve(); } catch (error) { reject(error); }
      }
    };
    const ready = () => {
      if (progress && video.currentTime <= initialTime) frame = requestAnimationFrame(ready);
      else finish();
    };
    const failed = () => finish(new Error("errors.videoPlayback"));
    const cancelled = () => finish(new DOMException('Cancelled', 'AbortError'));
    video.addEventListener(event, ready, { once: true }); video.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', cancelled, { once: true });
    const run = () => {
      try {
        Promise.resolve(start?.()).catch(error => {
          if (!settled) finish(error);
          else if (!signal.aborted) onLateError?.(error);
        });
      } catch (error) { finish(error); }
    };
    if (start) { if (delay) starter = setTimeout(run, delay); else run(); }
  });
}
