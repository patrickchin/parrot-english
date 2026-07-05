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
      /\.lesson-stage\s*\{[^}]*--control-safe-area:\s*clamp\(210px,\s*32vh,\s*238px\)/,
    );
    assert.match(
      compactStyles,
      /\.scene-control-dock\s*\{[^}]*grid-template-areas:\s*"prompt prompt prompt"\s*"back playback next"/,
    );
    assert.match(
      compactStyles,
      /\.character-sprite\s*\{[^}]*bottom:\s*calc\(var\(--control-safe-area\)/,
    );
  });

  it("compacts the dock and stage content for short viewports", () => {
    const shortStart = styles.indexOf("@media (max-height: 620px)");
    const combinedStart = styles.indexOf(
      "@media (max-width: 720px) and (max-height: 620px)",
    );
    const reducedMotionStart = styles.indexOf(
      "@media (prefers-reduced-motion: reduce)",
    );
    const shortEnd = combinedStart === -1 ? reducedMotionStart : combinedStart;
    const shortStyles = styles.slice(shortStart, shortEnd);

    assert.notEqual(shortStart, -1);
    assert.ok(shortEnd > shortStart);
    assert.match(
      shortStyles,
      /\.lesson-stage\s*\{[^}]*--control-safe-area:\s*clamp\(84px,\s*23vh,\s*112px\)/,
    );
    assert.match(
      shortStyles,
      /\.scene-control-dock\s*\{[^}]*bottom:\s*6px[^}]*min-height:\s*62px[^}]*border-width:\s*3px[^}]*padding:\s*6px/,
    );
    assert.match(
      shortStyles,
      /\.scene-control-button,\s*\.playback-control-button\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/,
    );
    assert.match(
      shortStyles,
      /\.hold-to-talk-button\s*\{[^}]*min-height:\s*44px/,
    );
    assert.match(shortStyles, /\.checking-label\s*\{[^}]*min-height:\s*44px/);
    assert.match(
      shortStyles,
      /\.speech-bubble,\s*\.narrator-caption\s*\{[^}]*top:\s*112px/,
    );
  });

  it("uses a single-row dock in short narrow viewports", () => {
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
      combinedStyles,
      /\.lesson-stage\s*\{[^}]*--control-safe-area:\s*clamp\(78px,\s*24vh,\s*96px\)/,
    );
    assert.match(
      combinedStyles,
      /\.scene-control-dock\s*\{[^}]*grid-template-areas:\s*"back playback prompt next"/,
    );
    assert.match(
      combinedStyles,
      /\.learner-mic-prompt\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto/,
    );
    assert.match(
      combinedStyles,
      /\.learner-mic-prompt > strong\s*\{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/,
    );
  });
});
