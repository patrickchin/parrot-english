import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/translation.json' with { type: 'json' };
import zhCN from './locales/zh-CN/translation.json' with { type: 'json' };
import es from './locales/es/translation.json' with { type: 'json' };
import ja from './locales/ja/translation.json' with { type: 'json' };
import ko from './locales/ko/translation.json' with { type: 'json' };
import { languages } from './locale.ts';

export const i18n = createInstance();
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, 'zh-CN': { translation: zhCN }, es: { translation: es }, ja: { translation: ja }, ko: { translation: ko } },
  lng: 'zh-CN', supportedLngs: languages.map(language => language.value), fallbackLng: 'zh-CN',
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});
