export const waveformStep = 0.005;
export type ReferenceWaveform = { version: 2; duration: number; step: number; peaks: number[] };

export function validateWaveform(value: unknown): ReferenceWaveform {
  const wave = value as ReferenceWaveform;
  if (!wave || wave.version !== 2 || !Number.isFinite(wave.duration) || wave.duration <= 0 || wave.duration > 120 ||
      wave.step !== waveformStep || !Array.isArray(wave.peaks) || wave.peaks.length !== Math.ceil(wave.duration / wave.step) ||
      !wave.peaks.every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error('原声波形暂时无法显示，仍可听原声并录音。');
  return wave;
}

// Both sources use the same peak-amplitude scale with square-root compression
// for readable quiet detail. Never normalize the two traces independently.
export function waveformHeight(peak: number) {
  return peak <= 0.002 ? 0 : Math.sqrt(Math.min(1, Math.max(0, peak)));
}

export function waveformPath(peaks: number[], start: number, end: number, offset = 0) {
  const points: [number, number][] = [];
  const bins = Math.min(4000, Math.max(2, Math.ceil((end - start) / waveformStep)));
  for (let i = 0; i < bins; i++) {
    const first = Math.floor((start + (end - start) * i / bins - offset) / waveformStep);
    const from = Math.max(0, first);
    const to = Math.min(peaks.length, Math.max(first + 1, Math.ceil((start + (end - start) * (i + 1) / bins - offset) / waveformStep)));
    let amplitude = 0;
    for (let j = from; j < to; j++) amplitude = Math.max(amplitude, peaks[j]);
    points.push([i * 1000 / (bins - 1), waveformHeight(amplitude) * 38]);
  }
  return 'M0 40 ' + points.map(([x, y]) => `L${x.toFixed(1)} ${(40 - y).toFixed(1)}`).join(' ') + ' ' +
    points.reverse().map(([x, y]) => `L${x.toFixed(1)} ${(40 + y).toFixed(1)}`).join(' ') + ' Z';
}
