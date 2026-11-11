import { Icon } from '../shared/ui';
import { useLanguage } from '../i18n';
import { Button } from '@/components/ui/button';
import { LanguageSelect } from './LanguageSelect';
import { useLayoutEffect, useState } from 'react';

export function AppHeader({ onHelp, onBack, helpExpanded, helpControls }: { onHelp?: () => void; onBack?: () => void; helpExpanded?: boolean; helpControls?: string }) {
  const { t } = useLanguage();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#151c17' : '#fafcf7');
    try { localStorage.setItem('parrotbook-theme', dark ? 'dark' : 'light'); } catch { /* The current page still remembers the choice. */ }
  }, [dark]);
  return <header className="app-header mx-auto flex max-w-6xl items-center gap-0 px-4 py-4 sm:gap-4 sm:px-8 sm:py-5">
    {onBack && <Button variant="ghost" size="icon" onClick={onBack} aria-label={t('返回片段')} className="size-11 shrink-0"><Icon name="back" /></Button>}
    <a href="/" onClick={e => { if (onBack) { e.preventDefault(); onBack(); } }} className="app-wordmark min-w-0 flex-1 rounded-lg font-display text-base max-[359px]:text-sm font-extrabold tracking-tight focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand sm:text-3xl" aria-label={t('Parrotbook 首页')}>parrotbook<span className="text-primary">.</span></a>
    <LanguageSelect />
    <Button variant="ghost" size="icon" onClick={() => setDark(value => !value)} aria-label={t(dark ? '切换到浅色模式' : '切换到深色模式')} className="size-11 shrink-0"><Icon name={dark ? 'sun' : 'moon'} /></Button>
    {onHelp && <Button variant="ghost" size="icon" onClick={onHelp} aria-label={t('怎么配音？')} aria-expanded={helpExpanded} aria-controls={helpControls} className="size-11 shrink-0"><Icon name="help" /></Button>}
  </header>;
}
