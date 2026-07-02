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

describe("lesson list scrolling and color", () => {
  it("keeps the page fixed while only the lesson list scrolls", () => {
    const shellRule = getRule(".lesson-list-shell");
    const contentRule = getRule(".lesson-list-content");
    const gridRule = getRule(".lesson-list-grid");

    assert.match(shellRule, /height:\s*100dvh/);
    assert.match(shellRule, /overflow:\s*hidden/);
    assert.match(contentRule, /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
    assert.match(contentRule, /height:\s*calc\(100dvh - var\(--lesson-list-page-padding\) - var\(--lesson-list-page-padding\)\)/);
    assert.match(gridRule, /overflow-y:\s*auto/);
    assert.match(styles, /@media \(max-width: 900px\)\s*\{[^}]*\.lesson-list-shell\s*\{[^}]*overflow:\s*hidden/s);
  });

  it("uses a more saturated lesson-list palette than the neutral first pass", () => {
    const shellRule = getRule(".lesson-list-shell");
    const cardRule = getRule(".lesson-list-card");
    const availableRule = getRule(".lesson-list-card.is-available");

    assert.match(shellRule, /background:\s*#52c7ea/);
    assert.match(cardRule, /background:\s*#fff7ce/);
    assert.match(availableRule, /border-color:\s*#ffd944/);
    assert.doesNotMatch(cardRule, /rgba\(255,\s*255,\s*255,\s*0\.96\)/);
  });
});
