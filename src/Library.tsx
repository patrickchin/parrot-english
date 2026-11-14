import { useTranslation } from 'react-i18next';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useContent } from './app/ContentProvider';
import { useLanguage } from './i18n';
import { searchScenes } from './scene-search';
import { AppHeader } from './app/AppHeader';
import { Icon } from './shared/ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { packsPath } from './app/routes';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

export function Library({ onChoose, packId }: { onChoose: (slug: string, draftId?: string) => void; packId?: string }) {
  const { t } = useTranslation();
  const { clips, packs } = useContent();
  const { language } = useLanguage();
  const pack = packs.find(item => item.id === packId);
  const scenes = clips.filter(clip => !packId || clip.packId === packId);
  const [searchState, setSearchState] = useState({ packId, query: '' });
  if (searchState.packId !== packId) setSearchState({ packId, query: '' });
  const query = searchState.packId === packId ? searchState.query : '';
  const setQuery = (query: string) => setSearchState({ packId, query });
  const search = useRef<HTMLInputElement>(null);
  const clearSearch = () => { setQuery(''); search.current?.focus(); };
  const visible = searchScenes(scenes, query, clip => t(`content:scenes.${clip.id}.title`, { defaultValue: clip.title }));
  const notices = [...new Set(scenes.map(clip => clip.notices?.[language]?.library).filter((notice): notice is string => !!notice))];
  return <div className="library-shell min-h-dvh bg-paper text-ink">
    <AppHeader />
    <main className="library-main">
      <header className="pack-detail-heading">
        <Link className="library-back" to={packsPath(language)}><Icon name="back" /><span>{t('packs.allPacks')}</span></Link>
        <h1 className="font-display">{pack?.title ?? t('library.allScenes')}</h1>
        {pack?.description && <p className="pack-description">{pack.description}</p>}
        {pack && <p className="pack-meta"><span>{t('packs.uploadedBy', { uploader: pack.uploader })}</span><span>{t('library.sceneCount', { count: pack.sceneCount })}</span></p>}
      </header>
      <section aria-label={t('packs.scenes')}>
        <div className="library-toolbar" data-collection>
          <div className="library-scope"><h2>{t('packs.scenes')}</h2><span>{t('library.sceneCount', { count: visible.length })}</span></div>
          <InputGroup className="library-search h-12 bg-card">
            <InputGroupAddon><Icon name="search" /></InputGroupAddon>
            <InputGroupInput ref={search} type="search" aria-label={t('library.findAScene')} placeholder={t('library.titleCharacterTagOrLine')} value={query} onChange={e => setQuery(e.target.value)} className="h-11 text-base sm:text-sm" />
            {query && <InputGroupAddon align="inline-end"><Button variant="ghost" size="icon" onClick={clearSearch} aria-label={t('library.clearSearch')} className="size-11 p-0"><Icon name="close" /></Button></InputGroupAddon>}
          </InputGroup>
        </div>
        {!visible.length && <Card className="library-empty"><p role="status">{t(scenes.length ? 'library.noScenesFound' : packId ? 'packs.emptyPack' : 'library.empty')}</p>{!!scenes.length && <><p>{t('library.searchSuggestion')}</p><Button onClick={clearSearch} className="mx-auto mt-5 h-12">{t('library.showAllScenes')}<Icon name="arrow" /></Button></>}</Card>}
        <ul role="list" className="scene-shelf">{visible.map(clip => <li key={clip.slug}>
          <button onClick={() => onChoose(clip.slug)} aria-label={t('library.chooseScene', { title: t(`content:scenes.${clip.id}.title`, { defaultValue: clip.title }) })} className="scene-select">
            <img src={clip.poster} alt="" loading="lazy" decoding="async" />
            <span className="scene-copy"><span role="heading" aria-level={3} className="scene-title font-display">{t(`content:scenes.${clip.id}.title`, { defaultValue: clip.title })}</span>{pack?.title === 'Memes' && <span className="scene-source">{clip.note}</span>}</span>
          </button>
        </li>)}</ul>
      </section>
      {notices.map(notice => <p key={notice} className="library-notice">{notice}</p>)}
    </main>
  </div>;
}
