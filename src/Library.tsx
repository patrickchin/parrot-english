import { useLanguage } from './i18n';
import { useState } from 'react';
import { memeClips, mediaRoot, type ClipSlug } from './catalog';
import { AppHeader } from './app/AppHeader';
import { Button, Icon } from './shared/ui';

export function Library({ onChoose }: { onChoose: (slug: ClipSlug) => void }) {
  const { t } = useLanguage();
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState('');
  const visible = memeClips.filter(clip => [clip.title, t(clip.title), clip.english, clip.note].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="min-h-dvh bg-paper text-ink"><AppHeader onHelp={() => setHelp(v => !v)} />
    <main className="mx-auto max-w-6xl px-4 pt-5 pb-12 sm:px-8 sm:pt-9">
      <h1 className="font-display text-3xl leading-tight font-extrabold sm:text-5xl">{t("今天，给谁配音？")}</h1>
      {help && <div className="mt-5 max-w-2xl rounded-2xl border border-brand/15 bg-mint/50 p-5 text-sm leading-7 text-muted"><p>{t("选片段 → 选角色 → 听原声 → 一句一句录 → 看你的版本。")}</p><p className="mt-2">{t("绿色波形是原声，橙色是你的声音，指针跟着播放和录音移动。录音不会上传；关闭或刷新页面会清空录音。")}</p></div>}
      <input type="search" aria-label={t('查找片段')} placeholder={t('找片段或台词')} value={query} onChange={e => setQuery(e.target.value)} className="mt-6 min-h-12 w-full max-w-md rounded-xl border border-brand/30 bg-transparent px-4 text-base focus-visible:outline-3 focus-visible:outline-brand" />
      {!visible.length && <p role="status" className="mt-6 text-muted">{t('没有找到片段。')}</p>}
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-6 lg:grid-cols-4">{visible.map(clip => <article key={clip.slug}>
        <button onClick={() => onChoose(clip.slug)} aria-label={t("选择片段：{0}", t(clip.title))} className="relative block aspect-[4/3] w-full overflow-hidden rounded-2xl border border-brand/15 bg-mint focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand"><img src={`${mediaRoot}${clip.slug}/${clip.slug}-poster-v1.jpg`} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /><span className="absolute right-2 bottom-2 flex h-9 w-9 items-center justify-center rounded-full bg-brand/85 text-white"><Icon name="play" className="h-4 w-4" /></span></button>
        <h2 className="mt-3 font-display text-lg font-extrabold">{t(clip.title)}</h2>
      </article>)}</div>
      <div className="mt-7 border-t border-brand/15 pt-6"><Button tone="quiet" onClick={() => onChoose('sintel')}>{t("试玩 Sintel")}<Icon name="arrow" /></Button></div>
      <p className="mt-6 max-w-3xl text-xs leading-6 text-muted">{t("成人原型测试 · 录音不上传，关闭或刷新清空。影视梗片段尚未确认再分发许可。")}</p>
    </main>
  </div>;
}
