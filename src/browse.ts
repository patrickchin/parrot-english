import type { Clip, PublishedPack } from './content-pack.ts';

// Learners browse shows, then scenes. Browse tags are non-exclusive filters:
// one estimated English level per scene plus any number of topics. Packs stay
// the publishing unit; authored keyword tags still power search.
export const levels = ['starter', 'beginner', 'intermediate'] as const;
export type Level = typeof levels[number];

/**
 * Estimated from average words per spoken line, which tracks how much a learner
 * must say per turn. A rough guide until levels are authored and reviewed.
 */
export function sceneLevel(clip: Pick<Clip, 'quotes'>): Level {
  const words = clip.quotes.join(' ').split(/\s+/).filter(Boolean).length / Math.max(1, clip.quotes.length);
  return words <= 2.5 ? 'starter' : words <= 4.5 ? 'beginner' : 'intermediate';
}

// Curated topics mapped from authored keyword tags (matched case-insensitively).
export const topics = {
  phrases: ['greetings', 'good morning', 'how are you', 'introductions', 'please', 'thanks', 'thank you', 'requests', 'asking permission', 'permission', 'questions'],
  food: ['food', 'cooking', 'breakfast', 'pancakes', 'cheesecake', 'noodles', 'sandwiches', 'sausages', 'doughnuts', 'donuts', 'picnic', 'avocado', 'croissant', 'waffle fries', 'chocolate frog'],
  animals: ['animals', 'dog', 'chickens', 'geese', 'turtles', 'elephant', 'tiger', 'zebra', 'sharks', 'rabbit', 'duck', 'ants', 'zoo', 'dinosaur'],
  school: ['school', 'classroom', 'homework', 'studying', 'lesson', 'test', 'quiz', 'library', 'books', 'book', 'science', 'math', 'numbers', 'counting', 'colours'],
  family: ['family', 'friendship', 'friend', 'kindness', 'sharing', 'helping', 'taking turns', 'birthday', 'party', 'sleepover'],
  funny: ['funny', 'comedy', 'wordplay', 'pun', 'sarcasm', 'deadpan', 'reaction'],
  magic: ['magic', 'dragon', 'unicorn', 'elves', 'fairy tales'],
} as const;
export type Topic = keyof typeof topics;
export type BrowseTag = Level | Topic;
export const browseTags: readonly BrowseTag[] = [...levels, ...Object.keys(topics) as Topic[]];
export const isBrowseTag = (value: unknown): value is BrowseTag => browseTags.includes(value as BrowseTag);

export function sceneTopics(clip: Pick<Clip, 'tags'>): Topic[] {
  const keywords = new Set(clip.tags.map(tag => tag.toLocaleLowerCase()));
  return (Object.entries(topics) as [Topic, readonly string[]][]).filter(([, words]) => words.some(word => keywords.has(word))).map(([topic]) => topic);
}

export const hasTag = (clip: Pick<Clip, 'tags' | 'quotes'>, tag: BrowseTag) =>
  (levels as readonly string[]).includes(tag) ? sceneLevel(clip) === tag : sceneTopics(clip).includes(tag as Topic);

const packScenes = (pack: PublishedPack, clips: readonly Clip[]) => clips.filter(clip => clip.packId === pack.id);

/** A collection gathers scenes from several sources; a show comes from one. */
export function isCollection(pack: PublishedPack, clips: readonly Clip[]) {
  return new Set(packScenes(pack, clips).map(clip => clip.note)).size > 1;
}

export type Shelf =
  | { kind: 'shows'; shows: PublishedPack[] }
  | { kind: 'collection'; pack: PublishedPack; scenes: Clip[] };

/** Home lists every show, then each mixed-source collection as its own shelf. */
export function browseShelves(packs: readonly PublishedPack[], clips: readonly Clip[]): Shelf[] {
  const shows = packs.filter(pack => !isCollection(pack, clips) && packScenes(pack, clips).length);
  const collections: Shelf[] = packs.filter(pack => isCollection(pack, clips))
    .map(pack => ({ kind: 'collection' as const, pack, scenes: packScenes(pack, clips) }));
  return [...(shows.length ? [{ kind: 'shows' as const, shows }] : []), ...collections];
}

/** Home shelves show only complete rows; a lone card on a wrapped row wastes space. */
export function shelfCount(items: number, columns: number, cap = 4) {
  if (items <= columns) return items;
  return Math.floor(Math.min(items, cap) / columns) * columns;
}
