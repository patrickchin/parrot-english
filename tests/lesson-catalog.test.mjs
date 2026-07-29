import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname } from "node:path";
import { describe, it } from "node:test";
import {
  createLessonCatalog,
  validateLesson,
} from "../lib/lesson-data.js";

const projectUrl = new URL("../", import.meta.url);

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, projectUrl), "utf8"));
}

describe("lesson catalog", () => {
  it("discovers lesson JSON modules eagerly with Vite", () => {
    const sourceUrl = new URL("src/lessons/lesson-catalog.ts", projectUrl);
    assert.equal(existsSync(sourceUrl), true, "src/lessons/lesson-catalog.ts must exist");

    const source = readFileSync(sourceUrl, "utf8");
    assert.match(
      source,
      /import\.meta\.glob\("\.\.\/\.\.\/content\/lessons\/\*\.json",\s*\{\s*eager:\s*true,\s*import:\s*"default",?\s*\}\)/s
    );
    assert.match(source, /localeCompare/);
    assert.match(source, /validateLesson/);
  });

  it("validates all lesson files in deterministic filename order", () => {
    const catalog = createLessonCatalog({
      emotes: readJson("content/catalogs/emotes.json"),
      characters: readJson("content/catalogs/characters.json"),
      backgrounds: readJson("content/catalogs/backgrounds.json"),
    });
    const lessonDir = new URL("content/lessons/", projectUrl);
    const filenames = readdirSync(lessonDir)
      .filter((name) => extname(name) === ".json")
      .sort((left, right) => left.localeCompare(right));
    const entries = filenames.map((filename) => ({
      id: basename(filename, ".json"),
      lesson: validateLesson(
        readJson(`content/lessons/${filename}`),
        catalog,
        filename
      ),
    }));

    const expectedLessons = [
      [
        "01-peppas-high-ball",
        "Peppa's High Ball",
        ["Can you help me, please?", "Thank you!"],
      ],
      [
        "02-garden-colors",
        "The Red Flower",
        ["What color is it?", "It is red."],
      ],
      [
        "03-snack-time",
        "Peppa's Apple Snack",
        ["May I have an apple?", "Here you are!"],
      ],
      [
        "04-playground-words",
        "A Turn on the Swing",
        ["Can I have a turn?", "Let's play together!"],
      ],
      [
        "05-market-day",
        "Two Apples for Peppa",
        ["How much is it?", "I'd like two apples, please."],
      ],
      [
        "06-picnic-time",
        "Juice at the Picnic",
        ["Would you like some juice?", "Yes, please!"],
      ],
      [
        "07-bedtime-story",
        "Good Night, Peppa",
        ["I'm sleepy.", "Good night!"],
      ],
    ];
    const expectedVisuals = new Map([
      [
        "01-peppas-high-ball",
        {
          backgrounds: ["high-ball-garden", "high-ball-garden-cleared"],
          actions: [
            "peppa:reaching",
            "peppa:holding-ball",
            "dolly:flying",
            "dolly:returning-ball",
          ],
        },
      ],
      [
        "02-garden-colors",
        {
          backgrounds: [
            "red-flower-garden",
            "red-flower-garden-picked",
            "red-flower-basket-garden",
          ],
          actions: ["peppa:choosing-flower"],
        },
      ],
      [
        "03-snack-time",
        {
          backgrounds: ["apple-snack-meadow"],
          actions: ["dolly:offering-apple"],
        },
      ],
      [
        "04-playground-words",
        {
          backgrounds: ["swing-playground-active", "swing-playground"],
          actions: ["dolly:swinging"],
        },
      ],
      [
        "05-market-day",
        {
          backgrounds: ["fruit-stand-garden"],
          actions: ["dolly:selling-apples"],
        },
      ],
      [
        "06-picnic-time",
        {
          backgrounds: [
            "juice-picnic-meadow",
            "juice-picnic-meadow-pouring",
          ],
          actions: ["dolly:pouring-juice"],
        },
      ],
      [
        "07-bedtime-story",
        {
          backgrounds: [
            "bedtime-story-meadow-closing",
            "bedtime-story-meadow",
          ],
          actions: ["peppa:sleepy", "dolly:closing-book"],
        },
      ],
    ]);

    assert.deepEqual(
      entries.map(({ id }) => id),
      expectedLessons.map(([id]) => id)
    );
    entries.forEach(({ id, lesson }, index) => {
      const [, title, goalPhrases] = expectedLessons[index];
      const expectedVisual = expectedVisuals.get(id);
      assert.equal(lesson.title, title);
      assert.equal(lesson.childName, "Bella");
      assert.deepEqual(lesson.goalPhrases, goalPhrases);
      assert.match(lesson.scenes.at(-1).steps.at(-1).dialogue, /Bella/);
      assert.deepEqual(
        [...new Set(lesson.scenes.map(({ background }) => background))],
        expectedVisual.backgrounds,
      );

      const usedActions = new Set(
        lesson.scenes.flatMap(({ steps }) =>
          steps.flatMap(({ emotes = {} }) =>
            Object.entries(emotes).map(
              ([character, emote]) => `${character}:${emote}`,
            ),
          ),
        ),
      );
      for (const action of expectedVisual.actions) {
        assert.equal(usedActions.has(action), true, `${id} uses ${action}`);
      }
    });
  });
});
