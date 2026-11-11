import reviewClips from './review-clips.json' with { type: 'json' };
import searchIndex from './scene-search-index.json' with { type: 'json' };
export const mediaRoot = 'https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/clips/';
const sceneText: Record<string, { tags: string[]; quotes: string[] }> = searchIndex;
export const clips = reviewClips.map(clip => ({ ...clip, ...sceneText[clip.slug] }));
export const memeClips = clips.filter(clip => clip.cohort === 'older-audience');
export const youngerClips = clips.filter(clip => clip.cohort === 'younger-age-5');
export type ClipSlug = typeof clips[number]['slug'];

export const folders = [
  { value: 'older-audience', title: '电影与动画' },
  { value: 'younger-age-5', title: '英语启蒙' },
  { value: 'older-children', title: '10–12岁' },
  { value: 'teens', title: '青少年' },
];
