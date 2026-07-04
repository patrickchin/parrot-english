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
  it("resolves the background, complete character set, and active speaker", () => {
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
        {
          id: "user",
          emote: "listening",
          isActive: false,
          asset: {
            src: "/assets/user-listening.webp",
            alt: "user listening",
          },
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

  it("keeps the user active while waiting, recording, and evaluating", () => {
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

      assert.equal(scene.speech.kind, "user");
      assert.equal(
        scene.characters.find((character) => character.id === "user").isActive,
        true
      );
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
