import { useTranslation } from 'react-i18next';
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useContent } from './app/ContentProvider';
import { useLanguage } from './i18n';
import { languagePath } from './locale';
import { searchScenes } from './scene-search';
import { AppHeader } from './app/AppHeader';
import { SceneCard } from './app/BrowseCards';
import { Icon } from './shared/ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { isCollection } from './browse';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

export function Library({ onChoose, packId }: { onChoose: (slug: string, draftId?: string) => void; packId?: string }) {
  const { t } = useTranslation();
  const { clips, packs } = useContent();
  const { language } = useLanguage();
  const pack = packs.find(item => item.id === packId);
  const collection = !!pack && isCollection(pack, clips);
  const scenes = packId ? clips.filter(clip => clip.packId === packId) : clips;
  const seasons = pack ? [...new Set(scenes.flatMap(clip => clip.season === undefined ? [] : [clip.season]))].sort((a, b) => a - b) : [];
  const [params, setParams] = useSearchParams();
  const season = seasons.find(value => String(value) === params.get('season'));
  function changeSeason(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set('season', value); else next.delete('season');
    setParams(next);
  }
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const clearSearch = () => { setQuery(''); search.current?.focus(); };
  const visible = searchScenes(season ? scenes.filter(clip => clip.season === season) : scenes, query,
    clip => t(`content:scenes.${clip.id}.title`, { defaultValue: clip.title }));
  const notices = [...new Set(scenes.map(clip => clip.notices?.[language]?.library).filter((notice): notice is string => !!notice))];
  return <div className="library-shell min-h-dvh bg-paper text-ink">
    <AppHeader />
    <main className="library-main">
      <header className="pack-detail-heading">
        <Link className="library-back" to={languagePath('/', language)}><Icon name="back" /><span>{t('browse.home')}</span></Link>
        <h1 className="font-display">{pack?.title ?? t('library.allScenes')}</h1>
        {collection && pack.description && <p className="pack-description">{pack.description}</p>}
        <p className="pack-meta" aria-live="polite">{t('library.sceneCount', { count: visible.length })}</p>
      </header>
      <section aria-label={t('browse.scenes')}>
        <div className="library-toolbar">
          {!!seasons.length && <select aria-label={t('library.seasonFilter')} value={season ?? ''} onChange={event => changeSeason(event.target.value)} className="library-season min-h-12 max-w-full rounded-md border border-input bg-card px-3 text-base focus-visible:outline-2 focus-visible:outline-ring sm:text-sm">
            <option value="">{t('library.allSeasons')}</option>
            {seasons.map(number => <option key={number} value={number}>{t('library.seasonNumber', { number })}</option>)}
          </select>}
          <InputGroup className="library-search h-12 bg-card">
            <InputGroupAddon><Icon name="search" /></InputGroupAddon>
            <InputGroupInput ref={search} type="search" aria-label={t('library.findAScene')} placeholder={t('library.titleCharacterTagOrLine')} value={query} onChange={e => setQuery(e.target.value)} className="h-11 text-base sm:text-sm" />
            {query && <InputGroupAddon align="inline-end"><Button variant="ghost" size="icon" onClick={clearSearch} aria-label={t('library.clearSearch')} className="size-11 p-0"><Icon name="close" /></Button></InputGroupAddon>}
          </InputGroup>
        </div>
        {!visible.length && <Card className="library-empty"><p role="status">{t(scenes.length ? 'library.noScenesFound' : packId ? 'packs.emptyPack' : 'library.empty')}</p>{!!scenes.length && <><p>{t('library.searchSuggestion')}</p><Button onClick={() => { if (season) changeSeason(''); clearSearch(); }} className="mx-auto mt-5 h-12">{t('library.showAllScenes')}<Icon name="arrow" /></Button></>}</Card>}
        <ul role="list" className="scene-shelf">{visible.map((clip, index) => <li key={clip.slug}>
          <SceneCard clip={clip} onChoose={() => onChoose(clip.slug)} source={collection || !pack} eager={index < 2} priority={index === 0} />
        </li>)}</ul>
      </section>
      {notices.map(notice => <p key={notice} className="library-notice">{notice}</p>)}
    </main>
  </div>;
}
