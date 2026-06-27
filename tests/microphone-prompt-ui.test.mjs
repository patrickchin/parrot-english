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

describe("microphone prompt UI", () => {
  it("renders a dedicated assertive speak-now panel for microphone turns", () => {
    assert.match(app, /showMicPrompt/);
    assert.match(app, /speak-now-panel/);
    assert.match(app, /aria-live="assertive"/);
    assert.match(app, /轮到你说/);
    assert.match(app, /currentStep\.childTarget/);
  });

  it("styles the listening state as a large animated microphone affordance", () => {
    const panelRule = getRule(".speak-now-panel");
    const micRule = getRule(".mic-symbol");
    const listeningRule = getRule(".speak-now-panel.is-listening .mic-symbol");

    assert.match(panelRule, /z-index:\s*20/);
    assert.match(panelRule, /min-height:\s*clamp\(/);
    assert.match(micRule, /border-radius:\s*999px/);
    assert.match(listeningRule, /animation:\s*micPulse/);
    assert.match(styles, /@keyframes micPulse/);
    assert.match(styles, /\.mic-waveform span/);
  });
});
