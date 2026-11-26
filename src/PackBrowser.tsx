import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { AppHeader } from './app/AppHeader';
import { ContentPoster } from './app/ContentPoster';
import { SceneCard, ShowCard } from './app/BrowseCards';
import { useContent } from './app/ContentProvider';
import { libraryPath, packPath, scenePath } from './app/routes';
import { useSceneNavigation } from './app/useSceneNavigation';
import { browseShelves, type Shelf } from './browse';
import type { Clip } from './content-pack';
import { useLanguage } from './i18n';
import { searchScenes } from './scene-search';
import { Icon } from './shared/ui';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

const shelfSize = 4;

export function PackBrowser() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const navigation = useSceneNavigation();
  const { packs, clips, state } = useContent();
  const featured = state.status === 'ready' ? state.value.featuredScene : undefined;
  const featuredCollection = featured && packs.find(pack => pack.id === featured.packId);
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().trim();
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const showResults = words.length ? packs.filter(pack => words.every(word => normalize([pack.title, pack.franchise].join(' ')).includes(word))) : [];
  const sceneResults = words.length ? searchScenes(clips, query, clip => t(`content:scenes.${clip.id}.title`, { defaultValue: clip.title })) : [];
  const shelves = browseShelves(packs, clips);
  const notices = [...new Set(clips.map(clip => clip.notices?.[language]?.library).filter((notice): notice is string => !!notice))];
  const sceneHref = (clip: Clip) => `${scenePath(clip.slug, undefined, language, clips)}?pack=${encodeURIComponent(clip.packId)}`;
  function change(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value); else next.delete('q');
    setParams(next, { replace: true });
  }
  const shelfTitle = (shelf: Shelf) => shelf.kind === 'section' ? t(shelf.section.title) : shelf.pack.title;
  const shelfId = (shelf: Shelf) => `shelf-${shelf.kind === 'section' ? shelf.section.id : shelf.pack.id}`;
  return <div className="library-shell pack-page min-h-dvh text-ink">
    <AppHeader />
    <main>
      <header className="pack-banner" data-featured={!!featured}>
        <div className="library-main">
          <div className="pack-banner-copy">
            <h1 className="font-display">{t('browse.title')}</h1>
            {!!clips.length && <div className="browse-search">
              <InputGroup className="h-12">
                <InputGroupAddon><Icon name="search" /></InputGroupAddon>
                <InputGroupInput type="search" aria-label={t('browse.search')} placeholder={t('browse.searchPlaceholder')} value={query} onChange={event => change(event.target.value)} className="h-11 text-base" />
                {query && <InputGroupAddon align="inline-end"><Button variant="ghost" size="icon" onClick={() => change('')} aria-label={t('library.clearSearch')} className="size-11 p-0"><Icon name="close" /></Button></InputGroupAddon>}
              </InputGroup>
              <Link className="browse-all" to={libraryPath('all', language)}>{t('library.allScenes')}<Icon name="arrow" /></Link>
            </div>}
          </div>
          {featured && <section aria-labelledby="featured-scene-title">
            <Link className="featured-scene" to={sceneHref(featured)}>
              <ContentPoster src={featured.poster} eager priority />
              <div className="featured-scene-caption">
                <div>
                  <span className="featured-scene-label">{t('packs.featuredScene')}</span>
                  <h2 id="featured-scene-title">{t(`content:scenes.${featured.id}.title`, { defaultValue: featured.title })}</h2>
                  {featuredCollection && <p>{featuredCollection.title}</p>}
                </div>
                <span className="featured-scene-action"><Icon name="mic" />{t('player.startDubbing')}</span>
              </div>
            </Link>
          </section>}
        </div>
        {!featured && <svg className="pack-banner-art" viewBox="105 -25 215 245" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
          <path fill="var(--brand-sky)" d="M118 21 194 -25 264 92 188 138Z" />
          <path fill="var(--highlight)" d="M187 56 330 92 298 219 155 183Z" />
          <path fill="var(--record)" d="M265 75 364 100 344 178 245 153Z" />
        </svg>}
      </header>
      <div className="library-main">
        {!packs.length ? <Card className="library-empty"><p role="status">{t('packs.emptyTitle')}</p><p>{t('packs.emptyDescription')}</p></Card>
          : words.length ? <>
            <p role="status" className="browse-results-count">{t('browse.resultCount', { count: showResults.length + sceneResults.length })}</p>
            {!showResults.length && !sceneResults.length && <Card className="library-empty"><p>{t('library.searchSuggestion')}</p><Button className="mx-auto mt-4 h-11" onClick={() => change('')}>{t('library.clearSearch')}</Button></Card>}
            {!!showResults.length && <section aria-labelledby="show-results" className="browse-shelf">
              <h2 id="show-results" className="browse-shelf-title">{t('browse.shows')}</h2>
              <ul role="list" className="pack-grid">{showResults.map((pack, index) => <li key={pack.id}><ShowCard pack={pack} eager={index < 4} /></li>)}</ul>
            </section>}
            {!!sceneResults.length && <section aria-labelledby="scene-results" className="browse-shelf">
              <h2 id="scene-results" className="browse-shelf-title">{t('browse.scenes')}</h2>
              <ul role="list" className="scene-shelf">{sceneResults.map((clip, index) => <li key={clip.slug}><SceneCard clip={clip} source eager={index < 4} onChoose={() => navigation.navigateTo(sceneHref(clip))} /></li>)}</ul>
            </section>}
          </> : shelves.map((shelf, shelfIndex) => {
            const items = shelf.kind === 'section' ? shelf.shows : shelf.scenes;
            const more = shelf.kind === 'collection' || items.length > shelfSize;
            const href = shelf.kind === 'section' ? libraryPath(shelf.section.id, language) : packPath(shelf.pack.id, language);
            return <section key={shelfId(shelf)} aria-labelledby={shelfId(shelf)} className="browse-shelf">
              <div className="browse-shelf-heading">
                <h2 id={shelfId(shelf)} className="browse-shelf-title">{shelfTitle(shelf)}</h2>
                {more && <Link to={href} className="browse-see-all" aria-label={t('browse.seeAllLabel', { title: shelfTitle(shelf), count: shelf.kind === 'section' ? shelf.shows.length : shelf.scenes.length })}>{t('browse.seeAll')}<Icon name="arrow" /></Link>}
              </div>
              {shelf.kind === 'section'
                ? <ul role="list" className="pack-grid">{shelf.shows.slice(0, shelfSize).map((pack, index) => <li key={pack.id}><ShowCard pack={pack} eager={shelfIndex < 2} priority={shelfIndex === 0 && index === 0 && !featured} /></li>)}</ul>
                : <ul role="list" className="scene-shelf">{shelf.scenes.slice(0, shelfSize).map(clip => <li key={clip.slug}><SceneCard clip={clip} source eager={shelfIndex < 2} onChoose={() => navigation.navigateTo(sceneHref(clip))} /></li>)}</ul>}
            </section>;
          })}
        {notices.map(notice => <p key={notice} className="library-notice">{notice}</p>)}
      </div>
    </main>
  </div>;
}
