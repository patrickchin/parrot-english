export const DUB_PEAK_BAR_COUNT = 32;
export const EMPTY_DUB_PEAK_BARS = Object.freeze(
  Array.from({ length: DUB_PEAK_BAR_COUNT }, () => 0),
);
export const DUB_PEAK_BARS_HEADER = "X-Parrot-Dub-Peak-Bars";
const MAX_SERIALIZED_DUB_PEAK_BARS_LENGTH = 129;

export function getNormalizedPeakBars(
  samples: ArrayLike<number>,
  barCount = DUB_PEAK_BAR_COUNT,
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

export function isDubPeakBars(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length === DUB_PEAK_BAR_COUNT
    && value.every((peak) =>
      typeof peak === "number"
      && Number.isFinite(peak)
      && peak >= 0
      && peak <= 1
    );
}

export function serializeDubPeakBars(value: unknown): string | null {
  if (!isDubPeakBars(value)) return null;
  return JSON.stringify(value.map((peak) => Math.round(peak * 255)));
}

export function parseDubPeakBars(value: string | null | undefined): number[] | null {
  if (!value || value.length > MAX_SERIALIZED_DUB_PEAK_BARS_LENGTH) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (
    !Array.isArray(parsed)
    || parsed.length !== DUB_PEAK_BAR_COUNT
    || !parsed.every((peak) =>
      typeof peak === "number"
      && Number.isInteger(peak)
      && peak >= 0
      && peak <= 255
    )
  ) {
    return null;
  }
  return parsed.map((peak) => peak / 255);
}

export async function getDubRecordingPeakBars(
  blob: Blob,
  durationMs: number,
  AudioContextClass: typeof AudioContext | undefined = globalThis.AudioContext,
): Promise<number[] | null> {
  if (!AudioContextClass || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  let context: AudioContext;
  try {
    context = new AudioContextClass();
  } catch {
    return null;
  }
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = audio.getChannelData(0);
    if (!Number.isFinite(audio.sampleRate) || audio.sampleRate <= 0) return null;
    const timelineSampleCount = Math.round(audio.sampleRate * durationMs / 1_000);
    return getNormalizedPeakBars(
      samples,
      DUB_PEAK_BAR_COUNT,
      timelineSampleCount,
    );
  } catch {
    return null;
  } finally {
    try {
      await context.close();
    } catch {
      // Waveform metadata is optional; saving the voice clip must still work.
    }
  }
}
