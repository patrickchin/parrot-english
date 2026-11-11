import { matchPath } from 'react-router';

export type Language = 'zh-CN' | 'en';
export const languageStorageKey = 'parrotbook-ui-language';

export function pathLanguage(pathname: string): Language | undefined {
  const prefix = matchPath('/:language/*', pathname)?.params.language;
  return prefix === 'en' ? 'en' : prefix === 'zh' ? 'zh-CN' : undefined;
}

export function contentPath(pathname: string) {
  if (!pathLanguage(pathname)) return pathname;
  const rest = matchPath('/:language/*', pathname)?.params['*'];
  return rest ? `/${rest}` : '/';
}

export function languagePath(pathname: string, language: Language) {
  return `/${language === 'en' ? 'en' : 'zh'}${contentPath(pathname)}`;
}

export function preferredLanguage(): Language {
  try { return localStorage.getItem(languageStorageKey) === 'en' ? 'en' : 'zh-CN'; }
  catch { return 'zh-CN'; }
}
