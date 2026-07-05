import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

describe("scene playback controls", () => {
  it("renders previous, playback, and next controls in one dock", () => {
    const docks = app.match(/<nav[\s\S]*?scene-control-dock[\s\S]*?<\/nav>/g) ?? [];

    assert.equal(docks.length, 1);
    assert.match(docks[0], /aria-label="Previous scene"/);
    assert.match(docks[0], /aria-label="Next scene"/);
    assert.match(app, /PLAY_SCENE/);
    assert.match(app, /PAUSE_SCENE/);
    assert.match(app, /SCENE_PREVIOUS/);
    assert.match(app, /SCENE_NEXT/);
    assert.match(app, /REPLAY_LESSON/);
  });

  it("cancels pending learner work before manual scene controls", () => {
    assert.match(app, /function cancelPendingWork/);
    assert.match(app, /pressSequenceRef\.current \+= 1/);
    assert.match(app, /playbackControllerRef\.current\?\.abort\(\)/);
    assert.match(app, /recordingControllerRef\.current\?\.abort\(\)/);
    assert.match(app, /recordingRef\.current\?\.cancel\(\)/);
    assert.match(app, /evaluationControllerRef\.current\?\.abort\(\)/);
    const sceneControl = app.match(
      /function dispatchSceneControl\([\s\S]*?\n\s{2}\) \{([\s\S]*?)\n\s{2}\}/
    );
    assert.ok(sceneControl);

    const cancelIndex = sceneControl[1].indexOf("cancelPendingWork()");
    const dispatchIndex = sceneControl[1].indexOf("dispatch({ type })");
    assert.ok(cancelIndex >= 0);
    assert.ok(dispatchIndex > cancelIndex);
  });

  it("invalidates pending speech before unmount aborts it", () => {
    assert.match(
      app,
      /useEffect\(\s*\(\) => \(\) => \{\s*pressedRef\.current = false;\s*pressSequenceRef\.current \+= 1;\s*recordingControllerRef\.current\?\.abort\(\)/
    );
  });

  it("uses only the dock prompt for user speech", () => {
    assert.match(app, /scene\.speech\.kind === "user" \? null/);
    assert.match(app, /learner-mic-prompt/);
    assert.doesNotMatch(app, /user-turn-panel/);
  });

  it("keeps the screen-reader summary as the only live progress region", () => {
    assert.match(app, /<span className="dock-status">/);
    assert.doesNotMatch(
      app,
      /<span aria-live="polite" className="dock-status">/
    );
  });

  it("shows contrasting local focus rings on dock controls", () => {
    assert.match(
      styles,
      /\.scene-control-button:focus-visible,\s*\.playback-control-button:focus-visible\s*\{[^}]*outline:\s*4px solid #fff[^}]*outline-offset:\s*3px/,
    );
    assert.match(
      styles,
      /\.hold-to-talk-button:focus-visible\s*\{[^}]*outline:\s*4px solid #173c67/,
    );
  });

  it("delegates completed recordings to the speech operation boundary", () => {
    assert.match(app, /finishSpeechOperation/);
    assert.match(app, /const generation = pressSequenceRef\.current/);
    assert.match(
      app,
      /getCurrentGeneration: \(\) => pressSequenceRef\.current/
    );
  });
});
