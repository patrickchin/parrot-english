import { useEffect, useRef, useState } from "react";
import { getNormalizedPeakBars } from "./dub-waveform";

const BAR_COUNT = 32;
const BASELINE_BARS = Array.from({ length: BAR_COUNT }, () => 0);
const LIVE_ANALYSER_SIZE = 16_384;

function closeAudioContext(context: AudioContext | null) {
  if (!context) return;
  try {
    void Promise.resolve(context.close()).catch(() => {});
  } catch {
    // Waveforms are progressive enhancement; audio capture must keep working.
  }
}

function disconnectAudioNode(node: AudioNode | null) {
  if (!node) return;
  try {
    node.disconnect();
  } catch {
    // The browser may already have released a stopped microphone graph.
  }
}

function Waveform({
  accessibleName,
  bars,
  className,
  narrow,
}: {
  accessibleName: string;
  bars: readonly number[];
  className: string;
  narrow?: boolean;
}) {
  return (
    <svg
      aria-label={accessibleName}
      className={`col-start-1 row-start-1 h-12 w-full short-wide:h-8 ${className}`}
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${BAR_COUNT * 4} 32`}
    >
      {bars.map((peak, index) => {
        const height = 4 + peak * 28;
        return (
          <rect
            fill="currentColor"
            height={height}
            key={index}
            opacity={narrow ? 0.82 : 0.64}
            rx="1"
            width={narrow ? 2 : 3}
            x={index * 4 + (narrow ? 1 : 0.5)}
            y={(32 - height) / 2}
          />
        );
      })}
    </svg>
  );
}

function useRecordedPeakBars(blob: Blob | null, durationMs: number) {
  const [peaks, setPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    setPeaks(null);
    if (!blob) return;
    const AudioContextClass = globalThis.AudioContext;
    if (!AudioContextClass) return;

    let context: AudioContext;
    try {
      context = new AudioContextClass();
    } catch {
      setPeaks(BASELINE_BARS);
      return;
    }
    let cancelled = false;
    let closeRequested = false;
    const closeContext = () => {
      if (closeRequested) return;
      closeRequested = true;
      closeAudioContext(context);
    };
    void blob.arrayBuffer()
      .then((bytes) => context.decodeAudioData(bytes))
      .then((audio) => {
        if (cancelled) return;
        const samples = audio.getChannelData(0);
        const timelineSampleCount = Math.round(audio.sampleRate * durationMs / 1_000);
        setPeaks(getNormalizedPeakBars(samples, BAR_COUNT, timelineSampleCount));
      })
      .catch(() => {
        if (!cancelled) setPeaks(BASELINE_BARS);
      })
      .finally(closeContext);

    return () => {
      cancelled = true;
      closeContext();
    };
  }, [blob, durationMs]);

  return peaks ?? BASELINE_BARS;
}

function useLivePeakBars(stream: MediaStream | null, elapsedMs: number, durationMs: number) {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const samplesRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const [rawPeaks, setRawPeaks] = useState(BASELINE_BARS);
  const [graphReady, setGraphReady] = useState(false);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    setRawPeaks(BASELINE_BARS);
    setGraphReady(false);
    setAvailable(false);
    analyserRef.current = null;
    samplesRef.current = null;
    if (!stream) return;

    const AudioContextClass = globalThis.AudioContext;
    if (!AudioContextClass) return;
    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let cancelled = false;
    try {
      context = new AudioContextClass();
      if (
        typeof context.createAnalyser !== "function"
        || typeof context.createMediaStreamSource !== "function"
      ) {
        closeAudioContext(context);
        return;
      }

      const analyser = context.createAnalyser();
      source = context.createMediaStreamSource(stream);
      analyser.fftSize = LIVE_ANALYSER_SIZE;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      analyserRef.current = analyser;
      samplesRef.current = new Float32Array(analyser.fftSize);
      void context.resume()
        .then(() => {
          if (!cancelled) setGraphReady(true);
        })
        .catch(() => {
          if (cancelled) return;
          analyserRef.current = null;
          samplesRef.current = null;
          disconnectAudioNode(source);
          closeAudioContext(context);
          setGraphReady(false);
          setAvailable(false);
        });
    } catch {
      disconnectAudioNode(source);
      closeAudioContext(context);
      return;
    }

    return () => {
      cancelled = true;
      analyserRef.current = null;
      samplesRef.current = null;
      disconnectAudioNode(source);
      closeAudioContext(context);
    };
  }, [stream]);

  useEffect(() => {
    const analyser = analyserRef.current;
    const samples = samplesRef.current;
    if (!stream || !graphReady || !analyser || !samples) return;
    try {
      analyser.getFloatTimeDomainData(samples);
    } catch {
      setGraphReady(false);
      setAvailable(false);
      analyserRef.current = null;
      return;
    }
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    const barIndex = Math.min(
      BAR_COUNT - 1,
      Math.floor(Math.max(0, elapsedMs) / durationMs * BAR_COUNT),
    );
    setRawPeaks((current) => {
      if (current[barIndex] >= peak) return current;
      const next = [...current];
      next[barIndex] = peak;
      return next;
    });
    setAvailable(true);
  }, [durationMs, elapsedMs, graphReady, stream]);

  return {
    available,
    bars: getNormalizedPeakBars(rawPeaks, BAR_COUNT),
  };
}

export function DubTakeWaveform({
  blob,
  durationMs,
  guidePeakBars,
  recordingElapsedMs,
  recordingStream,
}: {
  blob: Blob | null;
  durationMs: number;
  guidePeakBars: readonly number[];
  recordingElapsedMs: number;
  recordingStream: MediaStream | null;
}) {
  const recordedPeaks = useRecordedPeakBars(blob, durationMs);
  const live = useLivePeakBars(recordingStream, recordingElapsedMs, durationMs);

  return (
    <div aria-label="Waveform comparison" className="grid w-full" role="group">
      <Waveform
        accessibleName="Original audio waveform"
        bars={guidePeakBars.length === BAR_COUNT ? guidePeakBars : BASELINE_BARS}
        className="text-violet-700"
      />
      {recordingStream && live.available ? (
        <Waveform
          accessibleName="Your live recording waveform"
          bars={live.bars}
          className="text-brand-rose"
          narrow
        />
      ) : blob ? (
        <Waveform
          accessibleName="Your recording waveform"
          bars={recordedPeaks}
          className="text-brand-blue"
          narrow
        />
      ) : null}
    </div>
  );
}
