import { useLanguage } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { clips, mediaRoot, type ClipSlug } from './catalog';
import { AppHeader } from './app/AppHeader';
import { Icon } from './shared/ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CategoryTabs } from './app/CategoryTabs';
import { SavedDubs } from './app/SavedDubs';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';

export function Library({ onChoose, folder, onFolderChange }: { onChoose: (slug: ClipSlug, draftId?: string) => void; folder: string; onFolderChange: (folder: string) => void }) {
  const { t } = useLanguage();
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => setQuery(''), [folder]);
  const search = useRef<HTMLInputElement>(null);
  const clearSearch = () => { setQuery(''); search.current?.focus(); };
  const visible = clips.filter(clip => clip.cohort === folder).filter(clip => [clip.title, t(clip.title), clip.english, clip.note, clip.slug.replaceAll('-', ' ')].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const featured = clips.find(clip => clip.cohort === folder)!;
  return <div className="library-shell min-h-dvh bg-paper text-ink">
    <AppHeader onHelp={() => setHelp(v => !v)} helpExpanded={help} helpControls="library-help" />
    <main className="library-main">
      <section className="library-feature" aria-labelledby="featured-scene-title">
        <div className="library-feature-copy">
          <h1 id="featured-scene-title" className="font-display">{t(featured.title)}</h1>
          <Button onClick={() => onChoose(featured.slug)} className="h-12 gap-3 px-6 text-base font-semibold">{t('开始配音')}<Icon name="arrow" /></Button>
        </div>
        <img src={featured.poster} alt="" fetchPriority="high" />
      </section>
      <SavedDubs onChoose={onChoose} />
      {help && <aside id="library-help" className="library-help" aria-label={t('怎么配音？')}>
        <h2>{t('给电影，换上你的声音。')}</h2>
        <p>{t('选片段 → 选角色 → 听原声 → 一句一句录 → 看你的版本。')}</p>
        <p>{t('绿色波形是原声，橙色是你的声音，指针跟着播放和录音移动。配音会自动保存在此浏览器，不会上传。')}</p>
      </aside>}
      <section aria-label={t('片段库')}>
        <CategoryTabs value={folder} onValueChange={onFolderChange} />
        <div className="library-toolbar">
          <div className="library-scope"><h2>{t('片段库')}</h2><span>{t('{0} 个片段', visible.length)}</span></div>
          <InputGroup className="library-search h-12 bg-card">
            <InputGroupAddon><Icon name="search" /></InputGroupAddon>
            <InputGroupInput ref={search} type="search" aria-label={t('查找片段')} placeholder={t('找片段或台词')} value={query} onChange={e => setQuery(e.target.value)} className="h-11 text-base sm:text-sm" />
            {query && <InputGroupAddon align="inline-end"><InputGroupButton onClick={clearSearch} aria-label={t('清除搜索')} size="icon-sm" className="size-11"><Icon name="close" /></InputGroupButton></InputGroupAddon>}
          </InputGroup>
        </div>
        {!visible.length && <Card className="library-empty"><p role="status">{t('没有找到片段。')}</p><p>{t('换个片名，或试试记得的那句台词。')}</p><Button onClick={clearSearch} className="mx-auto mt-5 h-12">{t('查看全部片段')}<Icon name="arrow" /></Button></Card>}
        <ul role="list" className="scene-shelf">{visible.map(clip => <li key={clip.slug}>
          <button onClick={() => onChoose(clip.slug)} aria-label={t('选择片段：{0}', t(clip.title))} className="scene-select">
            <img src={clip.poster ?? `${mediaRoot}${clip.slug}/${clip.slug}-poster-v1.jpg`} alt="" loading="lazy" decoding="async" />
            <span className="scene-copy"><span role="heading" aria-level={2} className="scene-title font-display">{t(clip.title)}</span><span lang="en" className="scene-line">{clip.english}</span></span>
          </button>
        </li>)}</ul>
      </section>
      <p className="library-notice">{t('成人原型测试 · 配音保存在此浏览器，不会上传。影视梗片段尚未确认再分发许可。')}</p>
    </main>
  </div>;
}
