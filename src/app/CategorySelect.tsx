import { Select } from '@base-ui/react/select';
import { ChevronDown, FolderOpen } from 'lucide-react';
import { clips, folders, mediaRoot } from '../catalog';
import { useLanguage } from '../i18n';
import { Icon } from '../shared/ui';

export function CategorySelect({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  const { t } = useLanguage();
  const categories = folders.map(folder => ({
    value: folder.value,
    label: t(folder.title),
    scenes: clips.filter(clip => clip.cohort === folder.value),
  }));
  const selected = categories.find(category => category.value === value)!;
  return <div className="category-picker">
    <Select.Root items={categories} value={value} onValueChange={next => { if (next) onValueChange(next); }}>
      <Select.Trigger aria-label={t('片段文件夹')} className="app-select-trigger category-trigger">
        <FolderOpen size={22} strokeWidth={1.8} aria-hidden="true" />
        <Select.Value className="category-selected-name" />
        <span className="category-count" aria-hidden="true">{selected.scenes.length}</span>
        <Select.Icon><ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner align="start" sideOffset={8} alignItemWithTrigger={false} className="app-select-positioner">
          <Select.Popup className="app-select-popup category-popup max-h-[var(--available-height)] overflow-y-auto overscroll-contain">
            <div className="app-select-label sticky top-0 z-10 bg-popover">{t('片段文件夹')}</div>
            <Select.List>
              {categories.map(category => <Select.Item key={category.value} value={category.value} className="app-select-option category-option">
                <span className="category-cover" aria-hidden="true">
                  {category.scenes.slice(0, 2).reverse().map(clip => <img key={clip.slug} src={clip.poster ?? `${mediaRoot}${clip.slug}/${clip.slug}-poster-v1.jpg`} alt="" />)}
                </span>
                <span className="category-copy">
                  <Select.ItemText className="category-name">{category.label}</Select.ItemText>
                  <span className="category-description">{t('{0} 个片段', category.scenes.length)}</span>
                </span>
                <Select.ItemIndicator><Icon name="check" /></Select.ItemIndicator>
              </Select.Item>)}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  </div>;
}
