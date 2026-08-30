import type { StoryLevelId } from "../../lib/story-level.ts";

export type { StoryLevelId } from "../../lib/story-level.ts";

export type StoryArtwork = {
  alt: string;
  prompt: string;
  src: string | null;
};

export type StoryPage = {
  artwork: StoryArtwork;
  id: string;
  joinIn: string;
  joinInAudioId: string | null;
  narrationAudioId: string | null;
  text: string;
};

export type Story = {
  completionText: string;
  cover: StoryArtwork;
  id: string;
  level: StoryLevelId;
  pages: readonly StoryPage[];
  title: string;
};

export type StoryLevel = {
  cefrReference: string;
  description: string;
  id: StoryLevelId;
  label: string;
};
