import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function getRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));

  assert.ok(match, `Expected to find CSS rule for ${selector}`);
  return match[1];
}

describe("hold-to-talk UI", () => {
  it("starts the lesson without requesting microphone permission", () => {
    assert.doesNotMatch(app, /requestMicrophoneAccess|recordSpeechClip/);
    assert.match(app, /dispatchSceneControl\("PLAY_SCENE"\)/);
    assert.match(app, /startSpeechRecording/);
  });

  it("handles pointer and keyboard press-and-hold interaction", () => {
    assert.match(app, /onPointerDown/);
    assert.match(app, /onPointerUp/);
    assert.match(app, /onPointerCancel/);
    assert.match(app, /onKeyDown/);
    assert.match(app, /onKeyUp/);
    assert.match(app, /setPointerCapture/);
    assert.match(app, /currentStep\.dialogue/);
  });

  it("renders an accessible hold button with recording states", () => {
    assert.match(app, /learner-mic-prompt/);
    assert.match(app, /scene\.speech\.kind === "user" \? null/);
    assert.match(app, /hold-to-talk-button/);
    assert.match(app, /Press and hold to speak/);
    assert.match(app, /Release when you finish/);
    assert.match(app, /aria-live="assertive"/);

    const promptRule = getRule(".learner-mic-prompt");
    const buttonRule = getRule(".hold-to-talk-button");
    const recordingRule = getRule(".hold-to-talk-button.is-recording");
    assert.match(promptRule, /background:\s*rgb\(255 255 255/);
    assert.match(buttonRule, /border-radius:\s*999px/);
    assert.match(buttonRule, /touch-action:\s*none/);
    assert.match(recordingRule, /animation:\s*micPulse/);
    assert.doesNotMatch(styles, /\.user-turn-panel\s*\{/);
  });
});
