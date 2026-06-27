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

function getPercentValue(rule, property) {
  const match = rule.match(new RegExp(`${property}:\\s*(-?\\d+(?:\\.\\d+)?)%`));

  assert.ok(match, `Expected ${property} to be a percentage value`);
  return Number(match[1]);
}

function getClampViewportPercent(rule, property) {
  const match = rule.match(
    new RegExp(`${property}:\\s*clamp\\([^,]+,\\s*(-?\\d+(?:\\.\\d+)?)vw,`)
  );

  assert.ok(match, `Expected ${property} to use clamp with a vw middle value`);
  return Number(match[1]);
}

describe("stage character bubble layout", () => {
  it("keeps Peppa's desktop bubble visually anchored near the Peppa sprite", () => {
    const peppaCharacter = getRule(".peppa-character");
    const peppaBubble = getRule(".peppa-bubble");

    const characterLeft = getPercentValue(peppaCharacter, "left");
    const characterWidth = getClampViewportPercent(peppaCharacter, "width");
    const bubbleLeft = getPercentValue(peppaBubble, "left");

    assert.ok(
      bubbleLeft <= characterLeft + characterWidth * 0.6,
      `Expected Peppa bubble left (${bubbleLeft}%) to stay close to Peppa sprite at ${characterLeft}% with ${characterWidth}vw width`
    );
  });

  it("keeps Peppa's desktop bubble low enough to point back to the sprite", () => {
    const peppaBubble = getRule(".peppa-bubble");
    const bubbleTop = getPercentValue(peppaBubble, "top");

    assert.ok(
      bubbleTop >= 28,
      `Expected Peppa bubble top (${bubbleTop}%) to sit near the sprite instead of high in the sky`
    );
  });
});
