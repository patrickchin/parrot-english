// Whitelist playback state only: no media URLs, recording data, or learner text.
export function mediaSnapshot(video: HTMLVideoElement | null, context: AudioContext | null) {
  let output: AudioTimestamp | undefined;
  try { output = context?.getOutputTimestamp(); } catch { /* Diagnostics must not interrupt cleanup. */ }
  return {
    at: Math.round(performance.now()),
    video: video && { time: video.currentTime, paused: video.paused, seeking: video.seeking,
      ready: video.readyState, network: video.networkState, ended: video.ended,
      rate: video.playbackRate, muted: video.muted, error: video.error?.code },
    audio: context && { time: context.currentTime, state: context.state,
      sampleRate: context.sampleRate, baseLatency: context.baseLatency, outputLatency: context.outputLatency,
      outputTime: output?.contextTime, outputAt: output?.performanceTime },
  };
}
