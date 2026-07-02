import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { LessonPhase, createInitialLessonState } from "../lib/lesson-state.js";
import {
  LESSON_SCENE_ASSETS,
  getLessonScenePresentation,
} from "../lib/lesson-scene.js";

const step = {
  id: "hello",
  sceneTitleZh: "多莉打招呼",
  exampleLine: "Hello, Bella!",
  parrotPromptZh: "佩奇在和你打招呼。我们回答佩奇。",
  parrotModelLine: "Hello, Peppa!",
  childTarget: "Hello, Peppa!",
  tipZh: "听到别人叫你的名字，可以用对方的名字打招呼。",
};

function webpHasAlpha(assetSrc) {
  const bytes = readFileSync(new URL(`../public${assetSrc}`, import.meta.url));

  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");

  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunkType = bytes.toString("ascii", offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;

    if (chunkType === "ALPH") return true;
    if (chunkType === "VP8X" && (bytes[chunkDataOffset] & 0x10) !== 0) {
      return true;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  return false;
}

describe("lesson scene presentation", () => {
  it("returns separate character bubbles for each scene", () => {
    const scene = getLessonScenePresentation(
      createInitialLessonState(),
      step
    );

    assert.equal(scene.peppaBubble.text, "Hello, Bella!");
    assert.equal(scene.pollyBubble.text, "佩奇在和你打招呼。我们回答佩奇。");
    assert.equal(scene.peppaBubble.tone, "example");
    assert.equal(scene.pollyBubble.tone, "coach");
    assert.equal(scene.activeSpeaker, null);
  });

  it("marks Peppa active while the example is speaking", () => {
    const scene = getLessonScenePresentation(
      { ...createInitialLessonState(), phase: LessonPhase.ExampleSpeaking },
      step
    );

    assert.equal(scene.activeSpeaker, "peppa");
    assert.equal(scene.peppaBubble.isActive, true);
    assert.equal(scene.pollyBubble.isActive, false);
  });

  it("marks Polly active while the parrot gives the Chinese prompt", () => {
    const scene = getLessonScenePresentation(
      { ...createInitialLessonState(), phase: LessonPhase.ParrotCoaching },
      step
    );

    assert.equal(scene.activeSpeaker, "polly");
    assert.equal(scene.peppaBubble.isActive, false);
    assert.equal(scene.pollyBubble.isActive, true);
    assert.equal(scene.pollyBubble.text, "佩奇在和你打招呼。我们回答佩奇。");
  });

  it("prompts the child in Chinese with the target phrase while listening", () => {
    const scene = getLessonScenePresentation(
      { ...createInitialLessonState(), phase: LessonPhase.Listening },
      step
    );

    assert.equal(scene.activeSpeaker, "child");
    assert.equal(scene.pollyBubble.text, "轮到你：Hello, Peppa!");
    assert.equal(scene.pollyBubble.tone, "listen");
    assert.equal(scene.pollyBubble.isActive, true);
    assert.equal(scene.statusText, "麦克风正在听，请开口说");
  });

  it("uses live feedback in Polly's bubble after evaluation", () => {
    const scene = getLessonScenePresentation(
      {
        ...createInitialLessonState(),
        phase: LessonPhase.Feedback,
        feedback: "Great try. Say it one more time.",
        transcript: "this is parrot polly",
        lastOutcome: "retry",
      },
      step
    );

    assert.equal(scene.activeSpeaker, "polly");
    assert.equal(scene.pollyBubble.text, "Great try. Say it one more time.");
    assert.equal(scene.pollyBubble.tone, "feedback");
    assert.equal(scene.statusText, "我听到：this is parrot polly");
  });

  it("uses day, evening, and reward backgrounds across lesson states", () => {
    const earlyScene = getLessonScenePresentation(
      createInitialLessonState(),
      step
    );
    const laterScene = getLessonScenePresentation(
      { ...createInitialLessonState(), stepIndex: 4 },
      { ...step, id: "thank-you" }
    );
    const finishedScene = getLessonScenePresentation(
      { ...createInitialLessonState(), phase: LessonPhase.Finished },
      step
    );

    assert.equal(earlyScene.backgroundAsset.id, "meadow_day");
    assert.equal(laterScene.backgroundAsset.id, "meadow_evening");
    assert.equal(finishedScene.backgroundAsset.id, "reward_bg");
  });

  it("uses optimized web-friendly scene image assets", () => {
    const scenes = [
      getLessonScenePresentation(createInitialLessonState(), step),
      getLessonScenePresentation(
        { ...createInitialLessonState(), phase: LessonPhase.ExampleSpeaking },
        step
      ),
      getLessonScenePresentation(
        { ...createInitialLessonState(), phase: LessonPhase.ParrotCoaching },
        step
      ),
      getLessonScenePresentation(
        { ...createInitialLessonState(), phase: LessonPhase.Listening },
        step
      ),
      getLessonScenePresentation(
        {
          ...createInitialLessonState(),
          phase: LessonPhase.Feedback,
          lastOutcome: "advance",
        },
        step
      ),
      getLessonScenePresentation(
        { ...createInitialLessonState(), phase: LessonPhase.Finished },
        step
      ),
    ];

    const registryAssets = [
      ...Object.values(LESSON_SCENE_ASSETS.backgrounds),
      ...Object.values(LESSON_SCENE_ASSETS.peppa),
      ...Object.values(LESSON_SCENE_ASSETS.polly),
    ];
    const renderedAssets = scenes.flatMap((scene) => [
      scene.backgroundAsset,
      scene.peppaAsset,
      scene.pollyAsset,
    ]);

    for (const asset of [...registryAssets, ...renderedAssets]) {
      assert.match(asset.src, /^\/assets\/[a-z0-9/_-]+\.webp$/);
      assert.ok(
        asset.src.includes("/peppa/") ||
          asset.src.includes("/dolly/") ||
          asset.src.includes("/backgrounds/"),
        `Expected ${asset.src} to live in a scene asset folder`
      );
      assert.ok(
        existsSync(new URL(`../public${asset.src}`, import.meta.url)),
        `Expected ${asset.src} to exist in public assets`
      );
    }
  });

  it("uses transparent cutout character image assets", () => {
    const characterAssets = [
      ...Object.values(LESSON_SCENE_ASSETS.peppa),
      ...Object.values(LESSON_SCENE_ASSETS.polly),
    ];
    const uniqueAssetSrcs = new Set(characterAssets.map((asset) => asset.src));

    for (const assetSrc of uniqueAssetSrcs) {
      assert.equal(
        webpHasAlpha(assetSrc),
        true,
        `Expected ${assetSrc} to preserve transparency for the scene cutout`
      );
    }
  });
});
