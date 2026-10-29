import { useLanguage } from './i18n';
import { useState } from 'react';
import { memeClips, mediaRoot, type ClipSlug } from './catalog';
import { AppHeader } from './app/AppHeader';
import { Icon } from './shared/ui';

export function Library({ onChoose }: { onChoose: (slug: ClipSlug) => void }) {
  const { t } = useLanguage();
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try { return localStorage.getItem('parrotbook-library-view') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  const chooseView = (next: 'grid' | 'list') => {
    setView(next);
    try { localStorage.setItem('parrotbook-library-view', next); } catch { /* View switching also works without storage. */ }
  };
  const visible = memeClips.filter(clip => [clip.title, t(clip.title), clip.english, clip.note].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="min-h-dvh bg-paper text-ink"><AppHeader onHelp={() => setHelp(v => !v)} />
    <main className="mx-auto max-w-6xl px-4 pt-5 pb-12 sm:px-8 sm:pt-9">
      <h1 className="font-display text-3xl leading-tight font-extrabold sm:text-5xl">{t("今天，给谁配音？")}</h1>
      {help && <div className="mt-5 max-w-2xl rounded-2xl border border-brand/15 bg-mint/50 p-5 text-sm leading-7 text-muted"><p>{t("选片段 → 选角色 → 听原声 → 一句一句录 → 看你的版本。")}</p><p className="mt-2">{t("绿色波形是原声，橙色是你的声音，指针跟着播放和录音移动。录音不会上传；关闭或刷新页面会清空录音。")}</p></div>}
      <div className="mt-6 flex items-center gap-3">
        <input type="search" aria-label={t('查找片段')} placeholder={t('找片段或台词')} value={query} onChange={e => setQuery(e.target.value)} className="min-h-12 min-w-0 flex-1 max-w-md rounded-xl border border-brand/30 bg-transparent px-4 text-base focus-visible:outline-3 focus-visible:outline-brand" />
        <div role="group" aria-label={t('片段视图')} className="ml-auto flex shrink-0 gap-1 rounded-xl border border-brand/30 p-1">
          {(['grid', 'list'] as const).map(mode => <button key={mode} aria-label={t(mode === 'grid' ? '网格视图' : '列表视图')} aria-pressed={view === mode} onClick={() => chooseView(mode)} className="min-h-11 min-w-14 rounded-lg px-3 text-sm font-bold transition-colors hover:bg-mint focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand aria-pressed:bg-brand aria-pressed:text-white">{t(mode === 'grid' ? '网格' : '列表')}</button>)}
        </div>
      </div>
      {!visible.length && <p role="status" className="mt-6 text-muted">{t('没有找到片段。')}</p>}
      <ul role="list" className={view === 'list' ? 'mt-6 divide-y divide-brand/15 border-y border-brand/15' : 'mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-6 lg:grid-cols-4'}>{visible.map(clip => <li key={clip.slug}>
        {view === 'list' ? <button onClick={() => onChoose(clip.slug)} aria-label={t("选择片段：{0}", t(clip.title))} className="flex w-full items-center gap-3 rounded-lg py-3 text-left hover:bg-mint/40 focus-visible:outline-3 focus-visible:outline-brand sm:gap-5 sm:px-3">
          <img src={`${mediaRoot}${clip.slug}/${clip.slug}-poster-v1.jpg`} alt="" loading="lazy" decoding="async" className="aspect-video w-24 shrink-0 rounded-lg bg-mint object-cover sm:w-36" />
          <span className="min-w-0 flex-1"><span className="block font-display text-base font-extrabold sm:text-xl">{t(clip.title)}</span><span lang="en" className="mt-1 block text-sm text-muted sm:text-base">{clip.english}</span></span>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white"><Icon name="play" className="h-4 w-4" /></span>
        </button> : <>
          <button onClick={() => onChoose(clip.slug)} aria-label={t("选择片段：{0}", t(clip.title))} className="relative block aspect-[4/3] w-full overflow-hidden rounded-2xl border border-brand/15 bg-mint focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand"><img src={`${mediaRoot}${clip.slug}/${clip.slug}-poster-v1.jpg`} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /><span className="absolute right-2 bottom-2 flex h-9 w-9 items-center justify-center rounded-full bg-brand/85 text-white"><Icon name="play" className="h-4 w-4" /></span></button>
          <h2 className="mt-3 font-display text-lg font-extrabold">{t(clip.title)}</h2>
        </>}
      </li>)}</ul>
      <p className="mt-6 max-w-3xl text-xs leading-6 text-muted">{t("成人原型测试 · 录音不上传，关闭或刷新清空。影视梗片段尚未确认再分发许可。")}</p>
    </main>
  </div>;
}
