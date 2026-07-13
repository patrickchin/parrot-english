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
    assert.match(app, /learner-target-pill/);
    assert.doesNotMatch(app, /learner-mic-prompt/);
    assert.match(app, /scene\.speech\.kind === "user" \? null/);
    assert.match(app, /hold-to-talk-button/);
    assert.match(app, /Press and hold to speak/);
    assert.match(app, /Release when you finish/);
    assert.match(app, /aria-live="assertive"/);

    const targetRule = getRule(".learner-target-pill");
    const buttonRule = getRule(".hold-to-talk-button");
    const recordingRule = getRule(".hold-to-talk-button.is-recording");
    assert.match(targetRule, /background:\s*rgb\(255 255 255/);
    assert.match(
      buttonRule,
      /background:\s*var\(--color-brand-green\)/,
    );
    assert.match(buttonRule, /touch-action:\s*none/);
    assert.match(
      getRule(":root"),
      /--lesson-pill-radius:\s*var\(--radius-control\)/,
    );
    assert.match(recordingRule, /animation:\s*micPulse/);
    assert.doesNotMatch(styles, /\.user-turn-panel\s*\{/);
  });

  it("keeps the short evaluating status as an independent bounded pill", () => {
    const combinedStart = styles.indexOf(
      "@media (max-width: 720px) and (max-height: 620px)",
    );
    const combinedEnd = styles.indexOf(
      "@media (prefers-reduced-motion: reduce)",
    );
    const combinedStyles = styles.slice(combinedStart, combinedEnd);

    assert.notEqual(combinedStart, -1);
    assert.ok(combinedEnd > combinedStart);
    assert.match(
      app,
      /className="learner-target-pill"[\s\S]*\{currentStep\.dialogue\}[\s\S]*className="checking-label"/,
    );
    assert.match(app, /Checking your speech\.\.\./);
    assert.match(
      combinedStyles,
      /\.checking-label\s*\{[^}]*max-width:\s*26vw[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/,
    );
    assert.doesNotMatch(combinedStyles, /learner-mic-prompt/);
  });
});
