import { clips, folders } from '../catalog';
import { languagePath, pathLanguage, type Language } from '../locale';
import { generatePath, matchRoutes } from 'react-router';

export const pageRoutes = [
  { id: 'home', path: '/:language' },
  { id: 'library', path: '/:language/library/:folder' },
  { id: 'dubs', path: '/:language/dubs' },
  { id: 'scene', path: '/:language/scenes/:sceneName' },
  { id: 'dub', path: '/:language/scenes/:sceneName/dubs/:draftId' },
  { id: 'fallback', path: '*' },
];

export const libraryPath = (folder: string, language: Language) => languagePath(generatePath('/library/:folder', { folder: encodeURIComponent(folder) }), language);
export const dubsPath = (language: Language) => languagePath('/dubs', language);
export const scenePath = (slug: string, draftId?: string, language: Language = 'zh-CN') => {
  const clip = clips.find(clip => clip.slug === slug);
  const sceneName = encodeURIComponent(clip?.routeSlug ?? slug);
  return languagePath(draftId
    ? generatePath('/scenes/:sceneName/dubs/:draftId', { sceneName, draftId: encodeURIComponent(draftId) })
    : generatePath('/scenes/:sceneName', { sceneName }), language);
};

export function readRoute(href: string) {
  const url = new URL(href, 'https://parrotbook.invalid');
  const match = matchRoutes(pageRoutes, url.pathname)?.at(-1);
  const params = match?.params ?? {};
  const clip = clips.find(clip => (clip.routeSlug ?? clip.slug) === params.sceneName);
  return {
    page: match?.route.id === 'dubs' ? 'dubs' : clip ? 'scene' : 'library',
    language: pathLanguage(url.pathname) ?? 'zh-CN',
    slug: clip?.slug ?? '',
    draftId: clip ? params.draftId : undefined,
    folder: clip?.cohort ?? folders.find(item => item.value === params.folder)?.value ?? folders[0].value,
  };
}
