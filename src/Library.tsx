import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useContent } from './app/ContentProvider';
import { useLanguage } from './i18n';
import { searchScenes } from './scene-search';
import { AppHeader } from './app/AppHeader';
import { Icon } from './shared/ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CategoryTabs } from './app/CategoryTabs';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

export function Library({ onChoose, folder, onFolderChange }: { onChoose: (slug: string, draftId?: string) => void; folder: string; onFolderChange: (folder: string) => void }) {
  const { t } = useTranslation();
  const { clips } = useContent();
  const { language } = useLanguage();
  const [params, setParams] = useSearchParams();
  const categoryScenes = clips.filter(clip => clip.cohort === folder);
  const shows = [...new Set(categoryScenes.map(clip => clip.note))];
  const show = shows.find(title => title === params.get('show')) ?? '';
  const [query, setQuery] = useState('');
  useEffect(() => setQuery(''), [folder, show]);
  const search = useRef<HTMLInputElement>(null);
  const clearSearch = () => { setQuery(''); search.current?.focus(); };
  const scoped = categoryScenes.filter(clip => !show || clip.note === show);
  const visible = searchScenes(scoped, query, clip => t(`content:scenes.${clip.id}.title`, { defaultValue: clip.title }));
  // Search keeps relevance order; browsing gathers each show's scenes together.
  const shelves = query.trim() ? [{ title: '', scenes: visible }] : shows
    .map(title => ({ title, scenes: visible.filter(clip => clip.note === title) }))
    .filter(shelf => shelf.scenes.length);
  const featured = scoped[0];
  const notices = [...new Set((featured ? [featured, ...visible] : visible)
    .map(clip => clip.notices?.[language]?.library).filter((notice): notice is string => !!notice))];
  return <div className="library-shell min-h-dvh bg-paper text-ink">
    <AppHeader />
    <main className="library-main">
      {featured ? <section className="library-feature" aria-labelledby="featured-scene-title">
        <div className="library-feature-copy">
          <h1 id="featured-scene-title" className="font-display">{t(`content:scenes.${featured.id}.title`, { defaultValue: featured.title })}</h1>
          <Button onClick={() => onChoose(featured.slug)} className="h-12 gap-3 px-6 text-base font-semibold">{t("player.startDubbing")}<Icon name="arrow" /></Button>
        </div>
        <img src={featured.poster} alt="" fetchPriority="high" />
      </section> : <h1 className="font-display text-3xl font-bold">{t('navigation.library')}</h1>}
      <section aria-label={t("navigation.library")}>
        <CategoryTabs value={folder} onValueChange={onFolderChange} />
        <div role="group" aria-label={t('library.showsAndFilms')} className="show-filters">
          {['', ...shows].map(title => <Button key={title} variant="secondary" aria-pressed={show === title}
            onClick={() => setParams(previous => {
              const next = new URLSearchParams(previous);
              if (title) next.set('show', title); else next.delete('show');
              return next;
            })}>
            {title || t('library.allShowsAndFilms')}
          </Button>)}
        </div>
        <div className="library-toolbar">
          <div className="library-scope"><h2>{t("navigation.library")}</h2><span>{t("library.sceneCount", { count: visible.length })}</span></div>
          <InputGroup className="library-search h-12 bg-card">
            <InputGroupAddon><Icon name="search" /></InputGroupAddon>
            <InputGroupInput ref={search} type="search" aria-label={t("library.findAScene")} placeholder={t("library.titleCharacterTagOrLine")} value={query} onChange={e => setQuery(e.target.value)} className="h-11 text-base sm:text-sm" />
            {query && <InputGroupAddon align="inline-end"><Button variant="ghost" size="icon" onClick={clearSearch} aria-label={t("library.clearSearch")} className="size-11 p-0"><Icon name="close" /></Button></InputGroupAddon>}
          </InputGroup>
        </div>
        {!visible.length && <Card className="library-empty"><p role="status">{t(categoryScenes.length ? "library.noScenesFound" : 'library.empty')}</p>{!!categoryScenes.length && <><p>{t("library.searchSuggestion")}</p><Button onClick={clearSearch} className="mx-auto mt-5 h-12">{t("library.showAllScenes")}<Icon name="arrow" /></Button></>}</Card>}
        {shelves.map(shelf => <section key={shelf.title} aria-label={shelf.title || undefined} className="show-shelf">
          {shelf.title && <div className="show-heading"><h3>{shelf.title}</h3><span>{t('library.sceneCount', { count: shelf.scenes.length })}</span></div>}
          <ul role="list" className="scene-shelf">{shelf.scenes.map(clip => <li key={clip.slug}>
            <button onClick={() => onChoose(clip.slug)} aria-label={t("library.chooseScene", { title: t(`content:scenes.${clip.id}.title`, { defaultValue: clip.title }) })} className="scene-select">
              <img src={clip.poster} alt="" loading="lazy" decoding="async" />
              <span className="scene-copy"><span role="heading" aria-level={shelf.title ? 4 : 3} className="scene-title font-display">{t(`content:scenes.${clip.id}.title`, { defaultValue: clip.title })}</span></span>
            </button>
          </li>)}</ul>
        </section>)}
      </section>
      {notices.map(notice => <p key={notice} className="library-notice">{notice}</p>)}
    </main>
  </div>;
}
