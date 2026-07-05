type PlaybackOperationOptions = {
  generation: number;
  getCurrentGeneration: () => number;
  onCompleted: () => void;
  onFailed: (error: unknown) => void;
};

export function createPlaybackOperation({
  generation,
  getCurrentGeneration,
  onCompleted,
  onFailed,
}: PlaybackOperationOptions) {
  let settled = false;

  function finish(callback: () => void) {
    if (settled || getCurrentGeneration() !== generation) return;
    settled = true;
    callback();
  }

  return {
    complete: () => finish(onCompleted),
    fail: (error: unknown) => finish(() => onFailed(error)),
  };
}
