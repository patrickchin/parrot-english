import { useTranslation } from 'react-i18next';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { LoadState } from './load-state';
import type { Scene } from './scene';
import { drawWaveform, validateWaveform, waveformStep, type ReferenceWaveform, type WaveformRecording, type WaveformTimeline } from './waveform';

export function VoiceWaveform({ scene, start, end, target, timeline, recordings, recording, active }: {
  scene: Scene; start: number; end: number; timeline: RefObject<WaveformTimeline>;
  target?: { start: number; end: number };
  recordings: WaveformRecording[]; recording: boolean; active: boolean;
}) {
  const { t } = useTranslation();
  const [load, setLoad] = useState<LoadState<ReferenceWaveform>>({ status: 'loading' });
  const reference = load.status === 'ready' ? load.value : undefined;
  const error = load.status === 'error' ? load.error : '';
  const plot = useRef<HTMLDivElement>(null);
  const originalCanvas = useRef<HTMLCanvasElement>(null);
  const recordedCanvas = useRef<HTMLCanvasElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const abort = new AbortController();
    setLoad({ status: 'loading' });
    if (!scene.waveform) { setLoad({ status: 'error', error: 'waveform.unavailable' }); return; }
    fetch(scene.base + scene.waveform, { signal: abort.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { const wave = validateWaveform(data); if (Math.abs(wave.duration - scene.duration) > 0.05) throw new Error(); if (!abort.signal.aborted) setLoad({ status: 'ready', value: wave }); })
      .catch(() => { if (!abort.signal.aborted) setLoad({ status: 'error', error: "errors.waveformUnavailable" }); });
    return () => abort.abort();
  }, [scene]);
  useLayoutEffect(() => {
    const original = originalCanvas.current!, recorded = recordedCanvas.current!, cursor = playhead.current!;
    const originalContext = original.getContext('2d')!, recordedContext = recorded.getContext('2d')!;
    let width = 0, height = 0, frame = 0, drawnX = 0;
    let capture: WaveformRecording | null = null;
    let announced = '';
    const paintFrame = () => {
      const { time, capture: live } = timeline.current;
      const elapsed = Math.min(end - start, Math.max(0, time - start));
      cursor.style.transform = `translate3d(${Math.min(Math.max(0, width - 1), elapsed / (end - start) * width)}px, 0, 0)`;
      cursor.setAttribute('aria-valuenow', elapsed.toFixed(3));
      const text = elapsed.toFixed(1);
      if (text !== announced) {
        announced = text;
        cursor.setAttribute('aria-valuetext', t('waveform.elapsed', { elapsed: text, duration: (end - start).toFixed(1) }));
      }
      if (recording && live) {
        const until = Math.min(time, live.start + live.peaks.length * waveformStep);
        const nextX = Math.max(0, Math.min(recorded.width, (until - start) / (end - start) * recorded.width));
        if (capture !== live || nextX < drawnX) {
          recordedContext.clearRect(0, 0, recorded.width, height); drawnX = 0; capture = live;
        }
        if (nextX > drawnX) {
          // Revisit the partial last column; all earlier columns are immutable.
          const from = Math.max(0, Math.floor(drawnX) - 1);
          recordedContext.clearRect(from, 0, Math.ceil(nextX) - from, height);
          drawnX = drawWaveform(recordedContext, live, start, end, recorded.width, height, from, until);
        }
      }
    };
    const resize = () => {
      const box = plot.current!.getBoundingClientRect();
      if (!box.width || !box.height) return;
      width = box.width; height = box.height / 2;
      const ratio = window.devicePixelRatio || 1;
      for (const [canvas, context] of [[original, originalContext], [recorded, recordedContext]] as const) {
        canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
        // Sample horizontally at physical-pixel resolution. CSS-pixel bins can
        // shift visible onsets by over 20 ms on a narrow, high-DPI phone.
        context.setTransform(1, 0, 0, canvas.height / height, 0, 0);
        context.fillStyle = getComputedStyle(canvas).color;
      }
      if (reference) drawWaveform(originalContext, { start: 0, peaks: reference.peaks }, start, end, original.width, height);
      if (!recording) for (const take of recordings) drawWaveform(recordedContext, take, start, end, recorded.width, height);
      capture = null; drawnX = 0; paintFrame();
    };
    const tick = () => { paintFrame(); frame = requestAnimationFrame(tick); };
    const observer = new ResizeObserver(resize);
    observer.observe(plot.current!);
    const theme = new MutationObserver(resize);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    resize();
    if (active) frame = requestAnimationFrame(tick);
    return () => { observer.disconnect(); theme.disconnect(); cancelAnimationFrame(frame); };
  }, [reference, recordings, start, end, recording, active, timeline, t]);
  return <section aria-label={t("waveform.voiceWaveformComparison")} className="mx-auto min-w-0 w-full max-w-4xl">
    <div className="voice-comparison">
      <div className="voice-lane-labels text-xs text-muted-foreground">
        <span>{t('player.original')}</span>
        <span className="flex items-center gap-1.5">{t('waveform.yourVoice')}<span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" style={{ visibility: recording ? 'visible' : 'hidden' }} />{recording && <span className="sr-only">{t('player.recording')}</span>}</span>
      </div>
      <div ref={plot} className="voice-waveform relative overflow-hidden rounded-xl bg-brand/4">
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-brand/4" />
        {target && <div role="img" aria-label={t("waveform.targetLineTiming")} className="pointer-events-none absolute inset-y-0 border-x border-brand/30 bg-brand/8" style={{ left: `${(target.start - start) / (end - start) * 100}%`, width: `${(target.end - target.start) / (end - start) * 100}%` }} />}
        <div aria-hidden="true" className="absolute inset-x-0 top-1/4 h-px bg-brand/10" />
        <div aria-hidden="true" className="absolute inset-x-0 top-3/4 h-px bg-brand/10" />
        <canvas ref={originalCanvas} role="img" aria-label={t('waveform.originalAudioWaveform')} hidden={!reference} className="absolute inset-x-0 top-0 h-1/2 w-full text-brand" />
        <canvas ref={recordedCanvas} role="img" aria-label={t('waveform.yourVoiceWaveform')} hidden={!recording && !recordings.some(r => r.peaks.length > 0)} className="absolute inset-x-0 bottom-0 h-1/2 w-full text-coral" />
        {!reference && <p role="status" className="absolute inset-x-0 top-0 flex h-1/2 items-center justify-center px-3 text-center text-xs text-muted-foreground">{error ? t(error, { defaultValue: t('errors.unexpected') }) : t('waveform.loadingTheOriginalWaveform')}</p>}
        <div ref={playhead} role="progressbar" aria-label={t('waveform.dubbingPlayhead')} aria-valuemin={0} aria-valuemax={Number((end - start).toFixed(3))} aria-valuenow={0} className="voice-playhead pointer-events-none absolute inset-y-0 left-0 w-px bg-ink/80"><span className="absolute -left-1 top-0 h-2.5 w-2.5 rotate-45 bg-ink" /></div>
      </div>
    </div>
  </section>;
}
