import { Icon } from '../shared/ui';
import { useLanguage } from '../i18n';

export function AppHeader({ onHelp, onBack }: { onHelp?: () => void; onBack?: () => void }) {
  const { language, setLanguage, t } = useLanguage();
  return <header className="mx-auto flex max-w-6xl items-center gap-1 px-3 py-4 sm:gap-4 sm:px-8 sm:py-5">
    {onBack && <button onClick={onBack} aria-label={t('返回片段')} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-bold focus-visible:outline-3 focus-visible:outline-brand sm:text-base"><Icon name="back" className="h-6 w-6" /><span className="max-sm:sr-only">{t('返回片段')}</span></button>}
    <a href="/" onClick={e => { if (onBack) { e.preventDefault(); onBack(); } }} className="min-w-0 flex-1 rounded-lg font-display text-lg font-extrabold tracking-tight focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand sm:text-3xl" aria-label={t('Parrotbook 首页')}>parrotbook<span className="text-coral">.</span></a>
    <label className="flex shrink-0 items-center gap-1 text-xs font-semibold"><span aria-hidden="true" className="sm:hidden">UI</span><span className="max-sm:sr-only">{t('界面语言')}</span><select aria-label="UI language / 界面语言" value={language} onChange={e => setLanguage(e.target.value === 'en' ? 'en' : 'zh-CN')} className="h-11 min-h-11 w-22 rounded-lg border border-brand/30 bg-paper px-1 text-sm text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand"><option value="zh-CN" lang="zh-CN">简体中文</option><option value="en" lang="en">English</option></select></label>
    {onHelp && <button onClick={onHelp} aria-label={t('怎么配音？')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand"><Icon name="help" className="h-7 w-7" /></button>}
  </header>;
}
