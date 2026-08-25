export type StoryLevelId =
  | "first-words"
  | "repeating-patterns"
  | "tiny-stories"
  | "early-a1"
  | "long-stories";

export type StoryVocabularyProfileId =
  | "first-words-v1"
  | "repeating-patterns-v1"
  | "tiny-stories-v1"
  | "early-a1-v1";

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
  narrationAudioSrc?: string;
  text: string;
};

export type StoryPromptExperiment = {
  exactRefrain?: string;
  focus: string;
  hypothesis: string;
  instruction: string;
};

export type Story = {
  assumedKnownWords: readonly string[];
  category: string;
  completionText: string;
  cover: StoryArtwork;
  durationMinutes: number;
  id: string;
  level: StoryLevelId;
  pages: readonly StoryPage[];
  promptExperiment: StoryPromptExperiment;
  summary: string;
  targetWords: readonly string[];
  title: string;
};

export type StoryLevel = {
  cefrReference: string;
  description: string;
  id: StoryLevelId;
  label: string;
  maxAssumedKnownWords: number;
  maxNarrativeWordsPerPage: number;
  maxNarrativeWordsTotal: number;
  targetWordRange: readonly [number, number];
  vocabularyProfileId: StoryVocabularyProfileId;
};

export type StoryVocabularyProfile = {
  basis: string;
  coreWords: readonly string[];
  id: StoryVocabularyProfileId;
  sourceUrl: string;
};
