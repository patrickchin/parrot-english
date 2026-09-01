export function getNormalizedPeakBars(
  samples: ArrayLike<number>,
  barCount = 32,
  timelineSampleCount = samples.length,
): number[] {
  const peaks = Array.from({ length: barCount }, (_, barIndex) => {
    const start = Math.floor((barIndex * timelineSampleCount) / barCount);
    const end = Math.floor(((barIndex + 1) * timelineSampleCount) / barCount);
    let peak = 0;
    for (let sampleIndex = start; sampleIndex < Math.min(end, samples.length); sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(samples[sampleIndex] ?? 0));
    }
    return peak;
  });
  const maximum = Math.max(...peaks);

  return maximum ? peaks.map((peak) => peak / maximum) : peaks;
}
