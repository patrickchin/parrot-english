import { useTranslation } from 'react-i18next';
import { useLayoutEffect, useRef } from 'react';
import type { Scene } from './scene';

export function PreviewSubtitles({ scene, time }: { scene: Scene; time: number }) {
  const { t } = useTranslation();
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLOListElement>(null);
  const next = scene.lines.findIndex(line => line.start > time);
  // Hold the last spoken line through silence until the next turn begins.
  const index = next < 0 ? scene.lines.length - 1 : Math.max(0, next - 1);

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
  }, [index, scene.lines]);

  const text = (line: Scene['lines'][number]) => <>
    <span className="preview-subtitle-speaker">{t(`roles.${line.roleId}.name`, { defaultValue: scene.roles.find(role => role.id === line.roleId)!.name })}</span>
    <p lang="en">{line.text}</p>
    {line.hint && <p lang="zh-CN">{line.hint}</p>}
  </>;

  return <div ref={viewport} role="region" aria-label={t("player.previewSubtitles")} className="preview-subtitles">
    {/* Reserve the longest turn at this width so scrolling never moves the video. */}
    <div className="preview-subtitle-size" aria-hidden="true">{scene.lines.map(line => <div key={line.id}>{text(line)}</div>)}</div>
    <ol ref={track} className="preview-subtitle-track">
      {scene.lines.map((line, i) => <li key={line.id} aria-current={i === index ? 'true' : undefined} style={{ color: `var(--subtitle-speaker-${scene.roles.findIndex(role => role.id === line.roleId)})`, opacity: Math.abs(i - index) > 1 ? 0 : i === index ? 1 : 0.45 }}>
        {text(line)}
      </li>)}
    </ol>
  </div>;
}
