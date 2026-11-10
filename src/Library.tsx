import { useLanguage } from './i18n';
import { useRef, useState } from 'react';
import { memeClips, mediaRoot, type ClipSlug } from './catalog';
import { AppHeader } from './app/AppHeader';
import { Icon } from './shared/ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export function Library({ onChoose }: { onChoose: (slug: ClipSlug) => void }) {
  const { t } = useLanguage();
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try { return localStorage.getItem('parrotbook-library-view') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  const chooseView = (next: 'grid' | 'list') => {
    setView(next);
    try { localStorage.setItem('parrotbook-library-view', next); } catch { /* View switching also works without storage. */ }
  };
  const clearSearch = () => { setQuery(''); search.current?.focus(); };
  const visible = memeClips.filter(clip => [clip.title, t(clip.title), clip.english, clip.note].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const featured = memeClips[0];
  return <div className="library-shell min-h-dvh bg-paper text-ink">
    <AppHeader onHelp={() => setHelp(v => !v)} helpExpanded={help} helpControls="library-help" />
    <main className="library-main">
      <section className="library-feature" aria-labelledby="featured-scene-title">
        <div className="library-feature-copy">
          <h1 id="featured-scene-title" className="font-display">{t(featured.title)}</h1>
          <Button onClick={() => onChoose(featured.slug)} className="h-12 gap-3 px-6 text-base font-semibold">{t('开始配音')}<Icon name="arrow" /></Button>
        </div>
        <img src={`${mediaRoot}${featured.slug}/${featured.slug}-poster-v1.jpg`} alt="" fetchPriority="high" />
      </section>
      {help && <aside id="library-help" className="library-help" aria-label={t('怎么配音？')}>
        <h2>{t('给电影，换上你的声音。')}</h2>
        <p>{t('选片段 → 选角色 → 听原声 → 一句一句录 → 看你的版本。')}</p>
        <p>{t('绿色波形是原声，橙色是你的声音，指针跟着播放和录音移动。录音不会上传；关闭或刷新页面会清空录音。')}</p>
      </aside>}
      <section aria-label={t('片段库')}>
        <div className="library-toolbar">
          <div className="library-scope"><h2>{t('片段库')}</h2><span>{t('{0} 个片段', visible.length)}</span></div>
          <InputGroup className="library-search h-12 bg-card">
            <InputGroupAddon><Icon name="search" /></InputGroupAddon>
            <InputGroupInput ref={search} type="search" aria-label={t('查找片段')} placeholder={t('找片段或台词')} value={query} onChange={e => setQuery(e.target.value)} className="h-11 text-base sm:text-sm" />
            {query && <InputGroupAddon align="inline-end"><InputGroupButton onClick={clearSearch} aria-label={t('清除搜索')} size="icon-sm" className="size-11"><Icon name="close" /></InputGroupButton></InputGroupAddon>}
          </InputGroup>
          <ToggleGroup value={[view]} onValueChange={values => { const next = values[0]; if (next === 'grid' || next === 'list') chooseView(next); }} aria-label={t('片段视图')} className="library-views" spacing={1}>
            {(['grid', 'list'] as const).map(mode => <ToggleGroupItem key={mode} value={mode} aria-label={t(mode === 'grid' ? '网格视图' : '列表视图')} className="h-11 min-w-11 px-3 aria-pressed:bg-primary aria-pressed:text-primary-foreground"><Icon name={mode} /><span>{t(mode === 'grid' ? '网格' : '列表')}</span></ToggleGroupItem>)}
          </ToggleGroup>
        </div>
        {!visible.length && <Card className="library-empty"><p role="status">{t('没有找到片段。')}</p><p>{t('换个片名，或试试记得的那句台词。')}</p><Button onClick={clearSearch} className="mx-auto mt-5 h-12">{t('查看全部片段')}<Icon name="arrow" /></Button></Card>}
        <ul role="list" className="scene-shelf" data-view={view}>{visible.map(clip => <li key={clip.slug}>
          <button onClick={() => onChoose(clip.slug)} aria-label={t('选择片段：{0}', t(clip.title))} className="scene-select">
            <img src={`${mediaRoot}${clip.slug}/${clip.slug}-poster-v1.jpg`} alt="" loading="lazy" decoding="async" />
            <span className="scene-copy"><span role="heading" aria-level={2} className="scene-title font-display">{t(clip.title)}</span><span lang="en" className="scene-line">{clip.english}</span></span>
          </button>
        </li>)}</ul>
      </section>
      <p className="library-notice">{t('成人原型测试 · 录音不上传，关闭或刷新清空。影视梗片段尚未确认再分发许可。')}</p>
    </main>
  </div>;
}
