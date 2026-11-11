// All video waits share cancellation, listener cleanup, and a deadline. Playback
// starts on `playing`, not resolution of play(), which can arrive much later.
export function waitForVideo(video: HTMLVideoElement, event: 'seeked' | 'canplay' | 'playing', signal: AbortSignal, {
  start, delay = 0, timeout = 8000, timeoutMessage = "errors.seekTimeout", onReady, onLateError,
}: {
  start?: () => void | Promise<void>; delay?: number; timeout?: number; timeoutMessage?: string;
  onReady?: () => void; onLateError?: (error: unknown) => void;
} = {}) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let starter: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => finish(new Error(timeoutMessage)), delay + timeout);
    const cleanup = () => {
      clearTimeout(deadline); clearTimeout(starter);
      video.removeEventListener(event, ready); video.removeEventListener('error', failed);
      signal.removeEventListener('abort', cancelled);
    };
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true; cleanup();
      if (error) reject(error); else { onReady?.(); resolve(); }
    };
    const ready = () => finish();
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
