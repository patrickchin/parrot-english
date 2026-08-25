export function getNormalizedPeakBars(
  samples: ArrayLike<number>,
  barCount = 32,
): number[] {
  const peaks = Array.from({ length: barCount }, (_, barIndex) => {
    const start = Math.floor((barIndex * samples.length) / barCount);
    const end = Math.floor(((barIndex + 1) * samples.length) / barCount);
    let peak = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(samples[sampleIndex] ?? 0));
    }
    return peak;
  });
  const maximum = Math.max(...peaks);

  return maximum ? peaks.map((peak) => peak / maximum) : peaks;
}
