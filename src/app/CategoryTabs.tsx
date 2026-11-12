import { useTranslation } from 'react-i18next';
import { folders } from '../catalog';
import { useContent } from './ContentProvider';
import { Button } from '@/components/ui/button';

export function CategoryTabs({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  const { t } = useTranslation();
  const { clips } = useContent();
  return <div role="group" aria-label={t("library.sceneCategories")} className="category-tabs">
    {folders.map(folder => {
      const scenes = clips.filter(clip => clip.cohort === folder.value);
      const cover = scenes[0];
      return <Button key={folder.value}
        variant={folder.value === value ? 'default' : 'secondary'}
        aria-pressed={folder.value === value}
        onClick={() => onValueChange(folder.value)}
        className="category-tab">
        {cover && <img className="category-thumbnail" src={cover.poster} alt="" />}
        <span className="category-copy">
          <span className="category-name">{t(folder.title)}</span>
          <span className="category-description">{t("library.sceneCount", { count: scenes.length })}</span>
        </span>
      </Button>;
    })}
  </div>;
}
