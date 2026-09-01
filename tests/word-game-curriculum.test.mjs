import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { planWordGameAudio } from "../scripts/word-game/compiler.mjs";
import { parseWordGameManifest } from "../scripts/word-game/manifest.mjs";
import { WORD_GAME_MISSING_AUDIO_IDS } from "./fixtures/word-game-missing-audio-ids.mjs";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const categoryRoot = path.join(rootDir, "content", "word-games", "categories");
const QUIZ_ORDERS = [
  [0, 1, 2, 3, 4, 5],
  [2, 4, 0, 5, 1, 3],
  [4, 1, 3, 0, 5, 2],
];
const QUIZ_PASSES = ["First look", "Mix it up", "Quick check"];

const TARGETS = {
  animals: {
    simple: ["cat", "dog", "bird", "fish", "duck", "frog"],
    intermediate: ["cat", "dog", "bird", "pig", "cow", "horse"],
    advanced: ["pig", "cow", "horse", "alligator", "elephant", "giraffe"],
  },
  colors: {
    simple: ["red", "blue", "yellow", "green", "orange", "purple"],
    intermediate: ["red", "blue", "yellow", "black", "white", "pink"],
    advanced: ["black", "white", "pink", "brown", "gray", "purple"],
  },
  "body-parts": {
    simple: ["eyes", "ears", "nose", "mouth", "hand", "foot"],
    intermediate: ["eyes", "ears", "hand", "arm", "leg", "tooth"],
    advanced: ["arm", "leg", "tooth", "tongue", "brain", "heart"],
  },
  food: {
    simple: ["apple", "banana", "carrot", "orange", "bread", "cheese"],
    intermediate: ["apple", "banana", "bread", "rice", "egg", "milk"],
    advanced: ["rice", "egg", "milk", "tomato", "potato", "sandwich"],
  },
  toys: {
    simple: ["ball", "toy-car", "doll", "kite", "blocks", "teddy-bear"],
    intermediate: ["ball", "doll", "blocks", "toy-train", "drum", "puzzle"],
    advanced: ["toy-train", "drum", "puzzle", "robot", "yo-yo", "skateboard"],
  },
  feelings: {
    simple: ["happy", "sad", "angry", "sleepy", "surprised", "silly"],
    intermediate: ["happy", "sad", "sleepy", "scared", "excited", "calm"],
    advanced: ["scared", "excited", "calm", "worried", "confused", "bored"],
  },
  home: {
    simple: ["bed", "chair", "door", "window", "house", "key"],
    intermediate: ["bed", "chair", "door", "sofa", "bathtub", "toilet"],
    advanced: ["sofa", "bathtub", "toilet", "shower", "mirror", "broom"],
  },
  clothes: {
    simple: ["shirt", "shoes", "hat", "socks", "coat", "pants"],
    intermediate: ["shirt", "shoes", "hat", "dress", "shorts", "scarf"],
    advanced: ["dress", "shorts", "scarf", "boots", "gloves", "swimsuit"],
  },
  transport: {
    simple: ["car", "bus", "bicycle", "train", "boat", "airplane"],
    intermediate: ["car", "bus", "train", "taxi", "truck", "scooter"],
    advanced: ["taxi", "truck", "scooter", "helicopter", "motorcycle", "rocket"],
  },
};

const SWATCHES = {
  red: "#ef4444",
  blue: "#3b82f6",
  yellow: "#eab308",
  green: "#22c55e",
  orange: "#f97316",
  purple: "#a855f7",
  black: "#000000",
  white: "#ffffff",
  pink: "#ec4899",
  brown: "#92400e",
  gray: "#6b7280",
};

const FLUENT_ASSET_IDS = {
  animals: {
    cat: "1f431", dog: "1f415", bird: "1f426", fish: "1f41f", duck: "1f986",
    frog: "1f438", pig: "1f437", cow: "1f404", horse: "1f40e", alligator: "1f40a",
    elephant: "1f418", giraffe: "1f992",
  },
  "body-parts": {
    eyes: "1f440", ears: "1f442", nose: "1f443", mouth: "1f444", hand: "270b",
    foot: "1f9b6", arm: "1f4aa", leg: "1f9b5", tooth: "1f9b7", tongue: "1f445",
    brain: "1f9e0", heart: "2764",
  },
  food: {
    apple: "1f34e", banana: "1f34c", carrot: "1f955", orange: "1f34a", bread: "1f35e",
    cheese: "1f9c0", rice: "1f35a", egg: "1f95a", milk: "1f95b", tomato: "1f345",
    potato: "1f954", sandwich: "1f96a",
  },
  toys: {
    ball: "26bd", "toy-car": "1f697", doll: "1fa86", kite: "1fa81", blocks: "1f9f1",
    "teddy-bear": "1f9f8", "toy-train": "1f686", drum: "1f941", puzzle: "1f9e9",
    robot: "1f916", "yo-yo": "1fa80", skateboard: "1f6f9",
  },
  feelings: {
    happy: "1f604", sad: "1f622", angry: "1f620", sleepy: "1f634", surprised: "1f62e",
    silly: "1f92a", scared: "1f628", excited: "1f929", calm: "1f60c", worried: "1f61f",
    confused: "1f615", bored: "1f611",
  },
  home: {
    bed: "1f6cf", chair: "1fa91", door: "1f6aa", window: "1fa9f", house: "1f3e0",
    key: "1f511", sofa: "1f6cb", bathtub: "1f6c1", toilet: "1f6bd", shower: "1f6bf",
    mirror: "1fa9e", broom: "1f9f9",
  },
  clothes: {
    shirt: "1f455", shoes: "1f45f", hat: "1f9e2", socks: "1f9e6", coat: "1f9e5",
    pants: "1f456", dress: "1f457", shorts: "1fa73", scarf: "1f9e3", boots: "1f462",
    gloves: "1f9e4", swimsuit: "1fa71",
  },
  transport: {
    car: "1f697", bus: "1f68c", bicycle: "1f6b2", train: "1f686", boat: "1f6a4",
    airplane: "2708", taxi: "1f695", truck: "1f69a", scooter: "1f6f4",
    helicopter: "1f681", motorcycle: "1f3cd", rocket: "1f680",
  },
};

async function readCategories() {
  const filenames = (await readdir(categoryRoot)).sort();
  return Promise.all(filenames.map(async (filename) => {
    const sourcePath = path.join(categoryRoot, filename);
    return parseWordGameManifest(JSON.parse(await readFile(sourcePath, "utf8")), sourcePath);
  }));
}

function expectedChoices(targets, index) {
  return [0, 1, 2, 3].map((offset) => targets[(index + offset) % targets.length]);
}

describe("production word-game curriculum", () => {
  it("defines the exact categories, tiers, fixed questions, and vocabulary", async () => {
    const categories = await readCategories();
    const quizzes = categories.flatMap(({ tiers }) => tiers.flatMap(({ quizzes: tierQuizzes }) => tierQuizzes));
    const questions = quizzes.flatMap(({ questions: quizQuestions }) => quizQuestions);
    const items = categories.flatMap(({ items: categoryItems }) => categoryItems);

    assert.equal(categories.length, 9);
    assert.equal(quizzes.length, 81);
    assert.equal(questions.length, 486);
    assert.equal(items.length, 107);
    assert.deepEqual(categories.map(({ id }) => id).sort(), Object.keys(TARGETS).sort());

    for (const category of categories) {
      const targetsByTier = TARGETS[category.id];
      for (const tier of category.tiers) {
        assert.equal(tier.quizzes.length, 3, `${category.id}/${tier.id} quiz count`);
        const authoredOrders = tier.quizzes.map(({ questions: quizQuestions }) =>
          quizQuestions.map(({ targetId }) => targetId));
        const expectedOrders = QUIZ_ORDERS.map((order) =>
          order.map((index) => targetsByTier[tier.id][index]));
        assert.deepEqual(authoredOrders, expectedOrders, `${category.id}/${tier.id} orders`);
        assert.equal(new Set(authoredOrders.map((order) => order.join("\0"))).size, 3);
        assert.equal(new Set(authoredOrders.map(([first]) => first)).size, 3);
        tier.quizzes.forEach((quiz, quizIndex) => {
          assert.equal(quiz.id, `${tier.id}-${quizIndex + 1}`);
          assert.equal(quiz.title, `${tier.title} ${category.title}: ${QUIZ_PASSES[quizIndex]}`);
          assert.equal(quiz.description, "6 questions");
          quiz.questions.forEach((question, questionIndex) => {
            assert.deepEqual(
              question.choiceIds,
              expectedChoices(authoredOrders[quizIndex], questionIndex),
              `${category.id}/${tier.id}/${quiz.id}/${question.id} choices`,
            );
            assert.deepEqual(Object.keys(question).sort(), ["choiceIds", "id", "targetId"]);
          });
        });
      }
    }
  });

  it("uses each bare vocabulary label as its saved audio text", async () => {
    const items = (await readCategories()).flatMap(({ items: categoryItems }) => categoryItems);
    for (const item of items) {
      assert.equal(item.labelAudio.text, item.label, item.labelAudio.id);
    }
  });

  it("authors one category-appropriate prompt cue for every vocabulary item", async () => {
    const categories = await readCategories();
    const items = categories.flatMap(({ id: categoryId, items: categoryItems }) =>
      categoryItems.map((item) => ({ categoryId, ...item })));
    assert.equal(items.length, 107);
    assert.equal(new Set(items.map(({ promptAudio }) => promptAudio.id)).size, 107);
    for (const { categoryId, id, label, promptAudio } of items) {
      assert.equal(promptAudio.id, `word-game-${categoryId}-${id}-prompt`);
      if (categoryId === "colors") assert.equal(promptAudio.text, `Which color is ${label}?`);
      else if (categoryId === "body-parts") assert.equal(promptAudio.text, `Which picture shows the ${label}?`);
      else if (categoryId === "feelings") assert.equal(promptAudio.text, `Which face looks ${label}?`);
      else if (["shoes", "socks", "pants", "shorts", "boots", "gloves", "blocks"].includes(id)) {
        assert.equal(promptAudio.text, `Which are the ${label}?`);
      }
      else assert.equal(promptAudio.text, `Which is the ${label}?`);
    }
  });

  it("reuses one saved cue for the repeated orange label", async () => {
    const categories = await readCategories();
    const colors = categories.find(({ id }) => id === "colors");
    const food = categories.find(({ id }) => id === "food");

    assert.equal(
      colors.items.find(({ id }) => id === "orange").labelAudio.id,
      "word-game-shared-orange-label",
    );
    assert.equal(
      food.items.find(({ id }) => id === "orange").labelAudio.id,
      "word-game-shared-orange-label",
    );
  });

  it("uses native six-digit swatches for every color item", async () => {
    const colors = (await readCategories()).find(({ id }) => id === "colors");
    assert.deepEqual(
      Object.fromEntries(colors.items.map(({ id, visual }) => [id, visual.color])),
      SWATCHES,
    );
  });

  it("uses the pinned Fluent mapping for every non-color item", async () => {
    const categories = await readCategories();
    for (const category of categories.filter(({ id }) => id !== "colors")) {
      assert.deepEqual(
        Object.fromEntries(category.items.map(({ id, visual }) => [id, visual.assetId])),
        FLUENT_ASSET_IDS[category.id],
        category.id,
      );
    }
  });

  it("requests two copies only for plural targets whose pinned artwork is singular", async () => {
    const categories = await readCategories();
    const copiedItems = categories.flatMap(({ id: categoryId, items }) =>
      items
        .filter(({ visual }) => visual.copies === 2)
        .map(({ id }) => `${categoryId}/${id}`));

    assert.deepEqual(copiedItems, [
      "body-parts/ears",
      "clothes/shoes",
      "clothes/boots",
    ]);
  });

  it("contains no authored personal names or retired washing content", async () => {
    const authoredText = JSON.stringify(await readCategories());
    assert.doesNotMatch(authoredText, /\b(?:Bob|Mary|Rose|Jack|Ben|Sam)\b/u);
    assert.doesNotMatch(authoredText, /\b(?:soap|washing|cleanliness|clean hands)\b/iu);
  });

  it("passes compiler cross-checks with all item and player cues", async () => {
    const plan = await planWordGameAudio({ rootDir });
    assert.equal(plan.lines.length, 216);
    assert.equal(new Set(plan.lines.map(({ id }) => id)).size, 216);
    const itemLines = plan.lines.filter(({ id }) => /^word-game-.+-(?:label|prompt)$/u.test(id));
    assert.equal(itemLines.length, 213);
    assert.equal(itemLines.filter(({ id }) => id.endsWith("-label")).length, 106);
    assert.equal(itemLines.filter(({ id }) => id.endsWith("-prompt")).length, 107);
    assert.ok(itemLines.every((line) =>
      line.lang === "en-US"
      && line.speaker === "narrator"
      && line.src === `/assets/audio/${line.id}.mp3`
      && line.ttsText === `[bright, playful teaching delivery for a young child] ${line.text}`
      && line.voiceStyle === "energetic-character"));
    assert.deepEqual(plan.missingFiles, []);
    const plannedIds = new Set(plan.lines.map(({ id }) => id));
    assert.ok(WORD_GAME_MISSING_AUDIO_IDS.every((id) => plannedIds.has(id)));
    for (const id of ["word-game-correct", "word-game-retry", "word-game-complete"]) {
      assert.ok(plannedIds.has(id), id);
    }
  });
});
