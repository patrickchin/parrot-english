import { useState } from 'react';
import { clips, mediaRoot, type ClipSlug } from './catalog';
import { AppHeader } from './app/AppHeader';
import { Button, Icon } from './shared/ui';

export function Library({ onChoose }: { onChoose: (slug: ClipSlug) => void }) {
  const [help, setHelp] = useState(false);
  return <div className="min-h-dvh bg-paper text-ink"><AppHeader onHelp={() => setHelp(v => !v)} />
    <main className="mx-auto max-w-6xl px-4 pt-5 pb-12 sm:px-8 sm:pt-9">
      <h1 className="font-display text-3xl leading-tight font-extrabold sm:text-5xl">今天，给谁配音？</h1><p className="mt-3 text-sm leading-7 text-muted sm:text-base">选个片段，把台词换成你的声音。</p>
      {help && <div className="mt-5 max-w-2xl rounded-2xl border border-brand/15 bg-mint/50 p-5 text-sm leading-7 text-muted"><p>选片段 → 选角色 → 听原声 → 一句一句录 → 看你的版本。</p><p className="mt-2">绿色波形是原声，橙色是你的声音，指针跟着播放和录音移动。录音不会上传；关闭或刷新页面会清空录音。</p></div>}
      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-6 lg:grid-cols-4">{clips.slice(0, 4).map(clip => <article key={clip.slug}>
        <button onClick={() => onChoose(clip.slug)} aria-label={`选择片段：${clip.title}`} className="relative block aspect-[4/3] w-full overflow-hidden rounded-2xl border border-brand/15 bg-mint focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand"><img src={`${mediaRoot}${clip.slug}/${clip.slug}-poster-v1.jpg`} alt="" className="h-full w-full object-cover" /><span className="absolute right-2 bottom-2 flex h-9 w-9 items-center justify-center rounded-full bg-brand/85 text-white"><Icon name="play" className="h-4 w-4" /></span></button>
        <h2 className="mt-3 font-display text-lg font-extrabold">{clip.title}</h2><p className="mt-1 text-xs font-semibold" lang="en">{clip.english}</p><p className="mt-2 text-xs leading-6 text-muted sm:text-sm">{clip.note}</p><a href={clip.source} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-lg text-xs text-muted underline decoration-brand/25 underline-offset-4 focus-visible:outline-3 focus-visible:outline-brand">YouTube 原片 ↗</a>
      </article>)}</div>
      <section aria-label="直接试玩" className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-brand/15 pt-6"><div><h2 className="font-display text-lg font-extrabold">你在找谁？</h2><p className="mt-1 text-sm text-muted">换个故事，试试 Sintel 的对话。</p></div><Button tone="quiet" onClick={() => onChoose('sintel')}>试玩 Sintel<Icon name="arrow" /></Button></section>
      <p className="mt-8 max-w-3xl text-xs leading-6 text-muted">成人原型测试 · 录音只留在本次页面。四个梗片段尚未确认再分发许可；YouTube 链接供查看原片。</p>
    </main>
  </div>;
}
