import { Icon } from '../shared/ui';
import { useLanguage } from '../i18n';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

export function AppHeader({ onHelp, onBack, helpExpanded, helpControls }: { onHelp?: () => void; onBack?: () => void; helpExpanded?: boolean; helpControls?: string }) {
  const { language, setLanguage, t } = useLanguage();
  return <header className="app-header mx-auto flex max-w-6xl items-center gap-1 px-4 py-4 sm:gap-4 sm:px-8 sm:py-5">
    {onBack && <Button variant="ghost" onClick={onBack} aria-label={t('返回片段')} className="h-11 min-w-11 shrink-0 px-2 text-sm font-semibold sm:text-base"><Icon name="back" /><span className="max-sm:sr-only">{t('返回片段')}</span></Button>}
    <a href="/" onClick={e => { if (onBack) { e.preventDefault(); onBack(); } }} className="min-w-0 flex-1 rounded-lg font-display text-lg max-[359px]:text-sm font-extrabold tracking-tight focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand sm:text-3xl" aria-label={t('Parrotbook 首页')}>parrotbook<span className="text-coral">.</span></a>
    <label className="flex shrink-0 items-center text-xs font-semibold"><span className="sr-only">{t('界面语言')}</span><NativeSelect aria-label="UI language / 界面语言" value={language} onChange={e => setLanguage(e.target.value === 'en' ? 'en' : 'zh-CN')} className="w-26 bg-card [&_select]:h-11"><NativeSelectOption value="zh-CN" lang="zh-CN">简体中文</NativeSelectOption><NativeSelectOption value="en" lang="en">English</NativeSelectOption></NativeSelect></label>
    {onHelp && <Button variant="ghost" size="icon" onClick={onHelp} aria-label={t('怎么配音？')} aria-expanded={helpExpanded} aria-controls={helpControls} className="size-11 shrink-0"><Icon name="help" /></Button>}
  </header>;
}
