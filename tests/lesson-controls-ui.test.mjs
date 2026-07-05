import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

describe("scene playback controls", () => {
  it("renders navigation and speaking actions without persistent playback controls", () => {
    const controls = app.match(
      /<nav[\s\S]*?className="scene-controls"[\s\S]*?<\/nav>/g,
    ) ?? [];

    assert.equal(controls.length, 1);
    assert.match(controls[0], /aria-label="Previous scene"/);
    assert.match(controls[0], /className="learner-target-pill"/);
    assert.match(controls[0], /className="dock-status"/);
    assert.match(controls[0], /className=\{`hold-to-talk-button/);
    assert.match(controls[0], /className="checking-label"/);
    assert.match(controls[0], /aria-label="Next scene"/);
    assert.doesNotMatch(
      controls[0],
      /scene-control-dock|learner-mic-prompt|playback-control-button|playbackLabel/,
    );
    assert.match(app, /PLAY_SCENE/);
    assert.match(app, /PAUSE_SCENE/);
    assert.match(app, /SCENE_PREVIOUS/);
    assert.match(app, /SCENE_NEXT/);
    assert.match(app, /REPLAY_LESSON/);
  });

  it("renders a standalone Start or Replay action outside the bottom controls", () => {
    assert.match(
      app,
      /const showStartAction =\s*state\.phase === LessonPhase\.Idle \|\|\s*state\.phase === LessonPhase\.Finished/,
    );
    assert.match(
      app,
      /const startActionLabel =\s*state\.phase === LessonPhase\.Finished\s*\? "Replay lesson"\s*:\s*"Start lesson"/,
    );
    assert.match(
      app,
      /className="lesson-start-layer"[\s\S]*aria-label=\{startActionLabel\}[\s\S]*className="start-lesson-button"[\s\S]*onClick=\{handleStartAction\}/,
    );
    assert.doesNotMatch(
      app,
      /playback-control-button|playbackLabel|Volume2|VolumeX|volume-button/,
    );
    assert.doesNotMatch(app, /const \[muted, setMuted\]/);
    assert.doesNotMatch(styles, /\.playback-control-button|\.volume-button/);
  });

  it("focuses the prominent Start action when the routed player mounts", () => {
    assert.match(
      app,
      /const startActionRef = useRef<HTMLButtonElement \| null>\(null\)/,
    );
    assert.match(
      app,
      /useEffect\(\(\) => \{\s*startActionRef\.current\?\.focus\(\{ preventScroll: true \}\);\s*\}, \[\]\)/,
    );
    assert.match(
      app,
      /className="start-lesson-button"[\s\S]*?onClick=\{handleStartAction\}[\s\S]*?ref=\{startActionRef\}/,
    );
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

  it("invalidates stale playback outcomes before controls or unmount can move state", () => {
    assert.match(app, /createPlaybackOperation/);
    assert.match(app, /const playbackGenerationRef = useRef\(0\)/);
    assert.match(
      app,
      /function cancelPendingWork\(\) \{[\s\S]*?playbackGenerationRef\.current \+= 1;[\s\S]*?playbackControllerRef\.current\?\.abort\(\)/
    );
    assert.match(
      app,
      /useEffect\(\s*\(\) => \(\) => \{[\s\S]*?playbackGenerationRef\.current \+= 1;/
    );
    assert.match(
      app,
      /createPlaybackOperation\(\{[\s\S]*?getCurrentGeneration: \(\) => playbackGenerationRef\.current[\s\S]*?\}\)/
    );
    assert.doesNotMatch(app, /if \(muted\)|window\.setTimeout/);
    assert.match(app, /\.then\(\(\) => playbackOperation\.complete\(\)\)/);
    assert.match(app, /playbackOperation\.fail\(caughtError\)/);
  });

  it("invalidates pending speech before unmount aborts it", () => {
    assert.match(
      app,
      /useEffect\(\s*\(\) => \(\) => \{\s*pressedRef\.current = false;\s*pressSequenceRef\.current \+= 1;[\s\S]*?recordingControllerRef\.current\?\.abort\(\)/
    );
  });

  it("uses an independent learner target pill for user speech", () => {
    assert.match(app, /scene\.speech\.kind === "user" \? null/);
    assert.match(app, /learner-target-pill/);
    assert.doesNotMatch(app, /learner-mic-prompt|user-turn-panel/);
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
      /\.scene-control-button:focus-visible\s*\{[^}]*outline:\s*4px solid #fff[^}]*outline-offset:\s*3px/,
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
