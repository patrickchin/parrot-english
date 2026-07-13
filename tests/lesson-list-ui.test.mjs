import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readProjectFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("lesson list integration contracts", () => {
  it("routes the authenticated lessons page directly to the catalog", () => {
    const app = readProjectFile("src/App.tsx");

    assert.match(
      app,
      /<Route\s+element=\{<LessonList\s*\/>\}\s+path=["']\/lessons["']\s*\/>/,
    );
    assert.doesNotMatch(app, /LessonExperience|activeLessonId|appNavigationReducer/);
    assert.doesNotMatch(app, /from\s+["']\.\/app-navigation["']/);
  });

  it("keeps Back to lessons separate from previous-scene navigation", () => {
    const app = readProjectFile("src/App.tsx");

    assert.match(app, /aria-label="Back to lesson list"/);
    assert.match(
      app,
      /className="lesson-list-back-button app-header-control"/,
    );
    assert.match(app, /onClick=\{handleBack\}/);
    assert.match(
      app,
      /const handleBack = useCallback\(\(\) => \{[\s\S]*?onBack\(\);[\s\S]*?\}, \[exitRouteActivity, onBack\]\)/,
    );
    assert.match(app, /aria-label="Previous scene"/);
  });

  it("removes the superseded in-player lesson select", () => {
    const app = readProjectFile("src/App.tsx");

    assert.doesNotMatch(app, /<select|Lesson picker/);
  });

  it("links discovered Parrot lessons to their canonical first scenes", () => {
    const list = readProjectFile("src/LessonList.tsx");

    assert.match(list, /import\s+\{\s*Link\s*\}\s+from\s+["']react-router["']/);
    assert.match(list, /getLessonScenePath\("parrot",\s*lesson\.id,\s*0\)/);
    assert.match(list, /aria-label=\{`Start lesson: \$\{lesson\.title\}`\}/);
    assert.doesNotMatch(list, /onOpenLesson|UPCOMING_LESSONS|Coming soon|LockKeyhole/);
  });

  it("presents separate Parrot and My lesson sources", () => {
    const list = readProjectFile("src/LessonList.tsx");

    assert.match(list, /id="parrot-lessons-title"[^>]*>Parrot Lessons/);
    assert.match(list, /id="my-lessons-title"[^>]*>My Lessons/);
    assert.match(list, /<h3>\{lesson\.title\}<\/h3>/);
    assert.match(list, /className="my-lessons-empty"/);
    assert.match(list, /You haven't created any lessons yet\./);
    assert.match(list, /to="\/lessons\/my\/create"/);
    assert.match(list, /Create a lesson/);
  });

  it("provides responsive catalog and Back-control styles", () => {
    const designSystem = readProjectFile("src/design-system.css");
    const styles = readProjectFile("src/styles.css");

    assert.match(styles, /\.lesson-list-page\s*\{/);
    assert.match(styles, /\.lesson-card-grid\s*\{[^}]*grid-template-columns/s);
    assert.match(styles, /\.lesson-card-action:hover\s*\{/);
    assert.match(
      styles,
      /\.lesson-card-action:focus-visible\s*\{[^}]*outline:\s*5px solid var\(--color-brand-navy\)[^}]*outline-offset:\s*4px/s,
    );
    assert.doesNotMatch(styles, /\.lesson-card-action:disabled/);
    assert.match(designSystem, /\.app-header-control\s*\{/);
    assert.match(styles, /@media \(max-width: 700px\)/);
    assert.doesNotMatch(styles, /\.lesson-picker/);
  });

  it("separates lesson sources and keeps navigation clear of fixed lesson chrome", () => {
    const designSystem = readProjectFile("src/design-system.css");
    const list = readProjectFile("src/LessonList.tsx");
    const styles = readProjectFile("src/styles.css");

    assert.match(styles, /\.lesson-catalog-section\s*\{/);
    assert.match(
      styles,
      /\.lesson-catalog-section\s+>\s+h2\s*\{[^}]*color:\s*var\(--color-brand-navy\)/s,
    );
    assert.match(
      styles,
      /\.my-lessons-empty\s*\{[^}]*border:\s*4px dashed[^}]*background:/s,
    );
    assert.match(list, /lesson-main-menu-link app-header-control/);
    assert.match(
      designSystem,
      /\.app-header-control\s*\{[^}]*position:\s*absolute[^}]*top:\s*var\(--app-header-top\)[^}]*left:\s*var\(--app-header-edge\)/s,
    );
    assert.match(
      designSystem,
      /\.app-header-control--secondary\s*\{[^}]*left:\s*calc\(/s,
    );
  });

  it("uses compact horizontal cards with actions on the right", () => {
    const styles = readProjectFile("src/styles.css");

    assert.match(
      styles,
      /\.lesson-card-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    );
    assert.match(
      styles,
      /\.lesson-card\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*clamp\(170px,\s*20vw,\s*230px\)\s+minmax\(0,\s*1fr\)/s,
    );
    assert.match(
      styles,
      /\.lesson-card-content\s*\{[^}]*grid-template-areas:[^;]*"title action"[^;]*"summary action"[^;]*"count action"/s,
    );
    assert.match(
      styles,
      /\.lesson-card-action\s*\{[^}]*grid-area:\s*action/s,
    );
    assert.match(styles, /\.lesson-card-content h3\s*\{/);
    assert.doesNotMatch(styles, /\.lesson-card-content h2/);
  });
});
