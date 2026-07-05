import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readProjectFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("lesson list integration contracts", () => {
  it("starts the authenticated lesson experience on the catalog", () => {
    const app = readProjectFile("src/App.tsx");

    assert.match(app, /export function LessonExperience\(\)/);
    assert.match(app, /<LessonList/);
    assert.match(app, /activeLessonId/);
    assert.match(app, /key=\{selectedEntry\.id\}/);
  });

  it("keeps Back to lessons separate from previous-scene navigation", () => {
    const app = readProjectFile("src/App.tsx");

    assert.match(app, /aria-label="Back to lesson list"/);
    assert.match(app, /className="lesson-list-back-button"/);
    assert.match(app, /onClick=\{onBack\}/);
    assert.match(app, /aria-label="Previous scene"/);
  });

  it("removes the superseded in-player lesson select", () => {
    const app = readProjectFile("src/App.tsx");

    assert.doesNotMatch(app, /<select|Lesson picker/);
  });

  it("renders only discovered playable lessons", () => {
    const list = readProjectFile("src/LessonList.tsx");

    assert.doesNotMatch(list, /UPCOMING_LESSONS|Coming soon|LockKeyhole/);
  });

  it("provides responsive catalog and Back-control styles", () => {
    const styles = readProjectFile("src/styles.css");

    assert.match(styles, /\.lesson-list-page\s*\{/);
    assert.match(styles, /\.lesson-card-grid\s*\{[^}]*grid-template-columns/s);
    assert.match(styles, /\.lesson-card-action:disabled\s*\{/);
    assert.match(styles, /\.lesson-list-back-button\s*\{/);
    assert.match(styles, /@media \(max-width: 700px\)/);
    assert.doesNotMatch(styles, /\.lesson-picker/);
  });
});
