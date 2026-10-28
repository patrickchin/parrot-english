import { useState } from 'react';
import { clips, type ClipSlug } from './catalog';
import { AppHeader } from './app/AppHeader';
import { Icon } from './shared/ui';

export function Library({ onChoose }: { onChoose: (slug: ClipSlug) => void }) {
  const [help, setHelp] = useState(false);
  return <div className="min-h-dvh bg-paper text-ink"><AppHeader onHelp={() => setHelp(v => !v)} /><main className="mx-auto max-w-7xl px-5 pt-8 pb-12 sm:px-8 sm:pt-12">
    <p className="text-xs font-bold tracking-widest text-blue">小小配音员 / 选个片段</p><h1 className="mt-3 font-display text-4xl leading-tight font-extrabold sm:text-5xl">今天，给谁配音？</h1><p className="mt-4 text-base leading-7 text-muted">熟悉的名场面，换成你的声音。</p>
    {help && <div className="mt-5 max-w-2xl rounded-2xl bg-white p-5 text-sm leading-7 text-muted"><p>选片段 → 选角色 → 听原声 → 一句一句录 → 看你的版本。</p><p className="mt-2">「你在找谁？」可以直接试玩。四个梗片段先从设备载入视频，录音和文件都不会上传。关闭或刷新页面会清空录音。</p></div>}
    <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{clips.slice(0, 4).map(clip => <article key={clip.slug} className="overflow-hidden rounded-3xl bg-white shadow-[0_8px_28px_-22px_#19284250]">
      <button onClick={() => onChoose(clip.slug)} aria-label={`选择片段：${clip.title}`} className={`relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden ${clip.colour} focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-blue`}><Artwork kind={clip.art} /><span className="absolute bottom-3 left-4 rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-bold">{import.meta.env.DEV ? '本地测试片段' : '从设备载入'}</span></button>
      <div className="p-5"><h2 className="font-display text-xl font-extrabold">{clip.title}</h2><p className="mt-1 text-xs font-semibold text-blue" lang="en">{clip.english}</p><p className="mt-3 text-sm leading-6 text-muted">{clip.note}</p><div className="mt-4 flex items-center justify-between gap-2"><button onClick={() => onChoose(clip.slug)} className="inline-flex min-h-11 items-center gap-1 rounded-lg text-sm font-bold text-blue focus-visible:outline-3 focus-visible:outline-blue">选这个<Icon name="arrow" className="h-4 w-4" /></button><a href={clip.source} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-lg px-1 text-xs font-semibold text-muted underline decoration-ink/20 underline-offset-4 focus-visible:outline-3 focus-visible:outline-blue">YouTube 原片 ↗</a></div></div>
    </article>)}</div>
    <section aria-label="直接试玩" className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue/15 bg-white/70 p-5 sm:p-6"><div><h2 className="font-display text-lg font-extrabold">先试玩一次？</h2><p className="mt-1 text-sm leading-6 text-muted">「你在找谁？」已经备好原片，点开就能录。</p></div><button onClick={() => onChoose('sintel')} className="flex min-h-12 items-center gap-2 rounded-xl bg-blue px-5 py-3 text-sm font-bold text-white hover:bg-blue/90 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-blue">试玩 Sintel<Icon name="play" /></button></section>
    <p className="mt-6 max-w-3xl text-xs leading-6 text-muted">成人内部测试。四个梗片段的下载副本保留在本地，未发布到服务器；YouTube 链接供查看原片。公开发布素材前需确认相应授权。</p>
  </main></div>;
}

function Artwork({ kind }: { kind: string }) {
  return <svg viewBox="0 0 280 200" className="h-full w-full" aria-hidden="true"><circle cx="145" cy="100" r="72" fill="white" opacity=".24" />
    {kind === 'phone' && <g transform="rotate(-13 140 100)"><rect x="79" y="99" width="122" height="53" rx="18" fill="#192842" /><rect x="105" y="111" width="70" height="25" rx="8" fill="#f2f6fc" /><path d="M91 95c-15-7-23-19-9-30 27-21 88-21 116 0 14 11 6 23-9 30l-18-14c-7-5-55-5-62 0z" fill="#244cda" /><path d="m73 48-14-8m18-5-7-17m134 30 14-8m-18-5 7-17" stroke="#244cda" strokeWidth="6" strokeLinecap="round" /></g>}
    {kind === 'chocolate' && <g transform="rotate(12 140 100)"><rect x="99" y="27" width="83" height="128" rx="7" fill="#633d31" />{[0,1,2].flatMap(y=>[0,1].map(x=><rect key={`${x}${y}`} x={108+x*34} y={35+y*30} width="28" height="24" rx="3" fill="#95634c" />))}<path d="M91 105h100v67H91z" fill="#244cda" /><path d="m91 105 25 13 23-13 23 13 29-13" fill="#e2e5f6" /><text x="141" y="149" textAnchor="middle" fontSize="14" fontWeight="800" fill="white">CHOCOLATE!</text></g>}
    {kind === 'letters' && <g fill="#244cda" fontFamily="system-ui,sans-serif" fontWeight="900"><text x="56" y="134" fontSize="120" transform="rotate(-8 140 100)">W</text><text x="181" y="69" fontSize="45" fill="#192842">?!</text><path d="M188 119h35m-17-17v35" stroke="#192842" strokeWidth="6" strokeLinecap="round" /></g>}
    {kind === 'onion' && <g><path d="M142 57c-51 26-66 41-61 77 5 41 115 44 120 0 5-36-9-51-59-77z" fill="#f4e6b8" stroke="#725f3f" strokeWidth="3" /><path d="M142 58c-22 32-37 67-24 98m24-98c23 32 38 67 25 98m-25-98v99" stroke="#bf9e70" strokeWidth="3" fill="none" /><path d="m142 58-12-29m12 29 16-35m-16 35 3-43" stroke="#477447" strokeWidth="7" strokeLinecap="round" /><path d="m130 164-9 12m19-12v14m11-14 8 12" stroke="#725f3f" strokeWidth="3" /></g>}
  </svg>;
}
