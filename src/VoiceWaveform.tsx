import { useEffect, useState } from 'react';
import type { Pack } from './pack';
import { validateWaveform, waveformPath, type ReferenceWaveform } from './waveform';

export function VoiceWaveform({ pack, start, end, time, recordings, recording = false }: {
  pack: Pack; start: number; end: number; time: number;
  recordings: { start: number; peaks: number[] }[]; recording?: boolean;
}) {
  const [reference, setReference] = useState<ReferenceWaveform>();
  const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    setReference(undefined); setError('');
    if (!pack.waveform) { setError('此片段暂无原声波形，仍可听原声并录音。'); return; }
    fetch(pack.base + pack.waveform, { signal: abort.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { const wave = validateWaveform(data); if (Math.abs(wave.duration - pack.duration) > 0.05) throw new Error(); if (!abort.signal.aborted) setReference(wave); })
      .catch(() => { if (!abort.signal.aborted) setError('原声波形暂时无法显示，仍可听原声并录音。'); });
    return () => abort.abort();
  }, [pack]);
  const elapsed = Math.min(end - start, Math.max(0, time - start));
  return <section aria-label="声音波形对比" className="mx-auto w-full max-w-4xl">
    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
      <div className="flex items-center gap-5"><span className="flex items-center gap-2"><span className="h-2 w-5 rounded-full bg-brand/70" />原声</span><span className="flex items-center gap-2"><span className="h-2 w-5 rounded-full bg-coral" />{recording ? '你的声音 · 录音中' : '你的声音'}</span></div>
      <span>声音强弱 · {Math.round((end - start) * 10) / 10} 秒</span>
    </div>
    <div className="relative h-20 overflow-hidden rounded-xl bg-brand/4 sm:h-24">
      <div className="absolute inset-x-0 top-1/2 h-px bg-brand/10" />
      {reference && <svg role="img" aria-label="原声波形" viewBox="0 0 1000 80" preserveAspectRatio="none" className="absolute inset-0 h-full w-full"><path d={waveformPath(reference.peaks, start, end)} className="fill-brand/22 stroke-brand/70" strokeWidth="1" /></svg>}
      {recordings.some(r => r.peaks.length > 0) && <svg role="img" aria-label="你的声音波形" viewBox="0 0 1000 80" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">{recordings.map((r, i) => <path key={i} d={waveformPath(r.peaks, start, end, r.start)} className="fill-coral/35 stroke-coral" strokeWidth="1.25" />)}</svg>}
      <div role="progressbar" aria-label="配音时间指针" aria-valuemin={0} aria-valuemax={Number((end - start).toFixed(2))} aria-valuenow={Number(elapsed.toFixed(2))} aria-valuetext={`${elapsed.toFixed(1)} / ${(end - start).toFixed(1)} 秒`} style={{ left: `${elapsed / (end - start) * 100}%` }} className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-ink"><span className="absolute -left-1 top-0 h-2.5 w-2.5 rotate-45 bg-ink" /></div>
      {!reference && <p role="status" className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-muted">{error || '正在准备原声波形…'}</p>}
    </div>
  </section>;
}
