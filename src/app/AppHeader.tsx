import { useTranslation } from 'react-i18next';
import { Icon } from '../shared/ui';
import { useLanguage } from '../i18n';
import { Button } from '@/components/ui/button';
import { LanguageSelect } from './LanguageSelect';
import { useLayoutEffect, useState, type MouseEvent } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Bird, Menu as MenuIcon } from 'lucide-react';
import { dubsPath, packsPath } from './routes';
import { useSceneNavigation } from './useSceneNavigation';
import { languagePath } from '../locale';

export function AppHeader({ onHelp, onBack }: { onHelp?: () => void; onBack?: () => void }) {
  const { language } = useLanguage();
  const { t } = useTranslation();
  const navigation = useSceneNavigation();
  const destinations = [
    { page: 'packs', label: "navigation.packs", href: packsPath(language) },
    { page: 'dubs', label: "navigation.dubs", href: dubsPath(language) },
  ];
  function follow(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigation.navigateTo(href);
  }
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--background').trim());
    try { localStorage.setItem('parrotbook-theme', dark ? 'dark' : 'light'); } catch { /* The current page still remembers the choice. */ }
  }, [dark]);
  return <header className="app-header mx-auto flex max-w-6xl items-center gap-0 px-4 py-4 sm:gap-4 sm:px-8 sm:py-5">
    {onBack && <Button variant="ghost" size="icon" onClick={onBack} aria-label={t("navigation.backToScenes")} className="size-11 shrink-0"><Icon name="back" /></Button>}
    <a href={languagePath('/', language)} onClick={e => { if (onBack) { e.preventDefault(); onBack(); } }} className="app-wordmark min-w-0 flex-1 rounded-lg font-display text-base max-[359px]:text-sm font-bold tracking-tight focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand sm:text-3xl" aria-label={t("navigation.home")}><Bird className="app-brand-mark" strokeWidth={2.2} aria-hidden="true" /><span>parrotbook</span></a>
    {!onBack && <nav aria-label={t("navigation.main")} className="app-navigation">
      <div className="app-navigation-links">{destinations.map(item => <a key={item.page} href={item.href} aria-current={navigation.page === item.page || item.page === 'packs' && (navigation.page === 'pack' || navigation.page === 'library' || navigation.directory) ? 'page' : undefined} onClick={event => follow(event, item.href)}>{t(item.label)}</a>)}</div>
      <Menu.Root>
        <Menu.Trigger aria-label={t("navigation.main")} className="app-navigation-trigger"><MenuIcon size={20} strokeWidth={1.8} aria-hidden="true" /></Menu.Trigger>
        <Menu.Portal><Menu.Positioner align="end" sideOffset={8} className="app-select-positioner"><Menu.Popup className="app-select-popup">
          {destinations.map(item => <Menu.LinkItem key={item.page} href={item.href} aria-current={navigation.page === item.page || item.page === 'packs' && (navigation.page === 'pack' || navigation.page === 'library' || navigation.directory) ? 'page' : undefined} closeOnClick className="app-select-option" onClick={event => follow(event, item.href)}>{t(item.label)}</Menu.LinkItem>)}
        </Menu.Popup></Menu.Positioner></Menu.Portal>
      </Menu.Root>
    </nav>}
    <LanguageSelect />
    <Button variant="ghost" size="icon" onClick={() => setDark(value => !value)} aria-label={t(dark ? "theme.light" : "theme.dark")} className="size-11 shrink-0"><Icon name={dark ? 'sun' : 'moon'} /></Button>
    {onHelp && <Button variant="ghost" size="icon" onClick={onHelp} aria-label={t("navigation.howToDub")} className="size-11 shrink-0"><Icon name="help" /></Button>}
  </header>;
}
