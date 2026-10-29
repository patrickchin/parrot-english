import { useLanguage } from './i18n';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Pack, TimedWord } from './pack';
import { validateWaveform, waveformPath, type ReferenceWaveform } from './waveform';

export function VoiceWaveform({ pack, start, end, time, recordings, recording = false, words, following = false }: {
  pack: Pack; start: number; end: number; time: number;
  recordings: { start: number; peaks: number[] }[]; recording?: boolean;
  words?: TimedWord[]; following?: boolean;
}) {
  const { t } = useLanguage();
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
  const scroller = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLOListElement>(null);
  const [layout, setLayout] = useState({ width: 0, scale: 120, tail: 12, lanes: [] as number[] });
  useLayoutEffect(() => {
    const measure = () => {
      const nodes = labels.current?.querySelectorAll('li > span');
      const width = scroller.current?.clientWidth ?? 0;
      let scale = Math.max(120, (width - 24) / (end - start)), tail = 12;
      let lanes: number[] = [];
      if (nodes && words) {
        const widths = Array.from(nodes, n => n.getBoundingClientRect().width);
        const place = () => {
          const edges: number[] = [];
          return words.map((word, i) => {
            const x = (word.start - start) * scale;
            let lane = edges.findIndex(right => right + 8 <= x);
            if (lane < 0) lane = edges.length;
            edges[lane] = x + widths[i];
            return lane;
          });
        };
        lanes = place();
        // Two rows preserve readable words without excessive horizontal zoom.
        while (Math.max(...lanes) > 1 && scale < 400) { scale += 10; lanes = place(); }
        tail = Math.max(12, widths.at(-1)! - (end - words.at(-1)!.start) * scale + 12);
      }
      setLayout(previous => previous.width === width && previous.scale === scale && previous.tail === tail && previous.lanes.join() === lanes.join() ? previous : { width, scale, tail, lanes });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (scroller.current) observer.observe(scroller.current);
    return () => observer.disconnect();
  }, [words, start, end]);
  const elapsed = Math.min(end - start, Math.max(0, time - start));
  const width = words?.length ? Math.max(layout.width - 12 - layout.tail, (end - start) * layout.scale) : layout.width;
  const gutter = words?.length ? 12 : 0;
  const tail = words?.length ? layout.tail : 0;
  const cursor = elapsed / (end - start) * width;
  useEffect(() => { if (scroller.current) scroller.current.scrollLeft = 0; }, [start, end]);
  useEffect(() => {
    if (!following || !scroller.current) return;
    let next = cursor + gutter - layout.width * 0.35;
    const active = words?.find(word => time >= word.start && time < word.end);
    if (active) next = Math.min(next, (active.start - start) / (end - start) * width);
    scroller.current.scrollLeft = Math.max(0, next);
  }, [following, cursor, gutter, layout.width, words, time, start, end, width]);
  const originalPath = useMemo(() => reference ? waveformPath(reference.peaks, start, end) : '', [reference, start, end]);
  return <section aria-label={t("声音波形对比")} className="mx-auto min-w-0 w-full max-w-4xl">
    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
      <div className="flex items-center gap-5"><span className="flex items-center gap-2"><span className="h-2 w-5 rounded-full bg-brand/70" />{t("原声")}</span><span className="flex items-center gap-2"><span className="h-2 w-5 rounded-full bg-coral" />{recording ? t("你的声音 · 录音中") : t("你的声音")}</span></div>
    </div>
    <div ref={scroller} className="voice-timeline" role="group" aria-label={t('声音与台词时间轴')} tabIndex={words?.length ? 0 : undefined}>
      <div style={{ width: width + gutter + tail, paddingLeft: gutter, paddingRight: tail }}>
        <div className="relative" style={{ width }}>
          <div className="voice-waveform relative overflow-hidden rounded-xl bg-brand/4">
            <div className="absolute inset-x-0 top-1/2 h-px bg-brand/10" />
            {reference && <svg role="img" aria-label={t("原声波形")} viewBox="0 0 1000 80" preserveAspectRatio="none" className="absolute inset-0 h-full w-full"><path d={originalPath} className="fill-brand/22 stroke-brand/70" strokeWidth="0.6" /></svg>}
            {recordings.some(r => r.peaks.length > 0) && <svg role="img" aria-label={t("你的声音波形")} viewBox="0 0 1000 80" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">{recordings.map((r, i) => <path key={i} d={waveformPath(r.peaks, start, end, r.start)} className="fill-coral/25 stroke-coral" strokeWidth="0.75" />)}</svg>}
            {!reference && <p role="status" className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-muted">{error ? t(error) : t("正在准备原声波形…")}</p>}
          </div>
          {words?.length ? <ol ref={labels} aria-label={t('逐词台词')} lang="en" className="timed-words relative" style={{ height: (Math.max(0, ...layout.lanes) + 1) * 32 + 4 }}>
            {words.map((word, index) => <li key={index} aria-current={following && time >= word.start && time < word.end ? 'true' : undefined} className="absolute top-0" style={{ top: (layout.lanes[index] ?? 0) * 32, left: (word.start - start) / (end - start) * 100 + '%' }}>
              <span className="timed-word">{word.text}</span>
            </li>)}
          </ol> : null}
          <div role="progressbar" aria-label={t("配音时间指针")} aria-valuemin={0} aria-valuemax={Number((end - start).toFixed(2))} aria-valuenow={Number(elapsed.toFixed(2))} aria-valuetext={t("{0} / {1} 秒", elapsed.toFixed(1), (end - start).toFixed(1))} style={{ left: cursor }} className="pointer-events-none absolute inset-y-0 w-px bg-ink/80"><span className="absolute -left-1 top-0 h-2.5 w-2.5 rotate-45 bg-ink" /></div>
        </div>
      </div>
    </div>

  </section>;
}
