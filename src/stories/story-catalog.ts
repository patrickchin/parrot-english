import type { StoryLevelId } from "../../lib/story-level.ts";
import { LONG_STORIES } from "./long-stories.ts";
import { STORY_SCRIPT_CANDIDATES } from "./story-script-candidates.ts";
import type {
  Story,
  StoryLevel,
  StoryVocabularyProfile,
  StoryVocabularyProfileId,
} from "./story-types.ts";

export {
  LEARNER_STORY_LEVEL_IDS,
  STORY_LEVEL_IDS,
  isLearnerStoryLevelId,
  isStoryLevelId,
  type LearnerStoryLevelId,
  type StoryLevelId,
} from "../../lib/story-level.ts";

export type {
  Story,
  StoryArtwork,
  StoryLevel,
  StoryPage,
  StoryPromptExperiment,
  StoryVocabularyProfile,
  StoryVocabularyProfileId,
} from "./story-types.ts";

const CAMBRIDGE_YLE_WORDLIST_URL =
  "https://www.cambridgeenglish.org/Images/739104-starters-movers-flyers-word-list-2025.pdf";

const FIRST_ENGLISH_WORDS_CORE = ["a", "on"] as const;

const FIRST_WORDS_CORE = [
  "a",
  "am",
  "and",
  "are",
  "can",
  "for",
  "has",
  "here",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "no",
  "not",
  "now",
  "on",
  "one",
  "the",
  "there",
  "to",
  "two",
  "up",
  "we",
  "where",
  "which",
  "yes",
  "you",
] as const;

const REPEATING_PATTERNS_CORE = [
  ...FIRST_WORDS_CORE,
  "again",
  "does",
  "her",
  "off",
  "she",
  "too",
  "you're",
] as const;

const TINY_STORIES_CORE = [
  ...REPEATING_PATTERNS_CORE,
  "by",
  "he",
  "them",
  "they",
] as const;

const EARLY_A1_CORE = [
  ...TINY_STORIES_CORE,
  "an",
  "as",
  "at",
  "away",
  "back",
  "be",
  "cannot",
  "each",
  "from",
  "his",
  "our",
  "this",
  "will",
  "with",
] as const;

export const STORY_VOCABULARY_PROFILES: readonly StoryVocabularyProfile[] = [
  {
    id: "first-english-words-v1",
    basis:
      "Only directly pictured scaffolding used by the zero-assumption stories; every content word must be a target.",
    coreWords: FIRST_ENGLISH_WORDS_CORE,
    sourceUrl: CAMBRIDGE_YLE_WORDLIST_URL,
  },
  {
    id: "first-words-v1",
    basis:
      "Small prototype grammar inventory; content words must be targets or explicitly assumed familiar. Cambridge YLE 2025 is a candidate source, not an age norm.",
    coreWords: FIRST_WORDS_CORE,
    sourceUrl: CAMBRIDGE_YLE_WORDLIST_URL,
  },
  {
    id: "repeating-patterns-v1",
    basis:
      "Cumulative prototype grammar inventory for supported Pre-A1; validate every assumed word with the child.",
    coreWords: REPEATING_PATTERNS_CORE,
    sourceUrl: CAMBRIDGE_YLE_WORDLIST_URL,
  },
  {
    id: "tiny-stories-v1",
    basis:
      "Cumulative prototype grammar inventory for secure Pre-A1 read-alouds; it is not a placement result.",
    coreWords: TINY_STORIES_CORE,
    sourceUrl: CAMBRIDGE_YLE_WORDLIST_URL,
  },
  {
    id: "early-a1-v1",
    basis:
      "Cumulative prototype grammar inventory for a Pre-A1 to A1 bridge; it is not a universal known-word list.",
    coreWords: EARLY_A1_CORE,
    sourceUrl: CAMBRIDGE_YLE_WORDLIST_URL,
  },
];

export const STORY_LEVELS: readonly StoryLevel[] = [
  {
    id: "first-english-words",
    label: "First English words",
    cefrReference: "Before Pre-A1",
    description: "Look. Listen. Say it.",
    maxAssumedKnownWords: 0,
    maxNarrativeWordsPerPage: 6,
    maxNarrativeWordsTotal: 30,
    targetWordRange: [4, 6],
    vocabularyProfileId: "first-english-words-v1",
  },
  {
    id: "first-words",
    label: "Start here",
    cefrReference: "Entry Pre-A1",
    description: "Very short. One idea on each page.",
    maxAssumedKnownWords: 3,
    maxNarrativeWordsPerPage: 8,
    maxNarrativeWordsTotal: 36,
    targetWordRange: [4, 6],
    vocabularyProfileId: "first-words-v1",
  },
  {
    id: "repeating-patterns",
    label: "Say it again",
    cefrReference: "Supported Pre-A1",
    description: "The same words come back.",
    maxAssumedKnownWords: 5,
    maxNarrativeWordsPerPage: 12,
    maxNarrativeWordsTotal: 58,
    targetWordRange: [5, 6],
    vocabularyProfileId: "repeating-patterns-v1",
  },
  {
    id: "tiny-stories",
    label: "Little stories",
    cefrReference: "Secure Pre-A1",
    description: "A little story with short lines.",
    maxAssumedKnownWords: 12,
    maxNarrativeWordsPerPage: 12,
    maxNarrativeWordsTotal: 65,
    targetWordRange: [6, 7],
    vocabularyProfileId: "tiny-stories-v1",
  },
  {
    id: "early-a1",
    label: "Big adventures",
    cefrReference: "Pre-A1 to A1 bridge",
    description: "A longer story with more words.",
    maxAssumedKnownWords: 18,
    maxNarrativeWordsPerPage: 14,
    maxNarrativeWordsTotal: 80,
    targetWordRange: [7, 8],
    vocabularyProfileId: "early-a1-v1",
  },
  {
    id: "long-stories",
    label: "Long stories",
    cefrReference: "Read aloud",
    description: "Longer stories with saved narration.",
    maxAssumedKnownWords: 0,
    maxNarrativeWordsPerPage: 90,
    maxNarrativeWordsTotal: 2_000,
    targetWordRange: [0, 0],
    vocabularyProfileId: "early-a1-v1",
  },
];

const STORY_LEVEL_ORDER = new Map(
  STORY_LEVELS.map(({ id }, index) => [id, index]),
);

export const STORIES: readonly Story[] = [
  ...STORY_SCRIPT_CANDIDATES,
  ...LONG_STORIES,
].sort(
  (firstStory, secondStory) =>
    (STORY_LEVEL_ORDER.get(firstStory.level) ?? 0) -
    (STORY_LEVEL_ORDER.get(secondStory.level) ?? 0),
);

export function countStoryWords(text: string): number {
  return text.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)?.length ?? 0;
}

export function getStoryLevel(levelId: StoryLevelId): StoryLevel {
  const level = STORY_LEVELS.find(({ id }) => id === levelId);
  if (!level) {
    throw new Error(`Unknown story level: ${levelId}`);
  }
  return level;
}

export function getStoryVocabularyProfile(
  profileId: StoryVocabularyProfileId,
): StoryVocabularyProfile {
  const profile = STORY_VOCABULARY_PROFILES.find(({ id }) => id === profileId);
  if (!profile) {
    throw new Error(`Unknown story vocabulary profile: ${profileId}`);
  }
  return profile;
}

const NON_TEACHING_STORY_TOKENS = new Set([
  // Familiar names used consistently across beginner stories.
  "ben",
  "bob",
  "jack",
  "mary",
  "rose",
  "sam",
  // Participation sounds and exclamations.
  "beep",
  "boom",
  "bump",
  "chik",
  "crunch",
  "ding",
  "drip",
  "drop",
  "hooray",
  "la",
  "oh",
  "splash",
  "swish",
  "tap",
  "whoosh",
  "yum",
]);

const STORY_WORD_LEMMAS = new Map([
  ["apples", "apple"],
  ["asks", "ask"],
  ["ben's", "ben"],
  ["brushes", "brush"],
  ["crackers", "cracker"],
  ["eats", "eat"],
  ["eyes", "eye"],
  ["flies", "fly"],
  ["fits", "fit"],
  ["found", "find"],
  ["friends", "friend"],
  ["gets", "get"],
  ["gives", "give"],
  ["glows", "glow"],
  ["goes", "go"],
  ["grows", "grow"],
  ["hats", "hat"],
  ["holds", "hold"],
  ["jumps", "jump"],
  ["lifts", "lift"],
  ["lights", "light"],
  ["looks", "look"],
  ["plants", "plant"],
  ["pulls", "pull"],
  ["puts", "put"],
  ["rolls", "roll"],
  ["rose's", "rose"],
  ["runs", "run"],
  ["says", "say"],
  ["sees", "see"],
  ["shoes", "shoe"],
  ["shuts", "shut"],
  ["sits", "sit"],
  ["sleeps", "sleep"],
  ["smiles", "smile"],
  ["socks", "sock"],
  ["stops", "stop"],
  ["takes", "take"],
  ["tries", "try"],
  ["walks", "walk"],
  ["wakes", "wake"],
  ["washes", "wash"],
]);

function storyWordTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+(?:['’][a-z]+)?/g) ?? []).map(
    (word) => word.replace("’", "'"),
  );
}

function vocabularyCandidates(word: string): readonly string[] {
  const lemma = STORY_WORD_LEMMAS.get(word);
  return lemma ? [word, lemma] : [word];
}

export function auditStoryVocabulary(story: Story): {
  profileId: StoryVocabularyProfileId;
  unlistedWords: readonly string[];
} {
  const level = getStoryLevel(story.level);
  const profile = getStoryVocabularyProfile(level.vocabularyProfileId);
  const allowedWords = new Set([
    ...profile.coreWords,
    ...story.assumedKnownWords.flatMap(storyWordTokens),
    ...story.targetWords.flatMap(storyWordTokens),
    ...NON_TEACHING_STORY_TOKENS,
  ]);
  const scriptWords = storyWordTokens(
    `${story.pages.map(({ joinIn, text }) => `${text} ${joinIn}`).join(" ")} ${story.completionText}`,
  );
  const unlistedWords = [
    ...new Set(
      scriptWords.filter(
        (word) =>
          !vocabularyCandidates(word).some((candidate) =>
            allowedWords.has(candidate),
          ),
      ),
    ),
  ].sort();

  return { profileId: profile.id, unlistedWords };
}

export function resolveStory(storyId: string | undefined): Story | null {
  if (!storyId) return null;
  return STORIES.find((story) => story.id === storyId) ?? null;
}
