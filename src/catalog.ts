import reviewClips from './review-clips.json' with { type: 'json' };
export const mediaRoot = 'https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/clips/';
export const clips = reviewClips;
export const memeClips = clips.filter(clip => clip.cohort === 'older-audience');
export const youngerClips = clips.filter(clip => clip.cohort === 'younger-age-5');
export type ClipSlug = typeof clips[number]['slug'];
