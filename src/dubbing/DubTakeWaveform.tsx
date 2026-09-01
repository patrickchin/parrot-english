import { useEffect, useRef, useState, type ReactNode } from "react";
import { DubMelodyLane, getDubPlayheadPercent } from "./DubKaraokeGuide";
import {
  DUB_PEAK_BAR_COUNT,
  EMPTY_DUB_PEAK_BARS,
  getNormalizedPeakBars,
} from "./dub-waveform";
import type { DubDefinition, DubLine } from "./rhyme-catalog";

const BAR_COUNT = DUB_PEAK_BAR_COUNT;
const BASELINE_BARS = EMPTY_DUB_PEAK_BARS;
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

export function DubWaveform({
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
      className={`pointer-events-none h-10 w-full short-wide:h-5 ${className}`}
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

function WaveformTrack({
  accessibleName,
  action,
  bars,
  className,
  label,
  narrow = false,
  playhead,
}: {
  accessibleName: string;
  action?: ReactNode;
  bars: readonly number[];
  className: string;
  label: string;
  narrow?: boolean;
  playhead: number | null;
}) {
  return (
    <div
      aria-label={`${label} track`}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-white/80 p-2 short-wide:gap-1 short-wide:p-1"
      role="group"
    >
      <div className="grid min-w-0 gap-0.5">
        <span className="text-xs font-black leading-none text-brand-ink">{label}</span>
        <div className="relative grid min-w-0 overflow-hidden rounded-lg bg-slate-100 px-1">
          <DubWaveform
            accessibleName={accessibleName}
            bars={bars}
            className={className}
            narrow={narrow}
          />
          {playhead === null ? null : (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-brand-ink"
              style={{ left: `${playhead}%` }}
            />
          )}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
    </div>
  );
}

export function DubTakeWaveform({
  blob,
  definition,
  elapsedMs,
  hasRecording = false,
  line,
  originalAction,
  recordedPeakBars,
  recordingActions,
  recordingStream,
}: {
  blob: Blob | null;
  definition: DubDefinition;
  elapsedMs: number | null;
  hasRecording?: boolean;
  line: DubLine;
  originalAction?: ReactNode;
  recordedPeakBars?: readonly number[] | null;
  recordingActions?: ReactNode;
  recordingStream: MediaStream | null;
}) {
  const live = useLivePeakBars(recordingStream, elapsedMs ?? 0, line.durationMs);
  const playhead = getDubPlayheadPercent(line, elapsedMs);
  const recordingAvailable = hasRecording
    || blob !== null
    || recordedPeakBars !== null && recordedPeakBars !== undefined;
  const learnerBars = recordingStream && live.available
    ? live.bars
    : recordedPeakBars ?? BASELINE_BARS;
  const learnerName = recordingStream && live.available
    ? "Your live recording waveform"
    : "Your recording waveform";

  return (
    <div aria-label="Waveform and melody guide" className="grid w-full gap-1 short-wide:gap-0.5" role="group">
      <WaveformTrack
        accessibleName="Original audio waveform"
        action={originalAction}
        bars={line.guidePeakBars.length === BAR_COUNT ? line.guidePeakBars : BASELINE_BARS}
        className="text-violet-700"
        label="Original audio"
        playhead={playhead}
      />
      <WaveformTrack
        accessibleName={learnerName}
        action={recordingActions}
        bars={learnerBars}
        className={recordingStream && live.available
          ? "text-brand-rose"
          : recordingAvailable
            ? "text-brand-blue"
            : "text-slate-300"}
        label="Your recording"
        narrow
        playhead={playhead}
      />
      <DubMelodyLane definition={definition} elapsedMs={elapsedMs} line={line} showPlayhead={false} />
    </div>
  );
}
