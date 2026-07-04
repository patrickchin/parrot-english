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
    assert.match(main, /<BrowserRouter>\s*<App \/>\s*<\/BrowserRouter>/s);
    assert.match(app, /<Route[^>]*path="\/"[^>]*element=\{<LessonListRoute \/>\}/);
    assert.match(app, /parrotE2eAutostart=1/);
    assert.match(app, /getLessonPagePath\(getDefaultLessonNumber\(\), 1\)/);
    assert.match(app, /search: location\.search/);
    assert.doesNotMatch(app, /type AppScreen/);
  });

  it("keeps the current lesson as the only enabled lesson option", () => {
    const lessonData = readFileSync(
      new URL("../lib/lesson-data.js", import.meta.url),
      "utf8"
    );

    assert.match(lessonData, /from "\.\/lessons\.json"/);
    assert.match(lessonData, /export const LESSONS = catalog\.lessons/);
    assert.doesNotMatch(app, /const LESSON_LIST_ITEMS/);
    assert.match(app, /lessons=\{LESSONS\}/);
    assert.match(app, /function LessonCardContents\(/);
    assert.match(
      app,
      /<Link[\s\S]*?className=\{`lesson-list-card is-\$\{lesson\.status\}`\}[\s\S]*?to=\{getLessonPagePath\(index \+ 1, 1\)\}/
    );
    assert.match(
      app,
      /<button\s+aria-disabled="true"[\s\S]*?disabled[\s\S]*?type="button"/
    );
    assert.match(getRule(".lesson-list-card"), /text-decoration:\s*none/);
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
