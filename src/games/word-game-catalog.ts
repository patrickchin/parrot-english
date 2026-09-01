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
  labelAudio: WordGameAudioLine;
  promptAudio: WordGameAudioLine;
}>;

export type WordGameQuestion = Readonly<{
  id: string;
  targetId: string;
  choiceIds: readonly [string, string, string, string];
}>;

export type WordGameQuiz = Readonly<{
  id: string;
  title: string;
  description: string;
  questions: readonly WordGameQuestion[];
  coverItem: WordGameItem;
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

export type WordGameCategoryDefinition = Readonly<{
  schemaVersion: number;
  order: number;
  id: string;
  title: string;
  description: string;
  theme: string;
  coverItemId: string;
  items: readonly WordGameItem[];
  tiers: readonly Readonly<{
    id: string;
    title: string;
    description: string;
    quizzes: readonly Readonly<{
      id: string;
      title: string;
      description: string;
      questions: readonly WordGameQuestion[];
    }>[];
  }>[];
}>;

export type WordGameCatalogDefinition = Readonly<{
  categories: readonly WordGameCategoryDefinition[];
  player: Readonly<{
    schemaVersion: number;
    successAudio: WordGameAudioLine;
    retryAudio: WordGameAudioLine;
    completeAudio: WordGameAudioLine;
  }>;
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

export function createWordGameCatalog(
  definition: WordGameCatalogDefinition,
) {
  const categoryItemLookups = new Map<string, ReadonlyMap<string, WordGameItem>>();
  const categories: readonly WordGameCategory[] = deepFreeze(
    definition.categories.map((categoryDefinition) => {
      const items: WordGameItem[] = categoryDefinition.items.map((item) => ({
        id: item.id,
        label: item.label,
        alt: item.alt,
        visual: { ...item.visual },
        labelAudio: { ...item.labelAudio },
        promptAudio: { ...item.promptAudio },
      }));
      const itemsById = new Map(items.map((item) => [item.id, item]));
      categoryItemLookups.set(categoryDefinition.id, itemsById);
      const coverItem = itemsById.get(categoryDefinition.coverItemId);
      if (!coverItem) {
        throw new Error(
          `Missing word-game cover item: ${categoryDefinition.coverItemId}`,
        );
      }

      return {
        schemaVersion: categoryDefinition.schemaVersion,
        order: categoryDefinition.order,
        id: categoryDefinition.id,
        title: categoryDefinition.title,
        description: categoryDefinition.description,
        theme: categoryDefinition.theme,
        items,
        tiers: categoryDefinition.tiers.map((tier) => ({
          id: tier.id,
          title: tier.title,
          description: tier.description,
          quizzes: tier.quizzes.map((quiz) => ({
            id: quiz.id,
            title: quiz.title,
            description: quiz.description,
            questions: quiz.questions.map((question) => ({
              id: question.id,
              targetId: question.targetId,
              choiceIds: [...question.choiceIds] as [
                string,
                string,
                string,
                string,
              ],
            })),
            coverItem: (() => {
              const item = itemsById.get(quiz.questions[0].targetId);
              if (!item) {
                throw new Error(`Missing word-game quiz cover item: ${quiz.id}`);
              }
              return item;
            })(),
          })),
        })),
        coverItem,
      };
    }),
  );
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const quizzesByCategoryAndId = new Map<string, WordGameSelection>();
  for (const category of categories) {
    for (const tier of category.tiers) {
      for (const quiz of tier.quizzes) {
        quizzesByCategoryAndId.set(
          `${category.id}\0${quiz.id}`,
          Object.freeze({ category, tier, quiz }),
        );
      }
    }
  }

  return Object.freeze({
    categories,
    player: deepFreeze({
      schemaVersion: definition.player.schemaVersion,
      successAudio: { ...definition.player.successAudio },
      retryAudio: { ...definition.player.retryAudio },
      completeAudio: { ...definition.player.completeAudio },
    }),
    resolveCategory(categoryId: string | undefined): WordGameCategory | null {
      return categoryId ? (categoriesById.get(categoryId) ?? null) : null;
    },
    resolveQuiz(
      categoryId: string | undefined,
      quizId: string | undefined,
    ): WordGameSelection | null {
      return categoryId && quizId
        ? (quizzesByCategoryAndId.get(`${categoryId}\0${quizId}`) ?? null)
        : null;
    },
    buildRounds(
      selection: WordGameSelection,
      random: () => number = Math.random,
    ): readonly WordGameRound[] {
      const itemsById = categoryItemLookups.get(selection.category.id);
      if (!itemsById) {
        throw new Error(`Missing word-game category items: ${selection.category.id}`);
      }

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
    },
  });
}

const WORD_GAME_CATALOG = createWordGameCatalog(GENERATED_WORD_GAME_CATALOG);

export const WORD_GAME_CATEGORIES = WORD_GAME_CATALOG.categories;
export const WORD_GAME_CORRECT_AUDIO = WORD_GAME_CATALOG.player.successAudio;
export const WORD_GAME_RETRY_AUDIO = WORD_GAME_CATALOG.player.retryAudio;
export const WORD_GAME_COMPLETE_AUDIO = WORD_GAME_CATALOG.player.completeAudio;

export function resolveWordGameCategory(
  categoryId: string | undefined,
): WordGameCategory | null {
  return WORD_GAME_CATALOG.resolveCategory(categoryId);
}

export function resolveWordGameQuiz(
  categoryId: string | undefined,
  quizId: string | undefined,
): WordGameSelection | null {
  return WORD_GAME_CATALOG.resolveQuiz(categoryId, quizId);
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
  return WORD_GAME_CATALOG.buildRounds(selection, random);
}
