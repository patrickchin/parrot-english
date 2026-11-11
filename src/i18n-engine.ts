import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/translation.json' with { type: 'json' };
import zhCN from './locales/zh-CN/translation.json' with { type: 'json' };

export const i18n = createInstance();
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, 'zh-CN': { translation: zhCN } },
  lng: 'zh-CN', supportedLngs: ['en', 'zh-CN'], fallbackLng: 'zh-CN',
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});
