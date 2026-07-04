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
    assert.match(styles, /@media\s*\(max-width:\s*720px\)/);
    assert.match(styles, /\.character-sprite[\s\S]*?width:\s*clamp\(/);
    assert.match(styles, /\.user-turn-panel[\s\S]*?width:\s*min\(/);
  });
});
