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

const DUB_GUIDE_WAVEFORMS: Readonly<Record<string, string>> = {
  "five-little-ducks-v2-guide-line-1": "1fdbd674844440000000000000000000",
  "five-little-ducks-v2-guide-line-2": "efdca2072edc65000000000000000000",
  "five-little-ducks-v2-guide-line-3": "7fe944404f52752ff2ed400000000000",
  "five-little-ducks-v2-guide-line-4": "4cb6da67f5a770000000000000000000",
  "five-little-ducks-v2-guide-line-5": "0cf893cca55a00000000000000000000",
  "five-little-ducks-v2-guide-line-8": "9f93aa67e67cc4000000000000000000",
  "five-little-ducks-v2-guide-line-9": "6fabe5fc79d600000000000000000000",
  "five-little-ducks-v2-guide-line-12": "afd85869847d50000000000000000000",
  "five-little-ducks-v2-guide-line-13": "9ceda5fbabdc50000000000000000000",
  "five-little-ducks-v2-guide-line-16": "9b7fb7747ab400000000000000000000",
  "five-little-ducks-v2-guide-line-17": "4f87750c9e7455000000000000000000",
  "five-little-ducks-v2-guide-line-20": "b9ff57c97d546e200000000000000000",
  "five-little-ducks-v2-guide-line-21": "01fdeb7b888940000000000000000000",
  "five-little-ducks-v2-guide-line-23": "1fedcb556202ef4ec3fc2e9600000000",
  "five-little-ducks-v2-guide-line-24": "c7ccb5debbb56fbc0000000000000000",
};

export function getDubGuidePeakBars(audioId: string): number[] {
  const encoded = DUB_GUIDE_WAVEFORMS[audioId];
  return encoded ? Array.from(encoded, (value) => Number.parseInt(value, 16) / 15) : [];
}
