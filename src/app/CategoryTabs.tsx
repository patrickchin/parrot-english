import { clips, folders, mediaRoot } from '../catalog';
import { useLanguage } from '../i18n';
import { Button } from '@/components/ui/button';

export function CategoryTabs({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  const { t } = useLanguage();
  return <div role="group" aria-label={t('片段分类')} className="category-tabs">
    {folders.map(folder => {
      const scenes = clips.filter(clip => clip.cohort === folder.value);
      const cover = scenes[0];
      return <Button key={folder.value}
        variant={folder.value === value ? 'default' : 'secondary'}
        aria-pressed={folder.value === value}
        onClick={() => onValueChange(folder.value)}
        className="category-tab">
        <img className="category-thumbnail" src={cover.poster ?? `${mediaRoot}${cover.slug}/${cover.slug}-poster-v1.jpg`} alt="" />
        <span className="category-copy">
          <span className="category-name">{t(folder.title)}</span>
          <span className="category-description">{t('{0} 个片段', scenes.length)}</span>
        </span>
      </Button>;
    })}
  </div>;
}
