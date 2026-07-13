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
  it("reserves a safe area for the independent lesson controls", () => {
    const stage = getRule(".lesson-stage");
    const sprite = getRule(".character-sprite");
    const controls = getRule(".scene-controls");

    assert.match(
      stage,
      /--control-safe-area:\s*clamp\(118px,\s*16vh,\s*154px\)/,
    );
    assert.match(
      sprite,
      /bottom:\s*calc\(var\(--control-safe-area\)\s*\+\s*clamp\(4px,\s*1vh,\s*14px\)\)/,
    );
    assert.match(controls, /position:\s*absolute/);
    assert.match(controls, /display:\s*flex/);
    assert.match(controls, /flex-wrap:\s*wrap/);
  });

  it("centers a large touch target for starting and replaying lessons", () => {
    const startLayer = getRule(".lesson-start-layer");
    const startButton = getRule(".start-lesson-button");

    assert.match(startLayer, /position:\s*absolute/);
    assert.match(startLayer, /inset:\s*0/);
    assert.match(startLayer, /place-items:\s*center/);
    assert.match(startLayer, /pointer-events:\s*none/);
    assert.match(startButton, /width:\s*min\(/);
    assert.match(startButton, /min-height:\s*clamp\(/);
    assert.match(startButton, /pointer-events:\s*auto/);
  });

  it("uses an invisible control layout with independent pill surfaces", () => {
    const controls = app.match(
      /<nav aria-label="Lesson controls" className="scene-controls">[\s\S]*?<\/nav>/,
    );
    const controlGroup = getRule(".scene-controls");
    const independentPills = getRule(
      ".scene-control-button,\n.dock-status,\n.learner-target-pill,\n.hold-to-talk-button,\n.checking-label",
    );
    const navigationButton = getRule(".scene-control-button");
    const disabledNavigationButton = getRule(".scene-control-button:disabled");

    assert.ok(controls, "Expected the lesson controls nav");
    assert.match(
      controls[0],
      /aria-label="Previous scene"[\s\S]*<ChevronLeft[\s\S]*className="learner-target-pill"[\s\S]*aria-label="Next scene"[\s\S]*<ChevronRight/,
    );
    assert.match(controlGroup, /display:\s*flex/);
    assert.match(controlGroup, /flex-wrap:\s*wrap/);
    assert.doesNotMatch(controlGroup, /background:|border:|box-shadow:/);
    assert.match(
      independentPills,
      /min-height:\s*var\(--lesson-pill-height\)/,
    );
    assert.doesNotMatch(app, /scene-control-dock/);
    assert.match(navigationButton, /background:\s*#ff467b/);
    assert.match(navigationButton, /color:\s*#fff/);
    assert.match(disabledNavigationButton, /opacity:\s*0\.68/);
  });

  it("anchors Back left and centers the title cluster", () => {
    const backButton = getRule(".lesson-list-back-button");
    const titleCluster = getRule(".scene-hud");
    const buildBadge = getRule(".build-version-badge");

    assert.match(backButton, /left:\s*var\(--lesson-edge-gap\)/);
    assert.doesNotMatch(backButton, /translateX/);
    assert.match(titleCluster, /left:\s*50%/);
    assert.match(titleCluster, /transform:\s*translateX\(-50%\)/);
    assert.match(buildBadge, /position:\s*absolute/);
    assert.match(buildBadge, /left:\s*var\(--lesson-edge-gap\)/);
  });

  it("positions every character through shared catalog slots", () => {
    const layer = getRule(".character-layer");
    const sprite = getRule(".character-sprite");
    const artwork = getRule(".character-sprite img");

    assert.match(layer, /position:\s*absolute/);
    assert.match(sprite, /--character-index/);
    assert.match(sprite, /--character-count/);
    assert.match(sprite, /position:\s*absolute/);
    assert.match(sprite, /object-position|left:/);
    assert.match(sprite, /grid-template-rows:\s*minmax\(0,\s*1fr\) auto/);
    assert.match(artwork, /min-height:\s*0/);
    assert.match(artwork, /height:\s*100%/);
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

  it("shares one normal type size and pill geometry", () => {
    const root = getRule(":root");
    const lessonPills = getRule(
      ".scene-control-button,\n.dock-status,\n.learner-target-pill,\n.hold-to-talk-button,\n.checking-label",
    );

    assert.match(
      root,
      /--lesson-ui-font-size:\s*clamp\(1rem,\s*1\.3vw,\s*1\.2rem\)/,
    );
    assert.match(root, /--lesson-pill-height:\s*64px/);
    assert.match(root, /--lesson-pill-border:\s*4px solid #fff/);
    assert.match(root, /--lesson-pill-radius:\s*999px/);
    assert.match(
      getRule(".scene-title"),
      /font-size:\s*var\(--lesson-ui-font-size\)/,
    );
    assert.match(
      getRule(".lesson-list-back-button"),
      /font-size:\s*var\(--lesson-ui-font-size\)/,
    );
    assert.match(
      getRule(".character-name"),
      /font-size:\s*var\(--lesson-ui-font-size\)/,
    );
    assert.match(
      styles,
      /\.speech-bubble > span,\s*\.narrator-caption > span\s*\{[^}]*font-size:\s*clamp\(0\.875rem,\s*1vw,\s*1rem\)/s,
    );
    assert.match(
      styles,
      /\.speech-bubble p,\s*\.narrator-caption p\s*\{[^}]*font-size:\s*clamp\(1\.5rem,\s*2\.5vw,\s*2\.625rem\)/s,
    );
    assert.match(lessonPills, /font-size:\s*var\(--lesson-ui-font-size\)/);
  });

  it("provides a compact layout for narrow screens", () => {
    const compactStart = styles.indexOf("@media (max-width: 720px)");
    const compactEnd = styles.indexOf("@media (max-height: 620px)");
    const compactStyles = styles.slice(compactStart, compactEnd);

    assert.notEqual(compactStart, -1);
    assert.ok(compactEnd > compactStart);
    assert.match(
      compactStyles,
      /:root\s*\{[^}]*--lesson-pill-height:\s*52px/,
    );
    assert.match(
      compactStyles,
      /\.lesson-stage\s*\{[^}]*--control-safe-area:\s*clamp\(150px,\s*22vh,\s*180px\)/,
    );
    assert.match(
      compactStyles,
      /\.scene-controls\s*\{[^}]*display:\s*grid[^}]*width:\s*calc\(100vw - 20px\)[^}]*grid-template-areas:\s*"prompt prompt prompt"\s*"previous microphone next"/,
    );
    assert.match(
      compactStyles,
      /\.lesson-list-back-button > span\s*\{[^}]*display:\s*none/,
    );
    assert.doesNotMatch(
      compactStyles,
      /scene-control-dock|learner-mic-prompt/,
    );
    assert.match(
      compactStyles,
      /\.character-sprite\s*\{[^}]*bottom:\s*calc\(var\(--control-safe-area\)/,
    );
  });

  it("compacts the independent pills and stage content for short viewports", () => {
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
      /:root\s*\{[^}]*--lesson-pill-height:\s*44px/,
    );
    assert.match(
      shortStyles,
      /\.lesson-stage\s*\{[^}]*--control-safe-area:\s*clamp\(78px,\s*23vh,\s*104px\)/,
    );
    assert.match(
      shortStyles,
      /\.scene-controls\s*\{[^}]*bottom:\s*6px[^}]*display:\s*flex[^}]*flex-wrap:\s*nowrap/,
    );
    assert.match(
      shortStyles,
      /\.hold-to-talk-button > span\s*\{[^}]*display:\s*none/,
    );
    assert.doesNotMatch(shortStyles, /scene-control-dock|learner-mic-prompt/);
    assert.match(
      shortStyles,
      /\.speech-bubble,\s*\.narrator-caption\s*\{[^}]*top:\s*112px/,
    );
    assert.match(
      shortStyles,
      /\.lesson-list-back-button\s*\{[^}]*top:\s*14px/,
    );
  });

  it("uses one row of independent pills in short narrow viewports", () => {
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
      /\.lesson-stage\s*\{[^}]*--control-safe-area:\s*clamp\(76px,\s*24vh,\s*94px\)/,
    );
    assert.match(
      combinedStyles,
      /\.scene-controls\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*nowrap/,
    );
    assert.match(
      combinedStyles,
      /\.learner-target-pill\s*\{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/,
    );
    assert.doesNotMatch(
      combinedStyles,
      /scene-control-dock|learner-mic-prompt/,
    );
  });
});
