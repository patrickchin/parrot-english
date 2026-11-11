import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { clips, type ClipSlug } from './catalog';
import { searchScenes } from './scene-search';
import { AppHeader } from './app/AppHeader';
import { Icon } from './shared/ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CategoryTabs } from './app/CategoryTabs';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

export function Library({ onChoose, folder, onFolderChange }: { onChoose: (slug: ClipSlug, draftId?: string) => void; folder: string; onFolderChange: (folder: string) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  useEffect(() => setQuery(''), [folder]);
  const search = useRef<HTMLInputElement>(null);
  const clearSearch = () => { setQuery(''); search.current?.focus(); };
  const visible = searchScenes(clips.filter(clip => clip.cohort === folder), query, clip => t(`scenes.${clip.id}.title`, { defaultValue: clip.title }));
  const featured = clips.find(clip => clip.cohort === folder)!;
  return <div className="library-shell min-h-dvh bg-paper text-ink">
    <AppHeader />
    <main className="library-main">
      <section className="library-feature" aria-labelledby="featured-scene-title">
        <div className="library-feature-copy">
          <h1 id="featured-scene-title" className="font-display">{t(`scenes.${featured.id}.title`, { defaultValue: featured.title })}</h1>
          <Button onClick={() => onChoose(featured.slug)} className="h-12 gap-3 px-6 text-base font-semibold">{t("player.startDubbing")}<Icon name="arrow" /></Button>
        </div>
        <img src={featured.poster} alt="" fetchPriority="high" />
      </section>
      <section aria-label={t("navigation.library")}>
        <CategoryTabs value={folder} onValueChange={onFolderChange} />
        <div className="library-toolbar">
          <div className="library-scope"><h2>{t("navigation.library")}</h2><span>{t("library.sceneCount", { count: visible.length })}</span></div>
          <InputGroup className="library-search h-12 bg-card">
            <InputGroupAddon><Icon name="search" /></InputGroupAddon>
            <InputGroupInput ref={search} type="search" aria-label={t("library.findAScene")} placeholder={t("library.titleCharacterTagOrLine")} value={query} onChange={e => setQuery(e.target.value)} className="h-11 text-base sm:text-sm" />
            {query && <InputGroupAddon align="inline-end"><Button variant="ghost" size="icon" onClick={clearSearch} aria-label={t("library.clearSearch")} className="size-11 p-0"><Icon name="close" /></Button></InputGroupAddon>}
          </InputGroup>
        </div>
        {!visible.length && <Card className="library-empty"><p role="status">{t("library.noScenesFound")}</p><p>{t("library.searchSuggestion")}</p><Button onClick={clearSearch} className="mx-auto mt-5 h-12">{t("library.showAllScenes")}<Icon name="arrow" /></Button></Card>}
        <ul role="list" className="scene-shelf">{visible.map(clip => <li key={clip.slug}>
          <button onClick={() => onChoose(clip.slug)} aria-label={t("library.chooseScene", { title: t(`scenes.${clip.id}.title`, { defaultValue: clip.title }) })} className="scene-select">
            <img src={clip.poster} alt="" loading="lazy" decoding="async" />
            <span className="scene-copy"><span role="heading" aria-level={2} className="scene-title font-display">{t(`scenes.${clip.id}.title`, { defaultValue: clip.title })}</span></span>
          </button>
        </li>)}</ul>
      </section>
      <p className="library-notice">{t("library.prototypeNotice")}</p>
    </main>
  </div>;
}
