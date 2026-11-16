import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { AppHeader } from './app/AppHeader';
import { useContent } from './app/ContentProvider';
import { libraryPath, packPath } from './app/routes';
import { useLanguage } from './i18n';
import { Icon } from './shared/ui';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function PackBrowser() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { packs, clips } = useContent();
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
  return <div className="library-shell min-h-dvh bg-paper text-ink">
    <AppHeader />
    <main className="library-main pack-browser">
      <header className="pack-browser-heading">
        <h1 className="font-display">{t('navigation.packs')}</h1>
        <p>{t('packs.introduction')}</p><Link className="library-back" to={libraryPath('all', language)}>{t('library.allScenes')}<Icon name="arrow" /></Link>
      </header>
      {!!packs.length && <div className="pack-filters">
        <label className="pack-query">{t('packs.findPack')}<Input type="search" aria-label={t('packs.findPack')} placeholder={t('packs.searchPlaceholder')} value={query} onChange={event => change(event.target.value)} className="h-12" /></label>
      </div>}
      {packs.length && !visible.length ? <Card className="library-empty"><p role="status">{t('packs.noResults')}</p><Button className="mt-4 h-11" onClick={() => setParams({})}>{t('packs.clearFilters')}</Button></Card> : null}
      {packs.length ? <nav aria-label={t('navigation.packs')} className="pack-grid">
        {visible.map(pack => <Link key={pack.id} to={packPath(pack.id, language)} aria-label={pack.title} className="pack-card">
          <span className="pack-cover">{pack.poster ? <img src={pack.poster} alt="" loading="lazy" decoding="async" /> : <Icon name="collection" className="size-16" />}</span>
          <div className="pack-card-copy">
            <h2 className="font-display"><span>{pack.title}</span><Icon name="arrow" className="size-5 shrink-0" /></h2>
            <p className="pack-description">{pack.description}</p>
            <p className="pack-meta"><span>{t('packs.uploadedBy', { uploader: pack.uploader })}</span><span>{t('library.sceneCount', { count: pack.sceneCount })}</span></p>
          </div>
        </Link>)}
      </nav> : <Card className="library-empty"><p role="status">{t('packs.emptyTitle')}</p><p>{t('packs.emptyDescription')}</p></Card>}
      {notices.map(notice => <p key={notice} className="library-notice">{notice}</p>)}
    </main>
  </div>;
}
