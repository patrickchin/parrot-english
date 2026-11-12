export const waveformStep = 0.005;
export type ReferenceWaveform = { version: 2; duration: number; step: number; peaks: number[] };
export type WaveformRecording = { start: number; peaks: number[] };
// Mutable frame data stays outside React. Saved takes still use immutable state.
export type WaveformTimeline = { time: number; capture: WaveformRecording | null };

export function validateWaveform(value: unknown): ReferenceWaveform {
  const wave = value as ReferenceWaveform;
  if (!wave || wave.version !== 2 || !Number.isFinite(wave.duration) || wave.duration <= 0 || wave.duration > 120 ||
      wave.step !== waveformStep || !Array.isArray(wave.peaks) || wave.peaks.length !== Math.ceil(wave.duration / wave.step) ||
      !wave.peaks.every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error("errors.waveformUnavailable");
  return wave;
}

// Both sources use the same peak-amplitude scale with square-root compression
// for readable quiet detail. Never normalize the two traces independently.
export function waveformHeight(peak: number) {
  return peak <= 0.002 ? 0 : Math.sqrt(Math.min(1, Math.max(0, peak)));
}

// One column per display pixel, retaining the largest peak in that time range.
// Restrict both ends to real samples: an empty/future interval paints nothing.
// fromX lets live capture repaint only its last column and newly received data.
export function drawWaveform(context: Pick<CanvasRenderingContext2D, 'fillRect'>, recording: WaveformRecording,
  start: number, end: number, width: number, height: number, fromX = 0, until = end) {
  const { peaks, start: offset } = recording;
  const scale = width / (end - start);
  const left = Math.max(0, fromX, (offset - start) * scale);
  const right = Math.min(width, (Math.min(until, offset + peaks.length * waveformStep) - start) * scale);
  for (let x = Math.floor(left); x < right; x++) {
    const first = Math.max(0, Math.floor((start + x / scale - offset) / waveformStep));
    const last = Math.min(peaks.length, Math.ceil((Math.min(until, start + (x + 1) / scale) - offset) / waveformStep));
    let peak = 0;
    for (let i = first; i < last; i++) peak = Math.max(peak, peaks[i]);
    const amplitude = waveformHeight(peak) * Math.max(0, height / 2 - 2);
    if (amplitude) context.fillRect(Math.max(x, left), height / 2 - amplitude, Math.min(x + 1, right) - Math.max(x, left), amplitude * 2);
  }
  return Math.max(0, right);
}
