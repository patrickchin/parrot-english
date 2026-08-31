import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WORD_GAME_COMPLETE_AUDIO,
  WORD_GAME_RETRY_AUDIO,
  WORD_GAME_TOPICS,
  buildWordGameRounds,
  getWordGameRoute,
  resolveWordGameTopic,
} from "../src/games/word-game-catalog.ts";
import { getStaticAudioLineById } from "../lib/static-audio.js";

const BITMAP_BASE = "https://media.parrotbook.com/assets/v8/word-games";
const COLOR_SWATCHES = {
  red: "#ef4444",
  blue: "#3b82f6",
  yellow: "#eab308",
  green: "#22c55e",
  orange: "#f97316",
  purple: "#a855f7",
};
const ALT_TEXT = {
  animals: ["A friendly cat.", "A friendly dog.", "A friendly bird.", "A friendly fish.", "A friendly duck.", "A friendly frog."],
  colors: ["The color red.", "The color blue.", "The color yellow.", "The color green.", "The color orange.", "The color purple."],
  "body-parts": ["A pair of eyes.", "A pair of ears.", "A nose.", "A mouth.", "A hand.", "A foot."],
  food: ["An apple.", "A banana.", "A carrot.", "An orange.", "Bread.", "Cheese."],
  toys: ["A ball.", "A toy car.", "A doll.", "A kite.", "Building blocks.", "A teddy bear."],
  feelings: ["A happy face.", "A sad face.", "An angry face.", "A sleepy face.", "A surprised face.", "A silly face."],
};

const TOPICS = [
  ["animals", "Animals", [
    ["cat", "cat", "Which is the cat?", "This is a cat.", "Yes, this is a cat."],
    ["dog", "dog", "Which is the dog?", "This is a dog.", "Yes, this is a dog."],
    ["bird", "bird", "Which is the bird?", "This is a bird.", "Yes, this is a bird."],
    ["fish", "fish", "Which is the fish?", "This is a fish.", "Yes, this is a fish."],
    ["duck", "duck", "Which is the duck?", "This is a duck.", "Yes, this is a duck."],
    ["frog", "frog", "Which is the frog?", "This is a frog.", "Yes, this is a frog."],
  ]],
  ["colors", "Colors", [
    ["red", "red", "Where is red?", "This is red.", "Yes, this is red."],
    ["blue", "blue", "Where is blue?", "This is blue.", "Yes, this is blue."],
    ["yellow", "yellow", "Where is yellow?", "This is yellow.", "Yes, this is yellow."],
    ["green", "green", "Where is green?", "This is green.", "Yes, this is green."],
    ["orange", "orange", "Where is orange?", "This is orange.", "Yes, this is orange."],
    ["purple", "purple", "Where is purple?", "This is purple.", "Yes, this is purple."],
  ]],
  ["body-parts", "Body Parts", [
    ["eyes", "eyes", "Where are the eyes?", "These are the eyes.", "Yes, these are the eyes."],
    ["ears", "ears", "Where are the ears?", "These are the ears.", "Yes, these are the ears."],
    ["nose", "nose", "Which is the nose?", "This is a nose.", "Yes, this is a nose."],
    ["mouth", "mouth", "Which is the mouth?", "This is a mouth.", "Yes, this is a mouth."],
    ["hand", "hand", "Which is the hand?", "This is a hand.", "Yes, this is a hand."],
    ["foot", "foot", "Which is the foot?", "This is a foot.", "Yes, this is a foot."],
  ]],
  ["food", "Food", [
    ["apple", "apple", "Which is the apple?", "This is an apple.", "Yes, this is an apple."],
    ["banana", "banana", "Which is the banana?", "This is a banana.", "Yes, this is a banana."],
    ["carrot", "carrot", "Which is the carrot?", "This is a carrot.", "Yes, this is a carrot."],
    ["orange", "orange", "Which is the orange?", "This is an orange.", "Yes, this is an orange."],
    ["bread", "bread", "Which is the bread?", "This is bread.", "Yes, this is bread."],
    ["cheese", "cheese", "Which is the cheese?", "This is cheese.", "Yes, this is cheese."],
  ]],
  ["toys", "Toys", [
    ["ball", "ball", "Which is the ball?", "This is a ball.", "Yes, this is a ball."],
    ["toy-car", "toy car", "Which is the toy car?", "This is a toy car.", "Yes, this is a toy car."],
    ["doll", "doll", "Which is the doll?", "This is a doll.", "Yes, this is a doll."],
    ["kite", "kite", "Which is the kite?", "This is a kite.", "Yes, this is a kite."],
    ["blocks", "blocks", "Where are the blocks?", "These are blocks.", "Yes, these are blocks."],
    ["teddy-bear", "teddy bear", "Which is the teddy bear?", "This is a teddy bear.", "Yes, this is a teddy bear."],
  ]],
  ["feelings", "Feelings", [
    ["happy", "happy", "Which face is happy?", "This face is happy.", "Yes, this face is happy."],
    ["sad", "sad", "Which face is sad?", "This face is sad.", "Yes, this face is sad."],
    ["angry", "angry", "Which face is angry?", "This face is angry.", "Yes, this face is angry."],
    ["sleepy", "sleepy", "Which face is sleepy?", "This face is sleepy.", "Yes, this face is sleepy."],
    ["surprised", "surprised", "Which face is surprised?", "This face is surprised.", "Yes, this face is surprised."],
    ["silly", "silly", "Which face is silly?", "This face is silly.", "Yes, this face is silly."],
  ]],
];

describe("word-game catalog", () => {
  it("pins the six ordered topics and every natural authored line", () => {
    assert.equal(WORD_GAME_TOPICS.length, 6);
    assert.deepEqual(WORD_GAME_TOPICS.map(({ id, title }) => [id, title]), TOPICS.map(([id, title]) => [id, title]));

    for (const [topicId, , expectedItems] of TOPICS) {
      const topic = resolveWordGameTopic(topicId);
      assert.ok(topic);
      assert.equal(topic.items.length, 6);
      assert.deepEqual(topic.items.map(({ id, label, prompt, teachingLabel, successSentence }) =>
        [id, label, prompt, teachingLabel, successSentence]), expectedItems);
      assert.deepEqual(topic.items.map(({ alt }) => alt), ALT_TEXT[topicId]);
      assert.equal(Object.isFrozen(topic), true);
      assert.equal(Object.isFrozen(topic.items), true);
      assert.ok(topic.items.every((item) => Object.isFrozen(item) && Object.isFrozen(item.audio)));
    }
  });

  it("provides stable saved audio descriptors derived from each authored item", () => {
    const items = WORD_GAME_TOPICS.flatMap(({ items }) => items);
    assert.equal(new Set(WORD_GAME_TOPICS.flatMap(({ id: topicId, items: topicItems }) =>
      topicItems.map(({ id }) => `${topicId}/${id}`))).size, 36);
    const audio = items.flatMap(({ audio }) => Object.values(audio));
    assert.equal(audio.length, 108);
    assert.equal(new Set(audio.map(({ id }) => id)).size, 108);

    for (const item of items) {
      assert.deepEqual(item.audio, {
        prompt: {
          id: `word-game-${topicIdFor(item)}-${item.id}-prompt`,
          source: `/assets/audio/word-game-${topicIdFor(item)}-${item.id}-prompt.mp3`,
          text: item.prompt,
        },
        label: {
          id: `word-game-${topicIdFor(item)}-${item.id}-label`,
          source: `/assets/audio/word-game-${topicIdFor(item)}-${item.id}-label.mp3`,
          text: item.teachingLabel,
        },
        correct: {
          id: `word-game-${topicIdFor(item)}-${item.id}-correct`,
          source: `/assets/audio/word-game-${topicIdFor(item)}-${item.id}-correct.mp3`,
          text: item.successSentence,
        },
      });
    }
  });

  it("provides the two generic saved player lines", () => {
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
    assert.equal(Object.isFrozen(WORD_GAME_RETRY_AUDIO), true);
    assert.equal(Object.isFrozen(WORD_GAME_COMPLETE_AUDIO), true);
  });

  it("resolves every player cue by its stable saved-audio ID", () => {
    const cues = [...WORD_GAME_TOPICS.flatMap(({ items }) => items.flatMap(({ audio }) => Object.values(audio))), WORD_GAME_RETRY_AUDIO, WORD_GAME_COMPLETE_AUDIO];
    assert.equal(cues.length, 110);
    assert.equal(new Set(cues.map(({ id }) => id)).size, 110);
    for (const cue of cues) {
      const line = getStaticAudioLineById(cue.id);
      assert.equal(line.id, cue.id);
      assert.equal(line.src, cue.source);
      assert.equal(line.text, cue.text);
      assert.equal(line.speaker, "narrator");
    }
  });

  it("pins isolated bitmap art and native color swatches", () => {
    for (const topic of WORD_GAME_TOPICS) {
      for (const item of topic.items) {
        assert.match(item.alt, /.+/);
        if (topic.id === "colors") {
          assert.deepEqual(Object.keys(item.visual), ["kind", "color"]);
          assert.equal(item.visual.kind, "swatch");
          assert.equal(item.visual.color, COLOR_SWATCHES[item.id]);
        } else {
          assert.equal(item.visual.kind, "image");
          assert.equal(item.visual.src, `${BITMAP_BASE}/${topic.id}/${item.id}.webp`);
        }
      }
    }
  });

  it("resolves only known topics and builds their canonical routes", () => {
    assert.equal(resolveWordGameTopic("animals"), WORD_GAME_TOPICS[0]);
    assert.equal(resolveWordGameTopic("missing"), null);
    assert.equal(resolveWordGameTopic(undefined), null);
    assert.equal(getWordGameRoute("feelings"), "/word-games/feelings");
  });

  it("builds deterministic rounds with rotating correct positions and unique choices", () => {
    for (const topic of WORD_GAME_TOPICS) {
      const rounds = buildWordGameRounds(topic);
      assert.equal(rounds.length, 6);
      assert.deepEqual(rounds.map(({ target }) => target.id), topic.items.map(({ id }) => id));
      assert.deepEqual(rounds.map(({ choices, target }) => choices.indexOf(target)), [0, 1, 2, 0, 1, 2]);
      assert.ok(rounds.every(({ choices }) => choices.length === 3 && new Set(choices.map(({ id }) => id)).size === 3));
      assert.deepEqual(buildWordGameRounds(topic), rounds);
    }
  });

  it("excludes retired vague and cleanliness content", () => {
    const content = JSON.stringify(WORD_GAME_TOPICS).toLowerCase();
    for (const retiredText of ["what is on the hands", "how are the hands", "soap", "washing", "cleanliness", "clean hands"]) {
      assert.equal(content.includes(retiredText), false, retiredText);
    }
  });
});

function topicIdFor(item) {
  return WORD_GAME_TOPICS.find(({ items }) => items.includes(item)).id;
}
