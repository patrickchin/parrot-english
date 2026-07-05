import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

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
    const controls = getRule(".scene-controls");
    const dock = getRule(".scene-control-dock");

    assert.match(
      stage,
      /--control-safe-area:\s*clamp\(118px,\s*16vh,\s*154px\)/,
    );
    assert.match(
      sprite,
      /bottom:\s*calc\(var\(--control-safe-area\)\s*\+\s*clamp\(4px,\s*1vh,\s*14px\)\)/,
    );
    assert.match(controls, /position:\s*absolute/);
    assert.match(controls, /grid-template-columns:/);
    assert.match(dock, /background:\s*rgb\(23 60 103/);
  });

  it("keeps pink chevron navigation outside the center action dock", () => {
    const controls = app.match(
      /<nav aria-label="Lesson controls" className="scene-controls">[\s\S]*?<\/nav>/,
    );
    const navigationButton = getRule(".scene-control-button");
    const controlGroup = getRule(".scene-controls");
    const dock = getRule(".scene-control-dock");

    assert.ok(controls, "Expected the lesson controls nav");
    assert.match(
      controls[0],
      /aria-label="Previous scene"[\s\S]*<ChevronLeft[\s\S]*<div className="scene-control-dock">[\s\S]*aria-label=\{playbackLabel\}[\s\S]*<\/div>\s*<button\s*aria-label="Next scene"[\s\S]*<ChevronRight/,
    );
    assert.match(controlGroup, /width:\s*min\(86vw,\s*1320px\)/);
    assert.match(
      controlGroup,
      /grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto/,
    );
    assert.match(
      dock,
      /grid-template-columns:\s*auto minmax\(0,\s*1fr\)/,
    );
    assert.match(navigationButton, /background:\s*#ff467b/);
    assert.match(navigationButton, /color:\s*#fff/);
    assert.match(navigationButton, /border:\s*5px solid #fff/);
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

  it("uses an explicit lesson-screen type hierarchy", () => {
    assert.match(
      getRule(".user-session-bar > span:first-child"),
      /font-size:\s*0\.95rem/,
    );
    assert.match(
      getRule(".user-session-bar button"),
      /font-size:\s*0\.875rem/,
    );
    assert.match(
      getRule(".scene-title"),
      /font-size:\s*clamp\(1\.05rem,\s*1\.55vw,\s*1\.5rem\)/,
    );
    assert.match(
      getRule(".lesson-list-back-button"),
      /font-size:\s*clamp\(1rem,\s*1\.25vw,\s*1\.2rem\)/,
    );
    assert.match(
      getRule(".character-name"),
      /font-size:\s*clamp\(0\.9rem,\s*1vw,\s*1\.05rem\)/,
    );
    assert.match(
      styles,
      /\.speech-bubble > span,\s*\.narrator-caption > span\s*\{[^}]*font-size:\s*clamp\(0\.875rem,\s*1vw,\s*1rem\)/s,
    );
    assert.match(
      styles,
      /\.speech-bubble p,\s*\.narrator-caption p\s*\{[^}]*font-size:\s*clamp\(1\.5rem,\s*2\.5vw,\s*2\.625rem\)/s,
    );
    assert.match(
      styles,
      /\.playback-control-button\s*\{[^}]*flex-flow:[^}]*font-size:\s*clamp\(1rem,\s*1\.3vw,\s*1\.2rem\)/s,
    );
    assert.match(
      getRule(".dock-status"),
      /font-size:\s*clamp\(1rem,\s*1\.3vw,\s*1\.2rem\)/,
    );
    assert.match(
      getRule(".learner-mic-prompt > strong"),
      /font-size:\s*clamp\(1\.15rem,\s*1\.7vw,\s*1\.5rem\)/,
    );
    assert.match(
      getRule(".hold-to-talk-button"),
      /font-size:\s*clamp\(0\.95rem,\s*1\.3vw,\s*1\.15rem\)/,
    );
    assert.match(
      getRule(".checking-label"),
      /font-size:\s*clamp\(0\.9rem,\s*1\.2vw,\s*1\.05rem\)/,
    );
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
