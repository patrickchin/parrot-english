import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

  it("accepts learner speaking turns without a learner visual character", { skip: !hasValidator }, () => {
    const catalogInput = createCatalogInput();
    catalogInput.characters = catalogInput.characters.filter(
      (character) => character.id !== "user"
    );
    const catalog = lessonData.createLessonCatalog(catalogInput);
    const lesson = createLesson();

    for (const scene of lesson.scenes) {
      scene.characters = scene.characters.filter((id) => id !== "user");
      for (const step of scene.steps) delete step.emotes.user;
    }

    assert.equal(
      lessonData.validateLesson(lesson, catalog, "non-visual-learner.json"),
      lesson
    );
    assert.ok(
      lesson.scenes.some((scene) =>
        scene.steps.some((step) => step.speaker === "user")
      )
    );
  });

  it("keeps checked-in learner turns non-visual", () => {
    const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
    const characters = readJson(
      new URL("../content/catalogs/characters.json", import.meta.url)
    );
    const lessonDirectory = new URL("../content/lessons/", import.meta.url);
    const lessonFiles = readdirSync(lessonDirectory).filter((filename) =>
      filename.endsWith(".json")
    );
    let learnerTurnCount = 0;

    assert.equal(characters.some((character) => character.id === "user"), false);
    assert.equal(
      existsSync(new URL("../public/assets/characters/user/", import.meta.url)),
      false
    );

    for (const filename of lessonFiles) {
      const lesson = readJson(new URL(filename, lessonDirectory));
      for (const scene of lesson.scenes) {
        assert.equal(scene.characters.includes("user"), false, filename);
        for (const step of scene.steps) {
          assert.equal(Object.hasOwn(step.emotes, "user"), false, filename);
          if (step.speaker === "user") learnerTurnCount += 1;
        }
      }
    }

    assert.ok(learnerTurnCount > 0);
  });

  it("accepts scripts without curriculum or authoring restrictions", { skip: !hasValidator }, () => {
    const catalog = lessonData.createLessonCatalog(createCatalogInput());
    const lesson = createLesson();
    lesson.notes = "Extra author metadata is allowed.";
    lesson.summary = "This can have two sentences. It is still valid.";
    lesson.detailedSummary = "A short description is enough.";
    lesson.goalPhrases = ["An optional phrase that does not need a user step."];
    lesson.location.extra = "Extra location metadata";
    lesson.scenes = [
      {
        ...lesson.scenes[0],
        characters: ["dolly"],
        extra: "Extra scene metadata",
        steps: [
          {
            ...createStep({
              speaker: "dolly",
              dialogue: "你好！\nWelcome to the lesson.",
              emotes: { dolly: "talking", unused: "idle" },
            }),
            extra: "Extra step metadata",
          },
          createStep({
            speaker: "user",
            dialogue: "I can answer freely.",
            emotes: { dolly: "listening" },
          }),
        ],
      },
    ];

    assert.equal(
      lessonData.validateLesson(lesson, catalog, "flexible.json"),
      lesson,
    );
  });

  it("rejects missing runtime content with its source path", { skip: !hasValidator }, () => {
    const catalog = lessonData.createLessonCatalog(createCatalogInput());
    const cases = [
      ["title", "", /bad\.json title/],
      ["summary", "", /bad\.json summary/],
      ["detailedSummary", "", /bad\.json detailedSummary/],
      ["goalPhrases", "not an array", /bad\.json goalPhrases/],
      ["scenes", [], /bad\.json scenes/],
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

  it("rejects speakers that cannot be played", { skip: !hasValidator }, () => {
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
    assert.equal(
      lessonData.validateLesson(userLesson, catalog, "user.json"),
      userLesson,
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
    assert.equal(
      lessonData.validateLesson(extra, catalog, "extra.json"),
      extra,
    );
  });

  it("validates every checked-in lesson against the checked-in catalogs", () => {
    const paths = {
      emotes: new URL("../content/catalogs/emotes.json", import.meta.url),
      characters: new URL("../content/catalogs/characters.json", import.meta.url),
      backgrounds: new URL("../content/catalogs/backgrounds.json", import.meta.url),
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
    const lessonDirectory = new URL("../content/lessons/", import.meta.url);
    const lessonFiles = readdirSync(lessonDirectory)
      .filter((filename) => filename.endsWith(".json"))
      .sort((left, right) => left.localeCompare(right));

    assert.equal(lessonFiles.length, 7);
    for (const filename of lessonFiles) {
      const lesson = readJson(new URL(filename, lessonDirectory));
      assert.equal(
        lessonData.validateLesson(lesson, catalog, filename),
        lesson
      );
    }
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
