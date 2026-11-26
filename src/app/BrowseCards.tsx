import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Clip, PublishedPack } from '../content-pack';
import { useLanguage } from '../i18n';
import { Icon } from '../shared/ui';
import { ContentPoster } from './ContentPoster';
import { packPath } from './routes';
import { sceneLevel } from '../browse';

export function ShowCard({ pack, eager = false, priority = false }: { pack: PublishedPack; eager?: boolean; priority?: boolean }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  return <Link to={packPath(pack.id, language)} className="pack-card">
    <span className="pack-cover">{pack.poster ? <ContentPoster src={pack.poster} eager={eager} priority={priority} /> : <Icon name="collection" className="size-16" />}</span>
    <span className="pack-card-copy">
      <span className="scene-title font-display">{pack.title}</span>
      <span className="pack-meta">{t('library.sceneCount', { count: pack.sceneCount })}</span>
    </span>
  </Link>;
}

export function SceneCard({ clip, onChoose, source = false, eager = false, priority = false }: { clip: Clip; onChoose: () => void; source?: boolean; eager?: boolean; priority?: boolean }) {
  const { t } = useTranslation();
  const title = t(`content:scenes.${clip.id}.title`, { defaultValue: clip.title });
  return <button onClick={onChoose} aria-label={t('library.chooseScene', { title })} className="scene-select">
    <ContentPoster src={clip.poster} eager={eager} priority={priority} />
    <span className="scene-copy"><span className="scene-title font-display">{title}</span><span className="scene-source">{source && <>{clip.note} · </>}{t(`browse.levels.${sceneLevel(clip)}`)}</span></span>
  </button>;
}
