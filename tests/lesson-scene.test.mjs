import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLessonCatalog } from "../lib/lesson-data.js";
import { getLessonScenePresentation } from "../lib/lesson-scene.js";
import { LessonPhase, createInitialLessonState } from "../lib/lesson-state.js";

const emotes = ["idle", "talking", "listening", "happy", "sad", "surprised"];
const makeAssets = (id) =>
  Object.fromEntries(
    emotes.map((emote) => [
      emote,
      { src: `/assets/${id}-${emote}.webp`, alt: `${id} ${emote}` },
    ])
  );
const catalog = createLessonCatalog({
  emotes,
  characters: [
    { id: "peppa", name: "Peppa", assets: makeAssets("peppa") },
    { id: "dolly", name: "Dolly", assets: makeAssets("dolly") },
    { id: "user", name: "You", assets: makeAssets("user") },
  ],
  backgrounds: [
    { id: "garden", src: "/assets/garden.webp", alt: "Sunny garden" },
  ],
});
const baseEmotes = {
  peppa: "listening",
  dolly: "talking",
  user: "listening",
};
const lesson = {
  childName: "Bella",
  scenes: [
    {
      title: "Garden help",
      settingDescription: "Peppa and Dolly stand under a tall tree.",
      background: "garden",
      characters: ["peppa", "dolly", "user"],
      steps: [
        { speaker: "dolly", dialogue: "Here you are!", emotes: baseEmotes },
        {
          speaker: "narrator",
          dialogue: "Let's copy Dolly!",
          emotes: { peppa: "listening", dolly: "happy", user: "listening" },
        },
        {
          speaker: "user",
          dialogue: "Here you are!",
          emotes: { peppa: "listening", dolly: "listening", user: "talking" },
        },
      ],
    },
  ],
};

describe("scene-script presentation", () => {
  it("resolves the background, visible story characters, and active speaker", () => {
    const scene = getLessonScenePresentation(
      { ...createInitialLessonState(), phase: LessonPhase.Speaking },
      lesson,
      catalog
    );

    assert.deepEqual(scene.backgroundAsset, {
      id: "garden",
      src: "/assets/garden.webp",
      alt: "Sunny garden",
    });
    assert.deepEqual(
      scene.characters.map(({ id, emote, isActive, asset }) => ({
        id,
        emote,
        isActive,
        asset,
      })),
      [
        {
          id: "peppa",
          emote: "listening",
          isActive: false,
          asset: {
            src: "/assets/peppa-listening.webp",
            alt: "peppa listening",
          },
        },
        {
          id: "dolly",
          emote: "talking",
          isActive: true,
          asset: { src: "/assets/dolly-talking.webp", alt: "dolly talking" },
        },
      ]
    );
    assert.deepEqual(scene.speech, {
      speaker: "dolly",
      text: "Here you are!",
      kind: "character",
    });
    assert.equal(scene.settingDescription, lesson.scenes[0].settingDescription);
    assert.equal(scene.title, "Garden help");
  });

  it("uses the idle visual when a step omits a visible character emote", () => {
    const flexibleLesson = {
      ...lesson,
      scenes: [
        {
          ...lesson.scenes[0],
          steps: [
            {
              speaker: "dolly",
              dialogue: "你好！",
              emotes: { dolly: "talking" },
            },
          ],
        },
      ],
    };

    const scene = getLessonScenePresentation(
      { ...createInitialLessonState(), phase: LessonPhase.Speaking },
      flexibleLesson,
      catalog,
    );

    assert.equal(scene.characters[0].id, "peppa");
    assert.equal(scene.characters[0].emote, "idle");
    assert.equal(scene.characters[0].asset.src, "/assets/peppa-idle.webp");
  });

  it("presents narrator steps without a visible narrator character", () => {
    const scene = getLessonScenePresentation(
      {
        ...createInitialLessonState(),
        phase: LessonPhase.Speaking,
        stepIndex: 1,
      },
      lesson,
      catalog
    );

    assert.deepEqual(scene.speech, {
      speaker: "narrator",
      text: "Let's copy Dolly!",
      kind: "narration",
    });
    assert.equal(scene.characters.some((character) => character.id === "narrator"), false);
    assert.equal(scene.characters.some((character) => character.isActive), false);
  });

  it("keeps user speech metadata without presenting a user character", () => {
    for (const phase of [
      LessonPhase.WaitingForUser,
      LessonPhase.Recording,
      LessonPhase.Evaluating,
    ]) {
      const scene = getLessonScenePresentation(
        { ...createInitialLessonState(), phase, stepIndex: 2 },
        lesson,
        catalog
      );

      assert.deepEqual(scene.speech, {
        speaker: "user",
        text: "Here you are!",
        kind: "user",
      });
      assert.equal(scene.characters.some((character) => character.id === "user"), false);
    }
  });

  it("uses narrator presentation for feedback", () => {
    const scene = getLessonScenePresentation(
      {
        ...createInitialLessonState(),
        phase: LessonPhase.Feedback,
        stepIndex: 2,
        feedback: "Great job!",
        feedbackOutcome: "success",
      },
      lesson,
      catalog
    );

    assert.deepEqual(scene.speech, {
      speaker: "narrator",
      text: "Great job!",
      kind: "feedback",
    });
  });

  it("marks the final scripted line as finished after playback", () => {
    const finalLesson = {
      childName: "Bella",
      scenes: [
        {
          ...lesson.scenes[0],
          steps: [
            {
              speaker: "narrator",
              dialogue: "Great job, Bella!",
              emotes: { peppa: "happy", dolly: "happy", user: "happy" },
            },
          ],
        },
      ],
    };
    const scene = getLessonScenePresentation(
      { ...createInitialLessonState(), phase: LessonPhase.Finished },
      finalLesson,
      catalog
    );

    assert.deepEqual(scene.speech, {
      speaker: "narrator",
      text: "Great job, Bella!",
      kind: "finished",
    });
  });
});
