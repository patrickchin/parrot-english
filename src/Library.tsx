import { useTranslation } from 'react-i18next';
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useContent } from './app/ContentProvider';
import { useLanguage } from './i18n';
import { searchScenes } from './scene-search';
import { AppHeader } from './app/AppHeader';
import { ContentPoster } from './app/ContentPoster';
import { Icon } from './shared/ui';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { packPath, packsPath } from './app/routes';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

export function Library({ onChoose, packId, teens }: { onChoose: (slug: string, draftId?: string) => void; packId?: string; teens?: boolean }) {
  const { t } = useTranslation();
  const { clips, packs } = useContent();
  const { language } = useLanguage();
  const pack = packs.find(item => item.id === packId);
  const scenes = clips.filter(clip => packId ? clip.packId === packId : !teens || clip.cohort === 'teens');
  const seriesIds = new Set(scenes.map(clip => clip.packId));
  const series = teens ? packs.filter(item => seriesIds.has(item.id)).sort((a, b) => a.title.localeCompare(b.title, language)) : [];
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
        <Link className="library-back" to={packsPath(language)}><Icon name="back" /><span>{t('packs.allPacks')}</span></Link>
        <h1 className="font-display">{pack?.title ?? t(teens ? 'categories.teens' : 'library.allScenes')}</h1>
        {pack?.description && <p className="pack-description">{pack.description}</p>}
        {pack && <p className="pack-meta"><span>{t('packs.uploadedBy', { uploader: pack.uploader })}</span><span>{t('library.sceneCount', { count: pack.sceneCount })}</span></p>}
      </header>
      {!!series.length && <nav aria-label={t('library.series')} className="mt-5 flex flex-wrap gap-2.5">
        {series.map(item => <Link key={item.id} to={packPath(item.id, language)} className={buttonVariants({ variant: 'outline', className: 'min-h-11 max-w-full whitespace-normal px-3' })}>{item.title}</Link>)}
      </nav>}
      <section aria-label={t('packs.scenes')}>
        <div className="library-toolbar" data-collection>
          <div className="library-scope"><h2>{t('packs.scenes')}</h2><span>{t('library.sceneCount', { count: visible.length })}</span></div>
          <InputGroup className="library-search h-12 bg-card">
            <InputGroupAddon><Icon name="search" /></InputGroupAddon>
            <InputGroupInput ref={search} type="search" aria-label={t('library.findAScene')} placeholder={t(teens || seasons.length ? 'library.findAScene' : 'library.titleCharacterTagOrLine')} value={query} onChange={e => setQuery(e.target.value)} className="h-11 text-base sm:text-sm" />
            {query && <InputGroupAddon align="inline-end"><Button variant="ghost" size="icon" onClick={clearSearch} aria-label={t('library.clearSearch')} className="size-11 p-0"><Icon name="close" /></Button></InputGroupAddon>}
          </InputGroup>
        </div>
        {!!seasons.length && <select aria-label={t('library.seasonFilter')} value={season ?? ''} onChange={event => changeSeason(event.target.value)} className="mb-5 min-h-11 max-w-full rounded-md border border-input bg-card px-3 text-base focus-visible:outline-2 focus-visible:outline-ring sm:text-sm">
          <option value="">{t('library.allSeasons')}</option>
          {seasons.map(number => <option key={number} value={number}>{t('library.seasonNumber', { number })}</option>)}
        </select>}
        {!visible.length && <Card className="library-empty"><p role="status">{t(scenes.length ? 'library.noScenesFound' : packId ? 'packs.emptyPack' : 'library.empty')}</p>{!!scenes.length && <><p>{t('library.searchSuggestion')}</p><Button onClick={() => { if (season) changeSeason(''); clearSearch(); }} className="mx-auto mt-5 h-12">{t('library.showAllScenes')}<Icon name="arrow" /></Button></>}</Card>}
        <ul role="list" className="scene-shelf">{visible.map((clip, index) => <li key={clip.slug}>
          <button onClick={() => onChoose(clip.slug)} aria-label={t('library.chooseScene', { title: t(`content:scenes.${clip.id}.title`, { defaultValue: clip.title }) })} className="scene-select">
            <ContentPoster src={clip.poster} eager={index < 2} priority={index === 0} />
            <span className="scene-copy"><span role="heading" aria-level={3} className="scene-title font-display">{t(`content:scenes.${clip.id}.title`, { defaultValue: clip.title })}</span>{(teens || pack?.title === 'Memes') && <span className="scene-source">{clip.note}</span>}</span>
          </button>
        </li>)}</ul>
      </section>
      {notices.map(notice => <p key={notice} className="library-notice">{notice}</p>)}
    </main>
  </div>;
}
