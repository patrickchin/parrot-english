import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AppHeader } from './app/AppHeader';
import { useContent } from './app/ContentProvider';
import { packPath } from './app/routes';
import { useLanguage } from './i18n';
import { Icon } from './shared/ui';
import { Card } from '@/components/ui/card';

export function PackBrowser() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { packs } = useContent();
  return <div className="library-shell min-h-dvh bg-paper text-ink">
    <AppHeader />
    <main className="library-main pack-browser">
      <header className="pack-browser-heading">
        <h1 className="font-display">{t('navigation.packs')}</h1>
        <p>{t('packs.introduction')}</p>
      </header>
      {packs.length ? <nav aria-label={t('navigation.packs')} className="pack-grid">
        {packs.map(pack => <Link key={pack.id} to={packPath(pack.id, language)} aria-label={pack.title} className="pack-card">
          <span className="pack-cover">{pack.poster ? <img src={pack.poster} alt="" loading="lazy" decoding="async" /> : <Icon name="collection" className="size-16" />}</span>
          <div className="pack-card-copy">
            <h2 className="font-display"><span>{pack.title}</span><Icon name="arrow" className="size-5 shrink-0" /></h2>
            <p className="pack-description">{pack.description}</p>
            <p className="pack-meta"><span>{t('packs.by', { author: pack.author })}</span><span>{t('library.sceneCount', { count: pack.sceneCount })}</span></p>
          </div>
        </Link>)}
      </nav> : <Card className="library-empty"><p role="status">{t('packs.emptyTitle')}</p><p>{t('packs.emptyDescription')}</p></Card>}
    </main>
  </div>;
}
