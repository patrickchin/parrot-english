import { useLayoutEffect, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { useSceneNavigation } from './app/useSceneNavigation';
import { languageStorageKey } from './locale';
import { i18n } from './i18n-engine';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { language } = useSceneNavigation();
  useLayoutEffect(() => {
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
    document.title = i18n.t('app.title', { lng: language });
    try { localStorage.setItem(languageStorageKey, language); } catch { /* The URL still preserves the choice. */ }
  }, [language]);
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

export function useLanguage() {
  const { language, setLanguage } = useSceneNavigation();
  return { language, setLanguage };
}
