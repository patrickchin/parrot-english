import { useLayoutEffect, useRef } from 'react';
import { useLanguage } from './i18n';
import type { Pack } from './pack';

export function PreviewSubtitles({ pack, time }: { pack: Pack; time: number }) {
  const { t } = useLanguage();
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLOListElement>(null);
  const next = pack.lines.findIndex(line => line.start > time);
  // Hold the last spoken line through silence until the next turn begins.
  const index = next < 0 ? pack.lines.length - 1 : Math.max(0, next - 1);

  useLayoutEffect(() => {
    const list = track.current!;
    const center = () => {
      const row = list.children[index] as HTMLElement;
      list.style.transform = `translateY(${-row.offsetTop - row.offsetHeight / 2}px)`;
      const view = viewport.current!;
      view.parentElement!.style.setProperty('--subtitle-height', `${view.offsetHeight}px`);
    };
    // Start centered; animate only subsequent turns.
    if (!list.style.transform) {
      list.style.transition = 'none';
      center();
      list.getBoundingClientRect();
      list.style.removeProperty('transition');
    } else center();
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(center);
    });
    observer.observe(list);
    observer.observe(viewport.current!);
    return () => { observer.disconnect(); cancelAnimationFrame(resizeFrame); };
  }, [index, pack.lines]);

  const text = (line: Pack['lines'][number]) => <>
    <span className="preview-subtitle-speaker">{t(pack.roles.find(role => role.id === line.roleId)!.name)}</span>
    <p lang="en">{line.text}</p>
    {line.hint && <p lang="zh-CN">{line.hint}</p>}
  </>;

  return <div ref={viewport} role="region" aria-label={t('原片字幕')} className="preview-subtitles">
    {/* Reserve the longest turn at this width so scrolling never moves the video. */}
    <div className="preview-subtitle-size" aria-hidden="true">{pack.lines.map(line => <div key={line.id}>{text(line)}</div>)}</div>
    <ol ref={track} className="preview-subtitle-track">
      {pack.lines.map((line, i) => <li key={line.id} aria-current={i === index ? 'true' : undefined} style={{ color: `var(--subtitle-speaker-${pack.roles.findIndex(role => role.id === line.roleId)})`, opacity: Math.abs(i - index) > 1 ? 0 : i === index ? 1 : 0.45 }}>
        {text(line)}
      </li>)}
    </ol>
  </div>;
}
