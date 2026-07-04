import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const packageManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);

describe("lesson routing UI", () => {
  it("mounts App as a child of BrowserRouter", () => {
    assert.equal(typeof packageManifest.dependencies["react-router"], "string");
    assert.match(main, /import \{ BrowserRouter \} from "react-router"/);
    assert.match(main, /<BrowserRouter>\s*<App \/>\s*<\/BrowserRouter>/s);
  });

  it("declares the numbered lesson routes and a root fallback", () => {
    assert.match(app, /<Routes>/);
    assert.match(app, /<Route[^>]*path="\/"[^>]*element=\{<LessonListRoute \/>\}/);
    assert.match(
      app,
      /<Route[^>]*path="\/lessons\/:lessonNumber"[^>]*element=\{<LessonRedirectRoute \/>\}/
    );
    assert.match(
      app,
      /<Route[^>]*path="\/lessons\/:lessonNumber\/pages\/:pageNumber"[^>]*element=\{<LessonPageRoute \/>\}/
    );
    assert.match(
      app,
      /<Route[^>]*path="\*"[^>]*element=\{<Navigate to="\/" replace \/>\}/
    );
  });

  it("validates route params and redirects invalid routes to the lesson list", () => {
    assert.match(app, /resolveLessonNumber\(lessonNumber\)/);
    assert.match(app, /resolveLessonPageRoute\(lessonNumber, pageNumber\)/);
    assert.ok(
      app.match(/if \(!resolved\) return <Navigate to="\/" replace \/>;/g)?.length >= 2
    );
  });

  it("routes player page changes to canonical one-based URLs", () => {
    assert.match(app, /initialStepIndex=\{resolved\.pageIndex\}/);
    assert.match(app, /onNavigatePage=\{\(nextPageIndex\) =>/);
    assert.match(
      app,
      /navigate\(\s*getLessonPagePath\(resolved\.lessonNumber, nextPageIndex \+ 1\)\s*\)/s
    );
    assert.match(
      app,
      /const nextStepIndex = Math\.max\(\s*0,\s*Math\.min\(state\.stepIndex \+ stepOffset, lesson\.steps\.length - 1\)\s*\);/s
    );
    assert.match(
      app,
      /if \(nextStepIndex !== state\.stepIndex\) \{\s*onNavigatePage\?\.\(nextStepIndex\);\s*\}/s
    );
  });

  it("uses URL navigation instead of private app screen state", () => {
    assert.doesNotMatch(app, /type AppScreen/);
    assert.doesNotMatch(app, /setScreen/);
  });

  it("canonicalizes e2e autostart from root while preserving its query", () => {
    assert.match(app, /parrotE2eAutostart=1/);
    assert.match(
      app,
      /pathname: getLessonPagePath\(getDefaultLessonNumber\(\), 1\)/
    );
    assert.match(app, /search: location\.search/);
  });

  it("synchronizes player state when browser history changes the page", () => {
    assert.match(
      app,
      /useEffect\(\(\) => \{\s*if \(state\.stepIndex === initialStepIndex\) return;\s*dispatch\(\{ type: "SELECT_STEP", stepIndex: initialStepIndex \}\);\s*\}, \[initialStepIndex, state\.stepIndex\]\);/s
    );
  });
});
