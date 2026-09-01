import { GENERATED_WORD_GAME_CATALOG } from "./generated-word-game-catalog.ts";

export type WordGameAudioLine = Readonly<{
  id: string;
  source: string;
  text: string;
}>;

export type WordGameVisual =
  | Readonly<{ kind: "image"; src: string }>
  | Readonly<{ kind: "swatch"; color: string }>;

export type WordGameItem = Readonly<{
  id: string;
  label: string;
  alt: string;
  visual: WordGameVisual;
  audio: WordGameAudioLine;
}>;

export type WordGameQuestion = Readonly<{
  id: string;
  prompt: string;
  success: string;
  targetId: string;
  choiceIds: readonly [string, string, string, string];
}>;

export type WordGameQuiz = Readonly<{
  id: string;
  title: string;
  description: string;
  questions: readonly WordGameQuestion[];
}>;

export type WordGameTier = Readonly<{
  id: string;
  title: string;
  description: string;
  quizzes: readonly WordGameQuiz[];
}>;

export type WordGameCategory = Readonly<{
  schemaVersion: number;
  order: number;
  id: string;
  title: string;
  description: string;
  theme: string;
  items: readonly WordGameItem[];
  tiers: readonly WordGameTier[];
  coverItem: WordGameItem;
}>;

export type WordGameSelection = Readonly<{
  category: WordGameCategory;
  tier: WordGameTier;
  quiz: WordGameQuiz;
}>;

export type WordGameRound = Readonly<{
  question: WordGameQuestion;
  target: WordGameItem;
  choices: readonly WordGameItem[];
}>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function audioLine(id: string, text: string): WordGameAudioLine {
  return { id, source: `/assets/audio/${id}.mp3`, text };
}

export const WORD_GAME_RETRY_AUDIO = deepFreeze(
  audioLine("word-game-retry", "Listen and try again."),
);

export const WORD_GAME_COMPLETE_AUDIO = deepFreeze(
  audioLine("word-game-complete", "Great listening! You finished the game."),
);

export const WORD_GAME_SUCCESS_AUDIO = deepFreeze(
  audioLine("narrator-feedback-success", "Great job!"),
);

const CATEGORY_ITEM_LOOKUPS = new Map<string, ReadonlyMap<string, WordGameItem>>();

export const WORD_GAME_CATEGORIES: readonly WordGameCategory[] = deepFreeze(
  GENERATED_WORD_GAME_CATALOG.map((definition) => {
    const items: WordGameItem[] = definition.items.map((item) => ({
      id: item.id,
      label: item.label,
      alt: item.alt,
      visual: { ...item.visual },
      audio: { ...item.audio },
    }));
    const itemsById = new Map(items.map((item) => [item.id, item]));
    CATEGORY_ITEM_LOOKUPS.set(definition.id, itemsById);
    const coverItem = itemsById.get(definition.coverItemId);
    if (!coverItem) throw new Error(`Missing word-game cover item: ${definition.coverItemId}`);

    return {
      schemaVersion: definition.schemaVersion,
      order: definition.order,
      id: definition.id,
      title: definition.title,
      description: definition.description,
      theme: definition.theme,
      items,
      tiers: definition.tiers.map((tier) => ({
        id: tier.id,
        title: tier.title,
        description: tier.description,
        quizzes: tier.quizzes.map((quiz) => ({
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          questions: quiz.questions.map((question) => ({
            id: question.id,
            prompt: question.prompt,
            success: question.success,
            targetId: question.targetId,
            choiceIds: [...question.choiceIds] as [string, string, string, string],
          })),
        })),
      })),
      coverItem,
    };
  }),
);

const CATEGORIES_BY_ID = new Map(
  WORD_GAME_CATEGORIES.map((category) => [category.id, category]),
);

const QUIZZES_BY_CATEGORY_AND_ID = new Map<string, WordGameSelection>();
for (const category of WORD_GAME_CATEGORIES) {
  for (const tier of category.tiers) {
    for (const quiz of tier.quizzes) {
      QUIZZES_BY_CATEGORY_AND_ID.set(
        `${category.id}\0${quiz.id}`,
        Object.freeze({ category, tier, quiz }),
      );
    }
  }
}

export function resolveWordGameCategory(
  categoryId: string | undefined,
): WordGameCategory | null {
  return categoryId ? (CATEGORIES_BY_ID.get(categoryId) ?? null) : null;
}

export function resolveWordGameQuiz(
  categoryId: string | undefined,
  quizId: string | undefined,
): WordGameSelection | null {
  return categoryId && quizId
    ? (QUIZZES_BY_CATEGORY_AND_ID.get(`${categoryId}\0${quizId}`) ?? null)
    : null;
}

export function getWordGameCategoryRoute(categoryId: string): string {
  return `/word-games/${categoryId}`;
}

export function getWordGameQuizRoute(categoryId: string, quizId: string): string {
  return `${getWordGameCategoryRoute(categoryId)}/${quizId}`;
}

function shuffled<T>(values: readonly T[], random: () => number): readonly T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const sample = random();
    if (!(sample >= 0 && sample < 1)) {
      throw new TypeError("random must return a value in [0, 1)");
    }
    const swapIndex = Math.floor(sample * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return Object.freeze(result);
}

export function buildWordGameRounds(
  selection: WordGameSelection,
  random: () => number = Math.random,
): readonly WordGameRound[] {
  const itemsById = CATEGORY_ITEM_LOOKUPS.get(selection.category.id);
  if (!itemsById) throw new Error(`Missing word-game category items: ${selection.category.id}`);

  return deepFreeze(selection.quiz.questions.map((question) => {
    const target = itemsById.get(question.targetId);
    const choices = question.choiceIds.map((itemId) => itemsById.get(itemId));
    if (!target || choices.some((choice) => !choice)) {
      throw new Error(`Missing word-game item for question: ${question.id}`);
    }
    return {
      question,
      target,
      choices: shuffled(choices as WordGameItem[], random),
    };
  }));
}
