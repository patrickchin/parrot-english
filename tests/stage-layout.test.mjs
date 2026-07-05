import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function getRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));

  assert.ok(match, `Expected to find CSS rule for ${selector}`);
  return match[1];
}

describe("catalog-driven stage layout", () => {
  it("reserves a safe area for the lesson control dock", () => {
    const stage = getRule(".lesson-stage");
    const sprite = getRule(".character-sprite");
    const dock = getRule(".scene-control-dock");

    assert.match(
      stage,
      /--control-safe-area:\s*clamp\(118px,\s*16vh,\s*154px\)/,
    );
    assert.match(
      sprite,
      /bottom:\s*calc\(var\(--control-safe-area\)\s*\+\s*clamp\(4px,\s*1vh,\s*14px\)\)/,
    );
    assert.match(dock, /position:\s*absolute/);
    assert.match(dock, /grid-template-columns:/);
    assert.match(dock, /background:\s*rgb\(23 60 103/);
  });

  it("positions every character through shared catalog slots", () => {
    const layer = getRule(".character-layer");
    const sprite = getRule(".character-sprite");

    assert.match(layer, /position:\s*absolute/);
    assert.match(sprite, /--character-index/);
    assert.match(sprite, /--character-count/);
    assert.match(sprite, /position:\s*absolute/);
    assert.match(sprite, /object-position|left:/);
  });

  it("anchors speech to the same dynamic character slots", () => {
    const bubble = getRule(".speech-bubble");

    assert.match(bubble, /--character-index/);
    assert.match(bubble, /--character-count/);
    assert.match(bubble, /position:\s*absolute/);
  });

  it("keeps narrator text separate from character speech", () => {
    const caption = getRule(".narrator-caption");

    assert.match(caption, /position:\s*absolute/);
    assert.match(caption, /text-align:\s*center/);
  });

  it("provides a compact layout for narrow screens", () => {
    const compactStart = styles.indexOf("@media (max-width: 720px)");
    const compactEnd = styles.indexOf("@media (max-height: 620px)");
    const compactStyles = styles.slice(compactStart, compactEnd);

    assert.notEqual(compactStart, -1);
    assert.ok(compactEnd > compactStart);
    assert.match(
      compactStyles,
      /\.lesson-stage\s*\{[^}]*--control-safe-area:\s*clamp\(170px,\s*27vh,\s*218px\)/,
    );
    assert.match(
      compactStyles,
      /\.scene-control-dock\s*\{[^}]*grid-template-areas:\s*"back playback next"\s*"prompt prompt prompt"/,
    );
    assert.match(
      compactStyles,
      /\.character-sprite\s*\{[^}]*bottom:\s*calc\(var\(--control-safe-area\)/,
    );
  });
});
