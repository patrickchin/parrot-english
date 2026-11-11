import { useTranslation } from 'react-i18next';
import { clips, folders, mediaRoot } from '../catalog';
import { Button } from '@/components/ui/button';

export function CategoryTabs({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  const { t } = useTranslation();
  return <div role="group" aria-label={t("library.sceneCategories")} className="category-tabs">
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
          <span className="category-description">{t("library.sceneCount", { count: scenes.length })}</span>
        </span>
      </Button>;
    })}
  </div>;
}
