import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function getRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));

  assert.ok(match, `Expected to find CSS rule for ${selector}`);
  return match[1];
}

describe("lesson list UI", () => {
  it("uses the lesson list as the normal app entry while preserving e2e lesson autostart", () => {
    assert.match(main, /import \{ App \} from "\.\/App"/);
    assert.match(main, /<App \/>/);
    assert.match(app, /type AppScreen = "lesson-list" \| "lesson-player"/);
    assert.match(app, /parrotE2eAutostart=1/);
  });

  it("keeps the current lesson as the only enabled lesson option", () => {
    const lessonData = readFileSync(
      new URL("../lib/lesson-data.js", import.meta.url),
      "utf8"
    );

    assert.match(lessonData, /export const LESSONS = \[/);
    assert.doesNotMatch(app, /const LESSON_LIST_ITEMS/);
    assert.match(app, /lessons=\{LESSONS\}/);
    assert.match(app, /onStartLesson\(lesson\.id\)/);
    assert.match(app, /disabled=\{!isLessonPlayable\(lesson\)\}/);
    assert.match(app, /aria-disabled=\{!isLessonPlayable\(lesson\)\}/);
  });

  it("reuses the same pig and parrot assets as the lesson stage", () => {
    assert.match(app, /LESSON_SCENE_ASSETS/);
    assert.match(app, /src=\{LESSON_SCENE_ASSETS\.polly\.idle\.src\}/);
    assert.match(app, /src=\{LESSON_SCENE_ASSETS\.peppa\.wave\.src\}/);
    assert.doesNotMatch(app, /assets\/characters\/parrot-coach/);
    assert.doesNotMatch(app, /assets\/characters\/pig-host/);
  });

  it("styles the list as a vertical first-screen lesson picker", () => {
    const shellRule = getRule(".lesson-list-shell");
    const gridRule = getRule(".lesson-list-grid");
    const disabledRule = getRule(".lesson-list-card:disabled");

    assert.match(shellRule, /height:\s*100dvh/);
    assert.match(gridRule, /grid-template-columns:\s*minmax\(0,\s*760px\)/);
    assert.doesNotMatch(gridRule, /auto-fit/);
    assert.match(disabledRule, /cursor:\s*not-allowed/);
    assert.match(styles, /@media \(max-width: 640px\)/);
  });
});
