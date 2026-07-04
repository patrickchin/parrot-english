import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import * as lessonData from "../lib/lesson-data.js";

const EMOTES = ["idle", "talking", "listening", "happy", "sad", "surprised"];

function createAssets(id) {
  return Object.fromEntries(
    EMOTES.map((emote) => [
      emote,
      {
        src: `/assets/characters/${id}/${id}-${emote}.webp`,
        alt: `${id} ${emote}`,
      },
    ])
  );
}

function createCatalogInput() {
  return {
    emotes: EMOTES,
    characters: [
      { id: "peppa", name: "Peppa", assets: createAssets("peppa") },
      { id: "dolly", name: "Dolly", assets: createAssets("dolly") },
      { id: "user", name: "You", assets: createAssets("user") },
    ],
    backgrounds: [
      {
        id: "episode-garden",
        src: "/assets/backgrounds/episode-garden.png",
        alt: "Sunny garden",
      },
    ],
  };
}

function createStep(overrides = {}) {
  return {
    speaker: "dolly",
    dialogue: "Can you help me, please?",
    emotes: {
      peppa: "listening",
      dolly: "talking",
      user: "listening",
    },
    ...overrides,
  };
}

function createScene(index) {
  const dialogue = index === 4 ? "Thank you!" : "Can you help me, please?";
  return {
    title: `Scene ${index + 1}`,
    settingDescription: "Peppa and Dolly stand together in the sunny garden.",
    background: "episode-garden",
    characters: ["peppa", "dolly", "user"],
    steps: [
      createStep({ dialogue }),
      createStep({
        speaker: "user",
        dialogue,
        emotes: {
          peppa: "listening",
          dolly: "listening",
          user: "talking",
        },
      }),
      ...(index === 4
        ? [
            createStep({
              speaker: "narrator",
              dialogue: "Great job, Bella! Peppa has her ball!",
              emotes: { peppa: "happy", dolly: "happy", user: "happy" },
            }),
          ]
        : []),
    ],
  };
}

function createLesson() {
  return {
    title: "Peppa's High Ball",
    childName: "Bella",
    goalPhrases: ["Can you help me, please?", "Thank you!"],
    summary: "Peppa asks Dolly to help retrieve a ball from a high branch.",
    detailedSummary:
      "Peppa sees her ball resting on a branch that is too high to reach. Dolly flies up after Peppa asks for help and brings the ball down. Peppa thanks Dolly, and the friends continue playing in the garden.",
    location: {
      name: "The sunny garden",
      description: "A bright garden with green grass, flowers, and a tall tree.",
    },
    scenes: Array.from({ length: 5 }, (_, index) => createScene(index)),
  };
}

const hasValidator =
  typeof lessonData.createLessonCatalog === "function" &&
  typeof lessonData.validateLesson === "function";

describe("lesson data contract", () => {
  it("exports catalog and lesson validators", () => {
    assert.equal(typeof lessonData.createLessonCatalog, "function");
    assert.equal(typeof lessonData.validateLesson, "function");
  });

  it("accepts a valid scene-script lesson", { skip: !hasValidator }, () => {
    const catalog = lessonData.createLessonCatalog(createCatalogInput());
    const lesson = createLesson();

    assert.equal(
      lessonData.validateLesson(lesson, catalog, "valid.json"),
      lesson
    );
  });

  it("rejects invalid root content with its source path", { skip: !hasValidator }, () => {
    const catalog = lessonData.createLessonCatalog(createCatalogInput());
    const cases = [
      ["title", "", /bad\.json title/],
      ["summary", "Two sentences here. This is extra.", /bad\.json summary/],
      ["detailedSummary", "Only one sentence.", /bad\.json detailedSummary/],
      ["goalPhrases", ["Only one"], /bad\.json goalPhrases/],
      ["scenes", createLesson().scenes.slice(0, 4), /bad\.json scenes/],
    ];

    for (const [field, value, pattern] of cases) {
      const lesson = createLesson();
      lesson[field] = value;
      assert.throws(
        () => lessonData.validateLesson(lesson, catalog, "bad.json"),
        pattern
      );
    }
  });

  it("rejects unknown scene catalog values", { skip: !hasValidator }, () => {
    const catalog = lessonData.createLessonCatalog(createCatalogInput());
    const backgroundLesson = createLesson();
    backgroundLesson.scenes[0].background = "missing-place";
    assert.throws(
      () => lessonData.validateLesson(backgroundLesson, catalog, "bad.json"),
      /bad\.json scenes\[0\]\.background/
    );

    const characterLesson = createLesson();
    characterLesson.scenes[0].characters[0] = "pig";
    assert.throws(
      () => lessonData.validateLesson(characterLesson, catalog, "bad.json"),
      /bad\.json scenes\[0\]\.characters\[0\]/
    );
  });

  it("rejects invalid speakers and Chinese dialogue", { skip: !hasValidator }, () => {
    const catalog = lessonData.createLessonCatalog(createCatalogInput());
    const speakerLesson = createLesson();
    speakerLesson.scenes[0].steps[0].speaker = "nobody";
    assert.throws(
      () => lessonData.validateLesson(speakerLesson, catalog, "bad.json"),
      /bad\.json scenes\[0\]\.steps\[0\]\.speaker/
    );

    const userLesson = createLesson();
    userLesson.scenes[0].characters = ["peppa", "dolly"];
    userLesson.scenes[0].steps[0] = createStep({
      speaker: "user",
      emotes: { peppa: "listening", dolly: "listening" },
    });
    assert.throws(
      () => lessonData.validateLesson(userLesson, catalog, "bad.json"),
      /bad\.json scenes\[0\]\.steps\[0\]\.speaker/
    );

    const chineseLesson = createLesson();
    chineseLesson.scenes[0].steps[0].dialogue = "轮到你了。";
    assert.throws(
      () => lessonData.validateLesson(chineseLesson, catalog, "bad.json"),
      /bad\.json scenes\[0\]\.steps\[0\]\.dialogue/
    );
  });

  it("requires a complete supported emote map", { skip: !hasValidator }, () => {
    const catalog = lessonData.createLessonCatalog(createCatalogInput());
    const unsupported = createLesson();
    unsupported.scenes[0].steps[0].emotes.peppa = "hopeful";
    assert.throws(
      () => lessonData.validateLesson(unsupported, catalog, "bad.json"),
      /bad\.json scenes\[0\]\.steps\[0\]\.emotes\.peppa/
    );

    const missing = createLesson();
    delete missing.scenes[0].steps[0].emotes.user;
    assert.throws(
      () => lessonData.validateLesson(missing, catalog, "bad.json"),
      /bad\.json scenes\[0\]\.steps\[0\]\.emotes/
    );

    const extra = createLesson();
    extra.scenes[0].steps[0].emotes.narrator = "idle";
    assert.throws(
      () => lessonData.validateLesson(extra, catalog, "bad.json"),
      /bad\.json scenes\[0\]\.steps\[0\]\.emotes/
    );
  });

  it("requires modeled user lines and final narrator praise", { skip: !hasValidator }, () => {
    const catalog = lessonData.createLessonCatalog(createCatalogInput());
    const unmodeled = createLesson();
    unmodeled.scenes[0].steps[0].dialogue = "A different model line.";
    assert.throws(
      () => lessonData.validateLesson(unmodeled, catalog, "bad.json"),
      /bad\.json scenes\[0\]\.steps\[1\]\.dialogue/
    );

    const noPraise = createLesson();
    noPraise.scenes.at(-1).steps.at(-1).dialogue = "Great job!";
    assert.throws(
      () => lessonData.validateLesson(noPraise, catalog, "bad.json"),
      /bad\.json scenes\[4\]\.steps\[2\]\.dialogue/
    );
  });

  it("validates every checked-in lesson against the checked-in catalogs", () => {
    const paths = {
      emotes: new URL("../content/catalogs/emotes.json", import.meta.url),
      characters: new URL("../content/catalogs/characters.json", import.meta.url),
      backgrounds: new URL("../content/catalogs/backgrounds.json", import.meta.url),
      lesson: new URL("../content/lessons/peppas-high-ball.json", import.meta.url),
    };

    for (const path of Object.values(paths)) {
      assert.equal(existsSync(path), true, `${path.pathname} must exist`);
    }

    const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
    const catalog = lessonData.createLessonCatalog({
      emotes: readJson(paths.emotes),
      characters: readJson(paths.characters),
      backgrounds: readJson(paths.backgrounds),
    });
    const lesson = readJson(paths.lesson);

    assert.equal(
      lessonData.validateLesson(lesson, catalog, "peppas-high-ball.json"),
      lesson
    );
  });

  it("registers one existing pre-generated asset for every character emote", () => {
    const characters = JSON.parse(
      readFileSync(
        new URL("../content/catalogs/characters.json", import.meta.url),
        "utf8"
      )
    );

    for (const character of characters) {
      assert.deepEqual(Object.keys(character.assets).sort(), [...EMOTES].sort());
      for (const emote of EMOTES) {
        const asset = character.assets[emote];
        assert.equal(
          asset.src,
          `/assets/characters/${character.id}/${character.id}-${emote}.webp`
        );
        assert.ok(asset.alt, `${character.id}.${emote} alt text`);
        assert.equal(
          existsSync(new URL(`../public${asset.src}`, import.meta.url)),
          true,
          `${character.id}.${emote} file`
        );
      }
    }
  });
});
