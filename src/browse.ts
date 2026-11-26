import type { Clip, PublishedPack } from './content-pack.ts';

// Learners browse by who a scene suits, then by where it comes from. Packs stay
// the publishing unit; tags only power search.
export const sections = [
  { id: 'first-english', cohort: 'younger-age-5', title: 'categories.younger' },
  { id: 'cartoons-and-films', cohort: 'older-audience', title: 'categories.films' },
  { id: 'ages-10-12', cohort: 'older-children', title: 'categories.older' },
  { id: 'teens', cohort: 'teens', title: 'categories.teens' },
] as const;
export type Section = typeof sections[number];

export type Shelf =
  | { kind: 'section'; section: Section; shows: PublishedPack[]; sceneCount: number }
  | { kind: 'collection'; pack: PublishedPack; scenes: Clip[] };

const packScenes = (pack: PublishedPack, clips: readonly Clip[]) => clips.filter(clip => clip.packId === pack.id);

/** A collection gathers scenes from several sources; a show comes from one. */
export function isCollection(pack: PublishedPack, clips: readonly Clip[]) {
  return new Set(packScenes(pack, clips).map(clip => clip.note)).size > 1;
}

export function packSection(pack: PublishedPack, clips: readonly Clip[]): Section | undefined {
  const counts = new Map<string, number>();
  for (const clip of packScenes(pack, clips)) counts.set(clip.cohort, (counts.get(clip.cohort) ?? 0) + 1);
  const cohort = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  return sections.find(section => section.cohort === cohort);
}

export function sectionShows(section: Section, packs: readonly PublishedPack[], clips: readonly Clip[]) {
  return packs.filter(pack => !isCollection(pack, clips) && packSection(pack, clips) === section);
}

export function browseShelves(packs: readonly PublishedPack[], clips: readonly Clip[]): Shelf[] {
  const grouped: Shelf[] = sections.map(section => {
    const shows = sectionShows(section, packs, clips);
    return { kind: 'section' as const, section, shows, sceneCount: shows.reduce((sum, show) => sum + packScenes(show, clips).length, 0) };
  }).filter(shelf => shelf.shows.length);
  const collections: Shelf[] = packs.filter(pack => isCollection(pack, clips))
    .map(pack => ({ kind: 'collection' as const, pack, scenes: packScenes(pack, clips) }))
    .filter(shelf => shelf.scenes.length);
  return [...grouped, ...collections];
}
