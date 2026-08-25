import type { Story } from "./story-types.ts";

export const IS_PRIVATE_STORY_PREVIEW =
  import.meta.env?.VITE_PARROT_PRIVATE_STORY_PREVIEW === true;

export const PRIVATE_STORY_PREVIEW_STORIES: readonly Story[] =
  import.meta.env?.VITE_PARROT_PRIVATE_STORIES ?? [];
