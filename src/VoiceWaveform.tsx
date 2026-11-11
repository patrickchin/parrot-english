import { useLanguage } from './i18n';
import { useEffect, useMemo, useState } from 'react';
import type { LoadState } from './load-state';
import type { Pack } from './pack';
import { validateWaveform, waveformPath, type ReferenceWaveform } from './waveform';

export function VoiceWaveform({ pack, start, end, target, time, recordings, recording = false }: {
  pack: Pack; start: number; end: number; time: number;
  target?: { start: number; end: number };
  recordings: { start: number; peaks: number[] }[]; recording?: boolean;
}) {
  const { t } = useLanguage();
  const [load, setLoad] = useState<LoadState<ReferenceWaveform>>({ status: 'loading' });
  const reference = load.status === 'ready' ? load.value : undefined;
  const error = load.status === 'error' ? load.error : '';
  useEffect(() => {
    const abort = new AbortController();
    setLoad({ status: 'loading' });
    if (!pack.waveform) { setLoad({ status: 'error', error: '此片段暂无原声波形，仍可听原声并录音。' }); return; }
    fetch(pack.base + pack.waveform, { signal: abort.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { const wave = validateWaveform(data); if (Math.abs(wave.duration - pack.duration) > 0.05) throw new Error(); if (!abort.signal.aborted) setLoad({ status: 'ready', value: wave }); })
      .catch(() => { if (!abort.signal.aborted) setLoad({ status: 'error', error: '原声波形暂时无法显示，仍可听原声并录音。' }); });
    return () => abort.abort();
  }, [pack]);
  const elapsed = Math.min(end - start, Math.max(0, time - start));
  const cursor = elapsed / (end - start) * 100;
  const originalPath = useMemo(() => reference ? waveformPath(reference.peaks, start, end) : '', [reference, start, end]);
  const recordedPaths = useMemo(() => recordings.map(r => waveformPath(r.peaks, start, end, r.start)), [recordings, start, end]);
  return <section aria-label={t("声音波形对比")} className="mx-auto min-w-0 w-full max-w-4xl">
    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-5"><span className="flex items-center gap-2"><span className="h-2 w-5 rounded-full bg-brand/70" />{t("原声")}</span><span className="flex items-center gap-2"><span className="h-2 w-5 rounded-full bg-coral" />{recording ? t("你的声音 · 录音中") : t("你的声音")}</span></div>
    </div>
    <div className="voice-waveform relative overflow-hidden rounded-xl bg-brand/4">
      {target && <div role="img" aria-label={t('台词时间范围')} className="pointer-events-none absolute inset-y-0 border-x border-brand/30 bg-brand/8" style={{ left: `${(target.start - start) / (end - start) * 100}%`, width: `${(target.end - target.start) / (end - start) * 100}%` }} />}
      <div className="absolute inset-x-0 top-1/2 h-px bg-brand/10" />
      {reference && <svg role="img" aria-label={t("原声波形")} viewBox="0 0 1000 80" preserveAspectRatio="none" className="absolute inset-0 h-full w-full"><path d={originalPath} className="fill-brand/22 stroke-brand/70" strokeWidth="0.6" /></svg>}
      {recordings.some(r => r.peaks.length > 0) && <svg role="img" aria-label={t("你的声音波形")} viewBox="0 0 1000 80" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">{recordedPaths.map((path, i) => <path key={i} d={path} className="fill-coral/25 stroke-coral" strokeWidth="0.75" />)}</svg>}
      {!reference && <p role="status" className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-muted-foreground">{error ? t(error) : t("正在准备原声波形…")}</p>}
      <div role="progressbar" aria-label={t("配音时间指针")} aria-valuemin={0} aria-valuemax={Number((end - start).toFixed(2))} aria-valuenow={Number(elapsed.toFixed(2))} aria-valuetext={t("{0} / {1} 秒", elapsed.toFixed(1), (end - start).toFixed(1))} style={{ left: `${cursor}%` }} className="pointer-events-none absolute inset-y-0 w-px bg-ink/80"><span className="absolute -left-1 top-0 h-2.5 w-2.5 rotate-45 bg-ink" /></div>
    </div>
  </section>;
}
