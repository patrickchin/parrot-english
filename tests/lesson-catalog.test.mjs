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
          backgrounds: [
            "apple-snack-meadow",
            "apple-snack-meadow-finished",
          ],
          actions: [
            "peppa:holding-snack-apple",
            "dolly:offering-apple",
          ],
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
          actions: ["peppa:holding-apples", "dolly:selling-apples"],
        },
      ],
      [
        "06-picnic-time",
        {
          backgrounds: [
            "juice-picnic-meadow",
            "juice-picnic-meadow-offering",
            "juice-picnic-meadow-pouring",
          ],
          actions: [
            "peppa:holding-juice",
            "dolly:holding-juice",
            "dolly:pouring-juice",
          ],
        },
      ],
      [
        "07-bedtime-story",
        {
          backgrounds: [
            "bedtime-story-meadow-closing",
            "bedtime-story-meadow",
            "bedtime-story-meadow-sleeping",
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

  it("keeps story-specific props and actions visible for the full scene state", () => {
    const lesson = (id) => readJson(`content/lessons/${id}.json`);
    const expectEveryStep = (scene, character, emote) => {
      assert.deepEqual(
        [...new Set(scene.steps.map((step) => step.emotes[character]))],
        [emote],
        `${scene.title} keeps ${character}:${emote}`,
      );
    };

    const highBall = lesson("01-peppas-high-ball");
    expectEveryStep(highBall.scenes[0], "peppa", "reaching");
    expectEveryStep(highBall.scenes[3], "dolly", "flying");

    const snack = lesson("03-snack-time");
    expectEveryStep(snack.scenes[3], "dolly", "offering-apple");
    expectEveryStep(snack.scenes[4], "peppa", "holding-snack-apple");
    assert.equal(snack.scenes[4].background, "apple-snack-meadow-finished");

    const market = lesson("05-market-day");
    assert.deepEqual(
      market.scenes[4].steps.slice(1).map((step) => step.emotes.peppa),
      ["holding-apples", "holding-apples"],
    );

    const picnic = lesson("06-picnic-time");
    expectEveryStep(picnic.scenes[1], "dolly", "holding-juice");
    expectEveryStep(picnic.scenes[2], "dolly", "holding-juice");
    assert.equal(picnic.scenes[1].background, "juice-picnic-meadow-offering");
    assert.equal(picnic.scenes[2].background, "juice-picnic-meadow-offering");
    assert.equal(picnic.scenes[3].steps[1].emotes.peppa, "holding-juice");
    expectEveryStep(picnic.scenes[4], "peppa", "holding-juice");
    assert.equal(picnic.scenes[4].background, "juice-picnic-meadow-pouring");

    const bedtime = lesson("07-bedtime-story");
    expectEveryStep(bedtime.scenes[0], "dolly", "closing-book");
    for (const scene of bedtime.scenes.slice(2)) {
      expectEveryStep(scene, "peppa", "sleepy");
      assert.equal(scene.background, "bedtime-story-meadow-sleeping");
    }
  });
});
