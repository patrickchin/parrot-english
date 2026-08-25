import { useEffect, useState } from "react";
import { getNormalizedPeakBars } from "./dub-waveform";

const BAR_COUNT = 32;
const BASELINE_BARS = Array.from({ length: BAR_COUNT }, () => 0);

export function DubTakeWaveform({ blob }: { blob: Blob }) {
  const [peaks, setPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    const AudioContextClass = globalThis.AudioContext;
    if (!AudioContextClass) return;

    let cancelled = false;
    let closeRequested = false;
    const context = new AudioContextClass();
    const closeContext = () => {
      if (closeRequested) return;
      closeRequested = true;
      void context.close().catch(() => {});
    };
    void blob.arrayBuffer()
      .then((bytes) => context.decodeAudioData(bytes))
      .then((audio) => {
        if (!cancelled) setPeaks(getNormalizedPeakBars(audio.getChannelData(0), BAR_COUNT));
      })
      .catch(() => {
        if (!cancelled) setPeaks(BASELINE_BARS);
      })
      .finally(closeContext);

    return () => {
      cancelled = true;
      closeContext();
    };
  }, [blob]);

  const bars = peaks ?? BASELINE_BARS;

  return (
    <svg
      aria-label="Your recording waveform"
      className="h-12 w-full text-brand-blue"
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${BAR_COUNT * 4} 32`}
    >
      {bars.map((peak, index) => {
        const height = 4 + peak * 28;
        return <rect fill="currentColor" height={height} key={index} rx="1" width="2" x={index * 4 + 1} y={(32 - height) / 2} />;
      })}
    </svg>
  );
}
