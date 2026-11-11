import Fuse from 'fuse.js';

type SearchableScene = {
  title: string; english: string; note: string;
  tags: readonly string[]; quotes: readonly string[];
};

// Apostrophes do not change a word; other punctuation separates search terms.
const normalize = (text: string) => text.normalize('NFKC').toLowerCase()
  .replace(/['’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function searchScenes<T extends SearchableScene>(scenes: readonly T[], query: string, title: (scene: T) => string = scene => scene.title): T[] {
  const text = normalize(query);
  if (!text) return [...scenes];
  const documents = scenes.map(scene => ({
    scene,
    metadata: [...new Set([scene.title, title(scene), scene.note, ...scene.tags].map(normalize))],
    dialogue: [scene.english, ...scene.quotes].map(normalize),
  }));
  const options = { useTokenSearch: true, tokenMatch: 'all' as const, threshold: 0.3, ignoreLocation: true };
  // Search metadata separately so even fuzzy title/tag matches precede dialogue-only matches.
  const metadata = new Fuse(documents, { ...options, keys: ['metadata'] }).search(text);
  const found = new Set(metadata.map(result => result.refIndex));
  const all = new Fuse(documents, { ...options, keys: [
    { name: 'metadata', weight: 3 }, { name: 'dialogue', weight: 1 },
  ] }).search(text);
  return [...metadata, ...all.filter(result => !found.has(result.refIndex))].map(result => result.item.scene);
}
