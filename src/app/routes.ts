import { folders } from '../catalog';
import type { Clip } from '../content-pack';
import { languagePath, pathLanguage, type Language } from '../locale';
import { generatePath, matchRoutes } from 'react-router';

export const pageRoutes = [
  { id: 'home', path: '/:language' },
  { id: 'library', path: '/:language/library/:folder' },
  { id: 'packs', path: '/:language/packs' },
  { id: 'pack', path: '/:language/packs/:packId' },
  { id: 'dubs', path: '/:language/dubs' },
  { id: 'scene', path: '/:language/scenes/:sceneName' },
  { id: 'dub', path: '/:language/scenes/:sceneName/dubs/:draftId' },
  { id: 'not-found', path: '*' },
];

export const libraryPath = (folder: string, language: Language) => languagePath(generatePath('/library/:folder', { folder: encodeURIComponent(folder) }), language);
export const dubsPath = (language: Language) => languagePath('/dubs', language);
export const packsPath = (language: Language) => languagePath('/packs', language);
export const packPath = (id: string, language: Language) => languagePath(generatePath('/packs/:packId', { packId: encodeURIComponent(id) }), language);
export const scenePath = (slug: string, draftId?: string, language: Language = 'zh-CN', clips: readonly Clip[] = []) => {
  const clip = clips.find(clip => clip.slug === slug);
  const sceneName = encodeURIComponent(clip?.routeSlug ?? slug);
  return languagePath(draftId
    ? generatePath('/scenes/:sceneName/dubs/:draftId', { sceneName, draftId: encodeURIComponent(draftId) })
    : generatePath('/scenes/:sceneName', { sceneName }), language);
};

export function readRoute(href: string, clips: readonly Clip[] = []) {
  const url = new URL(href, 'https://parrotbook.invalid');
  const match = matchRoutes(pageRoutes, url.pathname)?.at(-1);
  const params = match?.params ?? {};
  const clip = clips.find(clip => (clip.routeSlug ?? clip.slug) === params.sceneName);
  const folder = folders.find(item => item.value === params.folder);
  const route = match?.route.id;
  const sceneRoute = (route === 'scene' || route === 'dub') && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.sceneName ?? '');
  const packRoute = route === 'pack' && /^pack_[A-Za-z0-9_-]{1,80}$/.test(params.packId ?? '');
  return {
    page: route === 'dubs' ? 'dubs' : route === 'packs' ? 'packs' : packRoute ? 'pack' : sceneRoute ? 'scene' : route === 'home' || route === 'library' && (folder || params.folder === 'all') ? 'library' : 'not-found',
    directory: route === 'home',
    language: pathLanguage(url.pathname) ?? 'zh-CN',
    slug: clip?.slug ?? (sceneRoute ? params.sceneName! : ''),
    draftId: sceneRoute ? params.draftId : undefined,
    packId: packRoute ? params.packId : sceneRoute && clip?.packId === url.searchParams.get('pack') ? clip.packId : undefined,
    folder: clip?.cohort ?? folder?.value ?? 'all',
  };
}
