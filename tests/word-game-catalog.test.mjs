import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GENERATED_WORD_GAME_CATALOG } from "../src/games/generated-word-game-catalog.ts";
import {
  WORD_GAME_CATEGORIES,
  WORD_GAME_COMPLETE_AUDIO,
  WORD_GAME_CORRECT_AUDIO,
  WORD_GAME_RETRY_AUDIO,
  buildWordGameRounds,
  getWordGameCategoryRoute,
  getWordGameQuizRoute,
  resolveWordGameCategory,
  resolveWordGameQuiz,
} from "../src/games/word-game-catalog.ts";
import { getStaticAudioLineById } from "../lib/static-audio.js";

function assertDeepFrozen(value) {
  if (!value || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function sequenceRandom(samples) {
  let index = 0;
  return () => samples[index++];
}

describe("generated word-game catalog runtime", () => {
  it("maps the complete ordered generated catalog once and deeply freezes it", () => {
    assert.deepEqual(
      WORD_GAME_CATEGORIES.map(({ id }) => id),
      ["animals", "colors", "body-parts", "food", "toys", "feelings", "home", "clothes", "transport"],
    );
    assert.equal(WORD_GAME_CATEGORIES.length, 9);
    assert.equal(WORD_GAME_CATEGORIES.flatMap(({ items }) => items).length, 107);
    assert.equal(WORD_GAME_CATEGORIES.flatMap(({ tiers }) => tiers).length, 27);
    assert.equal(
      WORD_GAME_CATEGORIES.flatMap(({ tiers }) => tiers.flatMap(({ quizzes }) => quizzes)).length,
      81,
    );
    assert.ok(WORD_GAME_CATEGORIES.every(({ tiers }) =>
      tiers.every(({ quizzes }) => quizzes.every(({ questions }) => questions.length === 6))));
    assert.deepEqual(
      WORD_GAME_CATEGORIES.map(({ id, items, tiers }) => ({
        id,
        itemIds: items.map(({ id: itemId }) => itemId),
        quizzes: tiers.flatMap(({ quizzes }) => quizzes.map(({ id: quizId }) => quizId)),
      })),
      GENERATED_WORD_GAME_CATALOG.categories.map(({ id, items, tiers }) => ({
        id,
        itemIds: items.map(({ id: itemId }) => itemId),
        quizzes: tiers.flatMap(({ quizzes }) => quizzes.map(({ id: quizId }) => quizId)),
      })),
    );
    assertDeepFrozen(WORD_GAME_CATEGORIES);
  });

  it("resolves canonical categories, cover items, quizzes, tiers, and routes", () => {
    const animals = resolveWordGameCategory("animals");
    assert.equal(animals, WORD_GAME_CATEGORIES[0]);
    assert.equal(animals.coverItem.id, "cat");
    assert.equal(animals.coverItem, animals.items[0]);
    assert.equal(resolveWordGameCategory("missing"), null);
    assert.equal(resolveWordGameCategory(undefined), null);

    for (const category of WORD_GAME_CATEGORIES) {
      assert.equal(getWordGameCategoryRoute(category.id), `/word-games/${category.id}`);
      for (const tier of category.tiers) {
        for (const quiz of tier.quizzes) {
          const selection = resolveWordGameQuiz(category.id, quiz.id);
          assert.deepEqual(selection, { category, tier, quiz });
          assertDeepFrozen(selection);
          assert.equal(quiz.coverItem.id, quiz.questions[0].targetId);
          assert.ok(category.items.includes(quiz.coverItem));
          assert.equal(
            getWordGameQuizRoute(category.id, quiz.id),
            `/word-games/${category.id}/${quiz.id}`,
          );
        }
      }
    }
    assert.equal(resolveWordGameQuiz("animals", "missing"), null);
    assert.equal(resolveWordGameQuiz("missing", "simple-1"), null);
    assert.equal(resolveWordGameQuiz(undefined, undefined), null);
  });

  it("provides both saved cues per item, deliberate label reuse, and JSON-owned player cues", () => {
    const items = WORD_GAME_CATEGORIES.flatMap(({ items }) => items);
    const audio = items.flatMap(({ labelAudio, promptAudio }) => [labelAudio, promptAudio]);
    assert.equal(audio.length, 214);
    assert.equal(new Set(audio.map(({ id }) => id)).size, 213);
    assert.equal(new Set(items.map(({ labelAudio }) => labelAudio.id)).size, 106);
    assert.equal(new Set(items.map(({ promptAudio }) => promptAudio.id)).size, 107);
    for (const cue of [...audio, WORD_GAME_CORRECT_AUDIO, WORD_GAME_RETRY_AUDIO, WORD_GAME_COMPLETE_AUDIO]) {
      const line = getStaticAudioLineById(cue.id);
      assert.equal(line.id, cue.id);
      assert.equal(line.src, cue.source);
      assert.equal(line.text, cue.text);
      assert.equal(line.speaker, "narrator");
    }
    assert.deepEqual(WORD_GAME_CORRECT_AUDIO, {
      id: "word-game-correct",
      source: "/assets/audio/word-game-correct.mp3",
      text: "Correct!",
    });
    assert.deepEqual(WORD_GAME_RETRY_AUDIO, {
      id: "word-game-retry",
      source: "/assets/audio/word-game-retry.mp3",
      text: "Listen and try again.",
    });
    assert.deepEqual(WORD_GAME_COMPLETE_AUDIO, {
      id: "word-game-complete",
      source: "/assets/audio/word-game-complete.mp3",
      text: "Great listening! You finished the game.",
    });
    assertDeepFrozen(WORD_GAME_CORRECT_AUDIO);
    assertDeepFrozen(WORD_GAME_RETRY_AUDIO);
    assertDeepFrozen(WORD_GAME_COMPLETE_AUDIO);
  });

  it("keeps authored questions and choice membership immutable while shuffling fresh tuples", () => {
    const selection = resolveWordGameQuiz("animals", "simple-1");
    assert.ok(selection);
    const authoredQuestionIds = selection.quiz.questions.map(({ id }) => id);
    const authoredChoiceIds = [...selection.quiz.questions[0].choiceIds];
    const rounds = buildWordGameRounds(selection, sequenceRandom(new Array(18).fill(0)));

    assert.deepEqual(rounds.map(({ question }) => question.id), authoredQuestionIds);
    assert.deepEqual(new Set(rounds[0].choices.map(({ id }) => id)), new Set(authoredChoiceIds));
    assert.notEqual(rounds[0].choices.indexOf(rounds[0].target), 0);
    assert.deepEqual(selection.quiz.questions[0].choiceIds, authoredChoiceIds);
    assertDeepFrozen(rounds);
    assert.notEqual(buildWordGameRounds(selection, () => 0), rounds);
  });

  it("can place the first target in each of the four display positions", () => {
    const selection = resolveWordGameQuiz("animals", "simple-1");
    assert.ok(selection);
    const near1 = 1 - Number.EPSILON;
    for (const [samples, expectedPosition] of [
      [[near1, near1, near1], 0],
      [[near1, near1, 0], 1],
      [[near1, 0, near1], 2],
      [[0, 0, 0], 3],
    ]) {
      const random = sequenceRandom([...samples, ...new Array(15).fill(0)]);
      const [round] = buildWordGameRounds(selection, random);
      assert.equal(round.choices.indexOf(round.target), expectedPosition);
    }
  });

  it("rejects every invalid RNG sample before it can corrupt a choice tuple", () => {
    const selection = resolveWordGameQuiz("animals", "simple-1");
    assert.ok(selection);
    for (const sample of [-1, 1, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
      assert.throws(
        () => buildWordGameRounds(selection, () => sample),
        new TypeError("random must return a value in [0, 1)"),
      );
    }
  });
});
