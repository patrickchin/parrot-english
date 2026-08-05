import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PIXEL_LESSON,
  PIXEL_LESSON_EMOTES,
  PIXEL_LESSON_MAX_MISSIONS,
  PIXEL_LESSON_SCHEMA_VERSION,
  PIXEL_LESSON_TARGET_IDS,
  PIXEL_LESSON_TEXT_LIMITS,
  PIXEL_LESSON_WORLD_ID,
  preparePixelLesson,
} from "../lib/pixel-lesson-data.ts";

function createMission(overrides = {}) {
  return {
    targetId: "lesson-tree",
    instruction: "Walk to the tree and ask for the ball.",
    phrase: "Can I have the ball, please?",
    success: "Wonderful asking!",
    emote: "happy",
    ...overrides,
  };
}

function createPixelLesson(overrides = {}) {
  return {
    schemaVersion: 1,
    title: "The Polite Garden",
    learnerName: "Mia",
    summary: "Practise polite requests in the garden.",
    worldId: "lesson-garden",
    intro: "Visit the tree and ask for its ball.",
    missions: [createMission()],
    completion: "You finished the garden lesson!",
    ...overrides,
  };
}

describe("pixel lesson data contract", () => {
  it("exports a valid v1 default and the engine allowlists", () => {
    assert.equal(PIXEL_LESSON_SCHEMA_VERSION, 1);
    assert.equal(PIXEL_LESSON_WORLD_ID, "lesson-garden");
    assert.deepEqual(PIXEL_LESSON_TARGET_IDS, [
      "lesson-tree",
      "flower-patch",
      "lesson-basket",
      "apple-counter",
    ]);
    assert.deepEqual(PIXEL_LESSON_EMOTES, [
      "idle",
      "talking",
      "happy",
      "surprised",
    ]);
    assert.ok(DEFAULT_PIXEL_LESSON.missions.length >= 1);
    assert.ok(
      DEFAULT_PIXEL_LESSON.missions.length <= PIXEL_LESSON_MAX_MISSIONS,
    );

    const prepared = preparePixelLesson(
      DEFAULT_PIXEL_LESSON,
      "default pixel lesson",
    );
    assert.deepEqual(prepared.lesson, DEFAULT_PIXEL_LESSON);
    assert.deepEqual(prepared.warnings, []);
  });

  it("returns only the exact runtime fields for valid model output", () => {
    const input = createPixelLesson({
      authorNotes: "This must not reach the runtime.",
      missions: [createMission({ cameraHint: "zoom" })],
    });
    const prepared = preparePixelLesson(input, "generated pixel lesson");

    assert.deepEqual(Object.keys(prepared.lesson), [
      "schemaVersion",
      "title",
      "learnerName",
      "summary",
      "worldId",
      "intro",
      "missions",
      "completion",
    ]);
    assert.deepEqual(Object.keys(prepared.lesson.missions[0]), [
      "targetId",
      "instruction",
      "phrase",
      "success",
      "emote",
    ]);
    assert.equal(Object.hasOwn(prepared.lesson, "authorNotes"), false);
    assert.equal(Object.hasOwn(prepared.lesson.missions[0], "cameraHint"), false);
    assert.ok(prepared.warnings.some((warning) => /authorNotes/.test(warning)));
    assert.ok(prepared.warnings.some((warning) => /cameraHint/.test(warning)));
  });

  it("repairs recoverable generated values with clear warnings", () => {
    const prepared = preparePixelLesson(
      {
        schemaVersion: 42,
        title: " ",
        learnerName: null,
        summary: null,
        worldId: "invented-world",
        missions: [
          createMission({
            instruction: "",
            success: undefined,
            emote: "dancing",
          }),
        ],
      },
      "draft.json",
    );

    assert.equal(prepared.lesson.schemaVersion, 1);
    assert.equal(prepared.lesson.worldId, "lesson-garden");
    assert.equal(prepared.lesson.title, DEFAULT_PIXEL_LESSON.title);
    assert.equal(prepared.lesson.learnerName, DEFAULT_PIXEL_LESSON.learnerName);
    assert.equal(prepared.lesson.summary, DEFAULT_PIXEL_LESSON.summary);
    assert.equal(prepared.lesson.intro, DEFAULT_PIXEL_LESSON.intro);
    assert.equal(prepared.lesson.completion, DEFAULT_PIXEL_LESSON.completion);
    assert.equal(
      prepared.lesson.missions[0].instruction,
      "Walk to the lesson tree and say the phrase.",
    );
    assert.equal(prepared.lesson.missions[0].success, "Great speaking!");
    assert.equal(prepared.lesson.missions[0].emote, "happy");
    for (const field of [
      "schemaVersion",
      "title",
      "learnerName",
      "summary",
      "worldId",
      "intro",
      "instruction",
      "success",
      "emote",
      "completion",
    ]) {
      assert.ok(
        prepared.warnings.some((warning) => warning.includes(field)),
        `expected a warning for ${field}`,
      );
    }
  });

  it("makes an explicit learner default authoritative over model output", () => {
    const prepared = preparePixelLesson(
      createPixelLesson({ learnerName: "A name invented by the model" }),
      "generated pixel lesson",
      { learnerName: "  canonical Mia  " },
    );

    assert.equal(prepared.lesson.learnerName, "canonical Mia");
    assert.ok(
      prepared.warnings.some((warning) =>
        /learnerName was overridden by the authoritative learnerName/.test(
          warning,
        ),
      ),
    );
  });

  it("caps all text fields and keeps at most four unique missions", () => {
    const longText = "x".repeat(500);
    const missions = [
      createMission({
        targetId: "lesson-tree",
        instruction: longText,
        phrase: longText,
        success: longText,
      }),
      createMission({ targetId: "lesson-tree", phrase: "duplicate" }),
      createMission({ targetId: "flower-patch", phrase: "Flowers, please." }),
      createMission({ targetId: "lesson-basket", phrase: "The basket, please." }),
      createMission({ targetId: "apple-counter", phrase: "An apple, please." }),
    ];
    const prepared = preparePixelLesson(
      createPixelLesson({
        title: longText,
        learnerName: longText,
        summary: longText,
        intro: longText,
        missions,
        completion: longText,
      }),
      "long lesson",
    );

    assert.equal(prepared.lesson.title.length, PIXEL_LESSON_TEXT_LIMITS.title);
    assert.equal(
      prepared.lesson.learnerName.length,
      PIXEL_LESSON_TEXT_LIMITS.learnerName,
    );
    assert.equal(
      prepared.lesson.summary.length,
      PIXEL_LESSON_TEXT_LIMITS.summary,
    );
    assert.equal(prepared.lesson.intro.length, PIXEL_LESSON_TEXT_LIMITS.intro);
    assert.equal(
      prepared.lesson.completion.length,
      PIXEL_LESSON_TEXT_LIMITS.completion,
    );
    assert.equal(
      prepared.lesson.missions[0].instruction.length,
      PIXEL_LESSON_TEXT_LIMITS.instruction,
    );
    assert.equal(
      prepared.lesson.missions[0].phrase.length,
      PIXEL_LESSON_TEXT_LIMITS.phrase,
    );
    assert.equal(
      prepared.lesson.missions[0].success.length,
      PIXEL_LESSON_TEXT_LIMITS.success,
    );
    assert.equal(prepared.lesson.missions.length, PIXEL_LESSON_MAX_MISSIONS);
    assert.equal(
      new Set(prepared.lesson.missions.map(({ targetId }) => targetId)).size,
      prepared.lesson.missions.length,
    );
    assert.ok(prepared.warnings.some((warning) => /capped/.test(warning)));
    assert.ok(prepared.warnings.some((warning) => /duplicated/.test(warning)));
  });

  it("skips unsupported and incomplete missions while preserving playable ones", () => {
    const prepared = preparePixelLesson(
      createPixelLesson({
        missions: [
          createMission({ targetId: "cloud-castle" }),
          createMission({ targetId: "flower-patch", phrase: "   " }),
          createMission({ targetId: "lesson-basket", phrase: "The basket, please." }),
        ],
      }),
      "mixed lesson",
    );

    assert.deepEqual(
      prepared.lesson.missions.map(({ targetId }) => targetId),
      ["lesson-basket"],
    );
    assert.ok(prepared.warnings.some((warning) => /unsupported/.test(warning)));
    assert.ok(prepared.warnings.some((warning) => /empty/.test(warning)));
  });

  it("rejects drafts without any playable mission and includes the source", () => {
    assert.throws(
      () =>
        preparePixelLesson(
          createPixelLesson({
            missions: [
              createMission({ targetId: "cloud-castle" }),
              createMission({ targetId: "lesson-tree", phrase: "" }),
            ],
          }),
          "broken-pixel-lesson.json",
        ),
      /broken-pixel-lesson\.json must contain at least one playable mission/i,
    );

    assert.throws(
      () => preparePixelLesson(null, "null-pixel-lesson.json"),
      /null-pixel-lesson\.json must be an object with playable missions/i,
    );
  });
});
