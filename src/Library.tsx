import { useTranslation } from 'react-i18next';
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useContent } from './app/ContentProvider';
import { useLanguage } from './i18n';
import { searchScenes } from './scene-search';
import { AppHeader } from './app/AppHeader';
import { Icon } from './shared/ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { folders } from './catalog';
import { franchiseGroup, franchiseArtwork } from './franchises';
import { libraryPath } from './app/routes';
import { languagePath } from './locale';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

export function Library({ onChoose, folder, directory }: { onChoose: (slug: string, draftId?: string) => void; folder: string; directory: boolean }) {
  const { t } = useTranslation();
  const { clips } = useContent();
  const { language } = useLanguage();
  const [params] = useSearchParams();
  const categoryScenes = clips.filter(clip => folder === 'all' || clip.cohort === folder);
  const shows = [...new Set(categoryScenes.map(clip => franchiseGroup(clip)))];
  const show = shows.find(title => title === params.get('show')) ?? '';
  const scope = `${directory}:${folder}:${show}`;
  const [searchState, setSearchState] = useState({ scope, query: '' });
  if (searchState.scope !== scope) setSearchState({ scope, query: '' });
  const query = searchState.scope === scope ? searchState.query : '';
  const setQuery = (query: string) => setSearchState({ scope, query });
  const search = useRef<HTMLInputElement>(null);
  const clearSearch = () => { setQuery(''); search.current?.focus(); };
  const scoped = categoryScenes.filter(clip => !show || franchiseGroup(clip) === show);
  const visible = searchScenes(scoped, query, clip => t(`content:scenes.${clip.id}.title`, { defaultValue: clip.title }));
  // Search keeps relevance order; browsing gathers each show's scenes together.
  const shelves = query.trim() ? [{ title: '', scenes: visible }] : shows
    .map(title => ({ title, scenes: visible.filter(clip => franchiseGroup(clip) === title) }))
    .filter(shelf => shelf.scenes.length);
  const allPath = libraryPath('all', language);
  const franchises = [...new Set(clips.map(clip => franchiseGroup(clip)))];
  const tags = [
    { id: 'all', label: t('library.allScenes'), href: allPath, scenes: clips, collage: false },
    ...franchises.map(title => ({ id: title, label: title === 'Memes' ? t('library.memes') : title, href: allPath + '?' + new URLSearchParams({ show: title }), scenes: clips.filter(clip => franchiseGroup(clip) === title), collage: title === 'Memes' })),
  ];
  const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase().trim();
  const visibleTags = tags.filter(tag => [tag.label, ...(tag.id === 'Memes' ? tag.scenes.map(clip => clip.note) : [])].some(label => normalize(label).includes(normalize(query))));
  // The catalog leads with the editorial pick, independently of browse filters.
  const featured = clips[0];
  const notices = [...new Set((directory ? clips : featured ? [featured, ...visible] : visible)
    .map(clip => clip.notices?.[language]?.library).filter((notice): notice is string => !!notice))];
  return <div className="library-shell min-h-dvh bg-paper text-ink">
    <AppHeader />
    <main className="library-main" data-directory={directory}>
      {featured ? <section className="library-feature" aria-labelledby="featured-scene-title">
        <div className="library-feature-copy">
          <h1 className="font-display"><span>{t('library.headlineLead')}</span>{' '}<span>{t('library.headlineEnd')}</span></h1>
          <p>{t('library.introduction')}</p>
          <Button variant="highlight" onClick={() => onChoose(featured.slug)} className="library-feature-action h-12 gap-3 px-6 text-base font-semibold">{t("player.startDubbing")}<Icon name="arrow" /></Button>
        </div>
        <div className="library-feature-media">
          <img src={featured.poster} alt="" fetchPriority="high" />
          <div className="library-feature-caption"><h2 id="featured-scene-title">{t(`content:scenes.${featured.id}.title`, { defaultValue: featured.title })}</h2><p>{featured.note}</p></div>
        </div>
      </section> : <h1 className="font-display text-3xl font-bold">{t('navigation.library')}</h1>}
      <section aria-label={t("navigation.library")}>
        <div className="library-toolbar" data-collection={!directory}>
          {!directory && <Link className="library-back" to={languagePath('/', language)} aria-label={t('library.browseTags')}><Icon name="back" /><span>{t('library.browseTags')}</span></Link>}
          <div className="library-scope"><h2>{directory ? t('library.browseTags') : show === 'Memes' ? t('library.memes') : show || (folder === 'all' ? t('library.allScenes') : t(folders.find(tag => tag.value === folder)!.title))}</h2>{!directory && <span>{t("library.sceneCount", { count: visible.length })}</span>}</div>
          <InputGroup className="library-search h-12 bg-card">
            <InputGroupAddon><Icon name="search" /></InputGroupAddon>
            <InputGroupInput ref={search} type="search" aria-label={t(directory ? 'library.findATag' : 'library.findAScene')} placeholder={t(directory ? 'library.searchTags' : 'library.titleCharacterTagOrLine')} value={query} onChange={e => setQuery(e.target.value)} className="h-11 text-base sm:text-sm" />
            {query && <InputGroupAddon align="inline-end"><Button variant="ghost" size="icon" onClick={clearSearch} aria-label={t("library.clearSearch")} className="size-11 p-0"><Icon name="close" /></Button></InputGroupAddon>}
          </InputGroup>
        </div>
        {directory ? <>
          <nav aria-label={t('library.browseTags')} className="show-cards">
            {visibleTags.map(tag => {
              const covers = tag.collage ? [...new Map(tag.scenes.map(clip => [clip.note, clip])).values()].slice(0, 4) : tag.scenes.slice(0, 1);
              const artwork = franchiseArtwork[tag.id];
              return <Link key={tag.id} to={tag.href} aria-label={tag.label}
                aria-description={t('library.sceneCount', { count: tag.scenes.length })} className="show-card">
                <span className="show-card-art" data-collection={tag.id === 'all' ? true : undefined} data-fit={artwork?.fit} data-collage={tag.collage && covers.length > 1 ? true : undefined}>
                  {tag.id === 'all' ? <Icon name="collection" className="size-16" /> : artwork ? <img src={artwork.url} alt="" loading="lazy" decoding="async" /> : covers.map(clip => <img key={clip.slug} src={clip.poster} alt="" loading="lazy" decoding="async" />)}
                </span>
                <span className="show-card-name">{tag.label}</span>
                <span className="show-card-count">{t('library.sceneCount', { count: tag.scenes.length })}</span>
              </Link>;
            })}
          </nav>
          {!visibleTags.length && <Card className="library-empty"><p role="status">{t('library.noTagsFound')}</p><Button onClick={clearSearch} className="mx-auto mt-5 h-12">{t('library.clearSearch')}</Button></Card>}
        </> : <>
        {!visible.length && <Card className="library-empty"><p role="status">{t(categoryScenes.length ? "library.noScenesFound" : 'library.empty')}</p>{!!categoryScenes.length && <><p>{t("library.searchSuggestion")}</p><Button onClick={clearSearch} className="mx-auto mt-5 h-12">{t("library.showAllScenes")}<Icon name="arrow" /></Button></>}</Card>}
        {shelves.map(shelf => <section key={shelf.title} aria-label={shelf.title || undefined} className="show-shelf">
          {shelf.title && !show && <div className="show-heading"><h3>{shelf.title === 'Memes' ? t('library.memes') : shelf.title}</h3><span>{t('library.sceneCount', { count: shelf.scenes.length })}</span></div>}
          <ul role="list" className="scene-shelf">{shelf.scenes.map(clip => <li key={clip.slug}>
            <button onClick={() => onChoose(clip.slug)} aria-label={t("library.chooseScene", { title: t(`content:scenes.${clip.id}.title`, { defaultValue: clip.title }) })} className="scene-select">
              <img src={clip.poster} alt="" loading="lazy" decoding="async" />
              <span className="scene-copy"><span role="heading" aria-level={shelf.title && !show ? 4 : 3} className="scene-title font-display">{t(`content:scenes.${clip.id}.title`, { defaultValue: clip.title })}</span>{franchiseGroup(clip) === 'Memes' && <span className="scene-source">{clip.note}</span>}</span>
            </button>
          </li>)}</ul>
        </section>)}
        </>}
      </section>
      {notices.map(notice => <p key={notice} className="library-notice">{notice}</p>)}
    </main>
  </div>;
}
