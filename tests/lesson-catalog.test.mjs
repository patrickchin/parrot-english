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

    assert.deepEqual(
      entries.map(({ id }) => id),
      expectedLessons.map(([id]) => id)
    );
    const joinInTargets = entries.flatMap(({ lesson }) =>
      lesson.scenes
        .flatMap((scene) => scene.steps)
        .filter((step) => step.speaker === "user")
        .map((step) => step.dialogue),
    );
    assert.equal(joinInTargets.length, 18);
    assert.equal(new Set(joinInTargets).size, 17);
    entries.forEach(({ lesson }, index) => {
      const [, title, goalPhrases] = expectedLessons[index];
      assert.equal(lesson.title, title);
      assert.equal(lesson.childName, "Bella");
      assert.deepEqual(lesson.goalPhrases, goalPhrases);
      const steps = lesson.scenes.flatMap((scene) => scene.steps);
      assert.equal(steps.some((step) => step.check), false);
      assert.equal(
        steps.some((step) => /^Let's (copy|ask|thank)/.test(step.dialogue)),
        false,
      );
      assert.notEqual(steps.at(-1)?.dialogue, "Great job!");

      for (const [stepIndex, step] of steps.entries()) {
        if (step.speaker !== "user") continue;
        assert.equal(steps[stepIndex - 1]?.dialogue, step.dialogue);
        assert.notEqual(steps[stepIndex - 1]?.speaker, "narrator");
      }

      const dialogue = steps.map((step) => step.dialogue);
      for (const line of dialogue) {
        assert.equal(
          line.includes(lesson.childName),
          false,
          `${lesson.title} must not call every learner ${lesson.childName}: ${line}`,
        );
      }
    });
  });
});
