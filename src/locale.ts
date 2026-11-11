import { matchPath } from 'react-router';

export const languages = [
  { value: 'zh-CN', prefix: 'zh', label: '简体中文' },
  { value: 'en', prefix: 'en', label: 'English' },
  { value: 'es', prefix: 'es', label: 'Español' },
  { value: 'ja', prefix: 'ja', label: '日本語' },
  { value: 'ko', prefix: 'ko', label: '한국어' },
] as const;
export type Language = typeof languages[number]['value'];
export const languageStorageKey = 'parrotbook-ui-language';
export const isLanguage = (value: unknown): value is Language => languages.some(language => language.value === value);

export function pathLanguage(pathname: string): Language | undefined {
  const prefix = matchPath('/:language/*', pathname)?.params.language;
  return languages.find(language => language.prefix === prefix)?.value;
}

export function contentPath(pathname: string) {
  if (!pathLanguage(pathname)) return pathname;
  const rest = matchPath('/:language/*', pathname)?.params['*'];
  return rest ? `/${rest}` : '/';
}

export function languagePath(pathname: string, language: Language) {
  return `/${languages.find(item => item.value === language)!.prefix}${contentPath(pathname)}`;
}

export function preferredLanguage(): Language {
  try {
    const saved = localStorage.getItem(languageStorageKey);
    return isLanguage(saved) ? saved : 'zh-CN';
  } catch { return 'zh-CN'; }
}
