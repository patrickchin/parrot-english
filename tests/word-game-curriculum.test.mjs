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

const EXISTING_AUDIO_TEXT = {
  "word-game-animals-cat-label": "This is a cat.",
  "word-game-animals-dog-label": "This is a dog.",
  "word-game-animals-bird-label": "This is a bird.",
  "word-game-animals-fish-label": "This is a fish.",
  "word-game-animals-duck-label": "This is a duck.",
  "word-game-animals-frog-label": "This is a frog.",
  "word-game-colors-red-label": "This is red.",
  "word-game-colors-blue-label": "This is blue.",
  "word-game-colors-yellow-label": "This is yellow.",
  "word-game-colors-green-label": "This is green.",
  "word-game-colors-orange-label": "This is orange.",
  "word-game-colors-purple-label": "This is purple.",
  "word-game-body-parts-eyes-label": "These are the eyes.",
  "word-game-body-parts-ears-label": "These are the ears.",
  "word-game-body-parts-nose-label": "This is a nose.",
  "word-game-body-parts-mouth-label": "This is a mouth.",
  "word-game-body-parts-hand-label": "This is a hand.",
  "word-game-body-parts-foot-label": "This is a foot.",
  "word-game-food-apple-label": "This is an apple.",
  "word-game-food-banana-label": "This is a banana.",
  "word-game-food-carrot-label": "This is a carrot.",
  "word-game-food-orange-label": "This is an orange.",
  "word-game-food-bread-label": "This is bread.",
  "word-game-food-cheese-label": "This is cheese.",
  "word-game-toys-ball-label": "This is a ball.",
  "word-game-toys-toy-car-label": "This is a toy car.",
  "word-game-toys-doll-label": "This is a doll.",
  "word-game-toys-kite-label": "This is a kite.",
  "word-game-toys-blocks-label": "These are blocks.",
  "word-game-toys-teddy-bear-label": "This is a teddy bear.",
  "word-game-feelings-happy-label": "This face is happy.",
  "word-game-feelings-sad-label": "This face is sad.",
  "word-game-feelings-angry-label": "This face is angry.",
  "word-game-feelings-sleepy-label": "This face is sleepy.",
  "word-game-feelings-surprised-label": "This face is surprised.",
  "word-game-feelings-silly-label": "This face is silly.",
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

const NOTO_ASSET_IDS = {
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
    assert.equal(quizzes.length, 27);
    assert.equal(questions.length, 162);
    assert.equal(items.length, 107);
    assert.deepEqual(categories.map(({ id }) => id).sort(), Object.keys(TARGETS).sort());

    for (const category of categories) {
      const targetsByTier = TARGETS[category.id];
      for (const tier of category.tiers) {
        const targets = tier.quizzes[0].questions.map(({ targetId }) => targetId);
        assert.deepEqual(targets, targetsByTier[tier.id], `${category.id}/${tier.id} targets`);
        tier.quizzes[0].questions.forEach((question, index) => {
          assert.deepEqual(
            question.choiceIds,
            expectedChoices(targets, index),
            `${category.id}/${tier.id}/${question.id} choices`,
          );
        });
      }
    }
  });

  it("preserves the 36 reusable audio identities and teaching texts", async () => {
    const items = (await readCategories()).flatMap(({ items: categoryItems }) => categoryItems);
    const audioTextById = Object.fromEntries(items.map(({ audio }) => [audio.id, audio.text]));
    for (const [id, text] of Object.entries(EXISTING_AUDIO_TEXT)) {
      assert.equal(audioTextById[id], text, id);
    }
  });

  it("uses native six-digit swatches for every color item", async () => {
    const colors = (await readCategories()).find(({ id }) => id === "colors");
    assert.deepEqual(
      Object.fromEntries(colors.items.map(({ id, visual }) => [id, visual.color])),
      SWATCHES,
    );
  });

  it("uses the pinned Noto mapping for every non-color item", async () => {
    const categories = await readCategories();
    for (const category of categories.filter(({ id }) => id !== "colors")) {
      assert.deepEqual(
        Object.fromEntries(category.items.map(({ id, visual }) => [id, visual.assetId])),
        NOTO_ASSET_IDS[category.id],
        category.id,
      );
    }
  });

  it("contains no authored personal names or retired washing content", async () => {
    const authoredText = JSON.stringify(await readCategories());
    assert.doesNotMatch(authoredText, /\b(?:Bob|Mary|Rose|Jack|Ben|Sam)\b/u);
    assert.doesNotMatch(authoredText, /\b(?:soap|washing|cleanliness|clean hands)\b/iu);
  });

  it("passes compiler cross-checks and plans exactly 71 missing item cues", async () => {
    const plan = await planWordGameAudio({ rootDir });
    assert.equal(plan.lines.length, 107);
    assert.equal(new Set(plan.lines.map(({ id }) => id)).size, 107);
    assert.ok(plan.lines.every((line) =>
      line.id.endsWith("-label")
      && line.lang === "en-US"
      && line.speaker === "narrator"
      && line.src === `/assets/audio/${line.id}.mp3`
      && line.ttsText === `[bright, playful teaching delivery for a young child] ${line.text}`
      && line.voiceStyle === "energetic-character"));
    assert.deepEqual(
      plan.missingFiles,
      WORD_GAME_MISSING_AUDIO_IDS.map((id) => `public/assets/audio/${id}.mp3`),
    );
  });
});
