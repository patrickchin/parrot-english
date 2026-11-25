import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { AppHeader } from './app/AppHeader';
import { ContentPoster } from './app/ContentPoster';
import { useContent } from './app/ContentProvider';
import { libraryPath, packPath, scenePath } from './app/routes';
import { useLanguage } from './i18n';
import { Icon } from './shared/ui';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button, buttonVariants } from '@/components/ui/button';

export function PackBrowser() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { packs, clips, state } = useContent();
  const featured = state.status === 'ready' ? state.value.featuredScene : undefined;
  const featuredCollection = featured && packs.find(pack => pack.id === featured.packId);
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().trim();
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const visible = packs.filter(pack => words.every(word => normalize([pack.title, pack.franchise, pack.uploader].join(' ')).includes(word)));
  const notices = [...new Set(clips.map(clip => clip.notices?.[language]?.library).filter((notice): notice is string => !!notice))];
  function change(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value); else next.delete('q');
    setParams(next, { replace: true });
  }
  return <div className="library-shell pack-page min-h-dvh text-ink">
    <AppHeader />
    <main>
      <header className="pack-banner" data-featured={!!featured}>
        <div className="library-main">
          <div className="pack-banner-copy">
            <h1 className="font-display">{t('navigation.packs')}</h1>
            <p>{t('packs.introduction')}</p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link className={buttonVariants({ variant: featured ? 'outline' : 'highlight', className: 'min-h-11 gap-2 whitespace-normal px-5 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring focus-visible:ring-0' })} to={libraryPath('all', language)}>{t('library.allScenes')}<Icon name="arrow" /></Link>
              {clips.some(clip => clip.cohort === 'teens') && <Link className={buttonVariants({ variant: 'outline', className: 'min-h-11 px-4' })} to={libraryPath('teens', language)}>{t('categories.teens')}</Link>}
            </div>
          </div>
          {featured && <section aria-labelledby="featured-scene-title">
            <Link className="featured-scene" to={`${scenePath(featured.slug, undefined, language, [featured])}?pack=${encodeURIComponent(featured.packId)}`}>
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
        {!!packs.length && <div className="pack-filters">
          <label className="pack-query">{t('packs.findPack')}<Input type="search" aria-label={t('packs.findPack')} placeholder={t('packs.searchPlaceholder')} value={query} onChange={event => change(event.target.value)} className="h-12" /></label>
        </div>}
        {packs.length && !visible.length ? <Card className="library-empty"><p role="status">{t('packs.noResults')}</p><Button className="mt-4 h-11" onClick={() => setParams({})}>{t('packs.clearFilters')}</Button></Card> : null}
        {packs.length ? <nav aria-label={t('navigation.packs')} className="pack-grid">
          {visible.map((pack, index) => <Link key={pack.id} to={packPath(pack.id, language)} aria-label={pack.title} className="pack-card">
            <span className="pack-cover">{pack.poster ? <ContentPoster src={pack.poster} eager={index < 2} priority={index === 0 && !featured} /> : <Icon name="collection" className="size-16" />}</span>
            <div className="pack-card-copy">
              <h2 className="scene-title font-display">{pack.title}</h2>
              <p className="pack-meta"><span>{t('packs.uploadedBy', { uploader: pack.uploader })}</span><span>{t('library.sceneCount', { count: pack.sceneCount })}</span></p>
            </div>
          </Link>)}
        </nav> : <Card className="library-empty"><p role="status">{t('packs.emptyTitle')}</p><p>{t('packs.emptyDescription')}</p></Card>}
        {notices.map(notice => <p key={notice} className="library-notice">{notice}</p>)}
      </div>
    </main>
  </div>;
}
