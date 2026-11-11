import { clips, folders } from '../catalog';

export const libraryPath = (folder: string) => `/library/${encodeURIComponent(folder)}`;
export const dubsPath = () => '/dubs';
export const scenePath = (slug: string, draftId?: string) => {
  const clip = clips.find(clip => clip.slug === slug);
  return `/scenes/${encodeURIComponent(clip?.routeSlug ?? slug)}${draftId ? `/dubs/${encodeURIComponent(draftId)}` : ''}`;
};

export function readRoute(href: string) {
  const url = new URL(href);
  const scene = /^\/scenes\/([a-z0-9-]+)(?:\/dubs\/([A-Za-z0-9_-]+))?\/?$/.exec(url.pathname);
  const clip = clips.find(clip => (clip.routeSlug ?? clip.slug) === scene?.[1]);
  const folder = /^\/library\/([a-z0-9-]+)\/?$/.exec(url.pathname)?.[1];
  return {
    page: /^\/dubs\/?$/.test(url.pathname) ? 'dubs' : clip ? 'scene' : 'library',
    slug: clip?.slug ?? '',
    draftId: clip ? scene?.[2] : undefined,
    folder: clip?.cohort ?? folders.find(item => item.value === folder)?.value ?? folders[0].value,
  };
}
