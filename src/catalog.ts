import reviewClips from './review-clips.json' with { type: 'json' };
import searchIndex from './scene-search-index.json' with { type: 'json' };
const sceneText: Record<string, { tags: string[]; quotes: string[] }> = searchIndex;
export const clips = reviewClips.map(clip => ({ ...clip, ...sceneText[clip.slug] }));
export type ClipSlug = typeof clips[number]['slug'];

export const folders = [
  { value: 'older-audience', title: "categories.films" },
  { value: 'younger-age-5', title: "categories.younger" },
  { value: 'older-children', title: "categories.older" },
  { value: 'teens', title: "categories.teens" },
];
