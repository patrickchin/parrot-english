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
    assert.match(buttonRule, /background:\s*#087451/);
    assert.match(buttonRule, /border-radius:\s*999px/);
    assert.match(buttonRule, /touch-action:\s*none/);
    assert.match(recordingRule, /animation:\s*micPulse/);
    assert.doesNotMatch(styles, /\.user-turn-panel\s*\{/);
  });

  it("keeps the short evaluating status inside its prompt track", () => {
    const combinedStart = styles.indexOf(
      "@media (max-width: 720px) and (max-height: 620px)",
    );
    const combinedEnd = styles.indexOf(
      "@media (prefers-reduced-motion: reduce)",
    );
    const combinedStyles = styles.slice(combinedStart, combinedEnd);

    assert.notEqual(combinedStart, -1);
    assert.ok(combinedEnd > combinedStart);
    assert.match(app, /<strong>\{currentStep\.dialogue\}<\/strong>/);
    assert.match(app, /Checking your speech\.\.\./);
    assert.match(
      combinedStyles,
      /\.learner-mic-prompt\.is-evaluating\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^}]*padding:\s*4px 6px/,
    );
    assert.match(
      combinedStyles,
      /\.learner-mic-prompt\.is-evaluating > strong\s*\{[^}]*position:\s*absolute[^}]*width:\s*1px[^}]*height:\s*1px[^}]*overflow:\s*hidden[^}]*clip-path:\s*inset\(50%\)/,
    );
    assert.match(
      combinedStyles,
      /\.learner-mic-prompt\.is-evaluating \.checking-label\s*\{[^}]*min-width:\s*0[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*overflow:\s*hidden[^}]*padding:\s*0 6px[^}]*font-size:\s*0\.72rem[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/,
    );
  });
});
