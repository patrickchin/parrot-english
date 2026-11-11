import { useTranslation } from 'react-i18next';
import { Select } from '@base-ui/react/select';
import { ChevronDown, Languages } from 'lucide-react';
import { useLanguage } from '../i18n';
import { Icon } from '../shared/ui';

const languages = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
];

export function LanguageSelect() {
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();
  return <Select.Root items={languages} value={language} onValueChange={value => {
    if (value === 'en' || value === 'zh-CN') setLanguage(value);
  }}>
    <Select.Trigger aria-label="UI language / 界面语言" className="app-select-trigger language-trigger">
      <Languages size={18} strokeWidth={1.8} aria-hidden="true" className="language-symbol" />
      <Select.Value />
      <Select.Icon><ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Positioner align="end" sideOffset={8} alignItemWithTrigger={false} className="app-select-positioner">
        <Select.Popup className="app-select-popup">
          <div className="app-select-label">{t("navigation.language")}</div>
          <Select.List>
            {languages.map(({ value, label }) => <Select.Item key={value} value={value} className="app-select-option">
              <Select.ItemText lang={value === 'en' ? 'en' : 'zh-CN'}>{label}</Select.ItemText>
              <Select.ItemIndicator><Icon name="check" /></Select.ItemIndicator>
            </Select.Item>)}
          </Select.List>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  </Select.Root>;
}
