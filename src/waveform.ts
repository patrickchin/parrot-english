export const waveformStep = 0.02;
export type ReferenceWaveform = { version: 1; duration: number; step: number; peaks: number[] };

export function validateWaveform(value: unknown): ReferenceWaveform {
  const wave = value as ReferenceWaveform;
  if (!wave || wave.version !== 1 || !Number.isFinite(wave.duration) || wave.duration <= 0 || wave.duration > 120 ||
      wave.step !== waveformStep || !Array.isArray(wave.peaks) || wave.peaks.length !== Math.ceil(wave.duration / wave.step) ||
      !wave.peaks.every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error('原声波形暂时无法显示，仍可听原声并录音。');
  return wave;
}

// Both sources use the same dBFS display range. Normalizing each independently
// would make a whisper and a shout look equally loud.
export function waveformHeight(rms: number) {
  return rms <= 0.002 ? 0 : Math.min(1, Math.max(0, (20 * Math.log10(rms) + 54) / 51));
}

export function waveformPath(peaks: number[], start: number, end: number, offset = 0) {
  const points: [number, number][] = [];
  const bins = 240;
  for (let i = 0; i < bins; i++) {
    const first = Math.floor((start + (end - start) * i / bins - offset) / waveformStep);
    const from = Math.max(0, first);
    const to = Math.min(peaks.length, Math.max(first + 1, Math.ceil((start + (end - start) * (i + 1) / bins - offset) / waveformStep)));
    let rms = 0;
    for (let j = from; j < to; j++) rms = Math.max(rms, peaks[j]);
    points.push([i * 1000 / (bins - 1), waveformHeight(rms) * 38]);
  }
  return 'M0 40 ' + points.map(([x, y]) => `L${x.toFixed(1)} ${(40 - y).toFixed(1)}`).join(' ') + ' ' +
    points.reverse().map(([x, y]) => `L${x.toFixed(1)} ${(40 + y).toFixed(1)}`).join(' ') + ' Z';
}
