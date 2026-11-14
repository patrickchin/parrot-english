import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Authoring fixtures belong to tests, never to the player bundle.
export type FixtureClip = {
  id: string; slug: string; routeSlug?: string; title: string; english: string;
  note: string; source: string; cohort: string; poster: string;
  tags: string[]; quotes: string[]; manifest: string; packId: string;
};
export const contentRoot = new URL('../content/', import.meta.url);
export const catalog = JSON.parse(readFileSync(new URL('catalog.json', contentRoot), 'utf8')) as {
  version: number; packs: { id: string; manifest: string; uploader: string }[];
};
export const packs = catalog.packs.map(entry => ({
  entry, file: new URL(entry.manifest, contentRoot),
  data: JSON.parse(readFileSync(new URL(entry.manifest, contentRoot), 'utf8')),
}));
export const clips: FixtureClip[] = packs.flatMap(pack => pack.data.scenes.map((scene: Omit<FixtureClip, 'packId'>) => ({ ...scene, packId: pack.entry.id })));
export function sceneFile(slug: string, file = 'scene.json') {
  const clip = clips.find(clip => clip.slug === slug)!;
  const pack = packs.find(pack => pack.entry.id === clip.packId)!;
  return fileURLToPath(new URL(file, new URL(clip.manifest, pack.file)));
}
export const readScene = (slug: string) => JSON.parse(readFileSync(sceneFile(slug), 'utf8'));
