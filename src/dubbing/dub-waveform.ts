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
  "old-macdonald-v1-guide-line-1": "dfc8d3287b3109a97a88200000000000",
  "old-macdonald-v1-guide-line-2": "ee8eb7867e72099a76caf60000000000",
  "old-macdonald-v1-guide-line-3": "dfdfcbde900000000000000000000000",
  "old-macdonald-v1-guide-line-4": "fa5ca6ff200000000000000000000000",
  "old-macdonald-v1-guide-line-5": "8c994007fc5310000000000000000000",
  "old-macdonald-v1-guide-line-6": "ff634aaa820000000000000000000000",
  "old-macdonald-v1-guide-line-9": "9cb5b95647fb410acb9cc90000000000",
  "old-macdonald-v1-guide-line-10": "985f5e55501000000000000000000000",
  "old-macdonald-v1-guide-line-11": "ffef4ec4320000000000000000000000",
  "old-macdonald-v1-guide-line-12": "aecf4118eb8a20000000000000000000",
  "old-macdonald-v1-guide-line-13": "ff53460dd56d41000000000000000000",
  "old-macdonald-v1-guide-line-16": "aef9c9698778310089bd4778caa95000",
  "old-macdonald-v1-guide-line-17": "cc2fb687000000000000000000000000",
  "old-macdonald-v1-guide-line-18": "fb966430000000000000000000000000",
  "old-macdonald-v1-guide-line-19": "9a8a2102fa5320000000000000000000",
  "old-macdonald-v1-guide-line-20": "ff844a26346854000000000000000000",
  "old-macdonald-v1-guide-line-23": "fda7d3778d30078c767ddca400000000",
  "old-macdonald-v1-guide-line-24": "796fbe59500000000000000000000000",
  "old-macdonald-v1-guide-line-25": "675f2c3cb20000000000000000000000",
  "old-macdonald-v1-guide-line-26": "4ca81017f95100000000000000000000",
  "old-macdonald-v1-guide-line-27": "dfb66ee1a71000000000000000000000",
  "old-macdonald-v1-guide-line-30": "bdcb8b4886787200cdc7dff700000000",
  "old-macdonald-v1-guide-line-31": "786cfed9a30000000000000000000000",
  "old-macdonald-v1-guide-line-32": "7affc54ab10000000000000000000000",
  "old-macdonald-v1-guide-line-33": "5fceb2179a8300000000000000000000",
  "old-macdonald-v1-guide-line-34": "fe79646bd53000000000000000000000",
  "twinkle-twinkle-v1-guide-line-1": "4cce8ba8597efa000000000000000000",
  "twinkle-twinkle-v1-guide-line-2": "9ffd8545642768330000000000000000",
  "twinkle-twinkle-v1-guide-line-3": "fefb6a74ddc740000000000000000000",
  "twinkle-twinkle-v1-guide-line-4": "8db8fb9a93c400000000000000000000",
  "row-row-row-your-boat-v1-guide-line-1": "4fed3cd632de9aa63000000000000000",
  "row-row-row-your-boat-v1-guide-line-2": "7fb9eb95550000000000000000000000",
  "row-row-row-your-boat-v1-guide-line-3": "8fb5da76643431000000000000000000",
  "row-row-row-your-boat-v1-guide-line-4": "5fb67877500000000000000000000000",
  "mary-had-a-little-lamb-v1-guide-line-1": "9fe45479ba5000000000000000000000",
  "mary-had-a-little-lamb-v1-guide-line-2": "8c8feccb750000000000000000000000",
  "mary-had-a-little-lamb-v1-guide-line-4": "a49e542ecff277500000000000000000",
  "mary-had-a-little-lamb-v1-guide-line-5": "efe55acca31000000000000000000000",
  "mary-had-a-little-lamb-v1-guide-line-6": "9eee4300ef6320000000000000000000",
  "mary-had-a-little-lamb-v1-guide-line-8": "0bfb5567a73000000000000000000000",
  "humpty-dumpty-v1-guide-line-1": "f58d343a78a200000000000000000000",
  "humpty-dumpty-v1-guide-line-2": "2f65f332c55d97520000000000000000",
  "humpty-dumpty-v1-guide-line-3": "0fbb9744155a99a97200000000000000",
  "humpty-dumpty-v1-guide-line-4": "bc7fde86dc88b5000000000000000000",
};

export function getDubGuidePeakBars(audioId: string): number[] {
  const encoded = DUB_GUIDE_WAVEFORMS[audioId];
  return encoded ? Array.from(encoded, (value) => Number.parseInt(value, 16) / 15) : [];
}
