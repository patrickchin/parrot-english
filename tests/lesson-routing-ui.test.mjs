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
  });

  it("coordinates muted and unmuted audio completion with routed lesson events", () => {
    assert.equal(
      app.match(/dispatchLessonEvent\(completionEvent\)/g)?.length,
      2,
      "Expected both audio completion paths to use dispatchLessonEvent"
    );
    assert.doesNotMatch(app, /dispatch\(completionEvent\)/);
  });

  it("marks internal page navigation before dispatching and updating the URL", () => {
    assert.match(
      app,
      /const handledRoutedStepIndexRef = useRef\(initialStepIndex\);/
    );
    assert.match(
      app,
      /const onNavigatePageRef = useRef\(onNavigatePage\);[\s\S]*onNavigatePageRef\.current = onNavigatePage;/
    );
    assert.match(
      app,
      /const dispatchLessonEvent = useCallback\([\s\S]*handledRoutedStepIndexRef\.current = nextStepIndex;[\s\S]*dispatch\(event\);[\s\S]*onNavigatePageRef\.current\?\.\(nextStepIndex\);/
    );
    assert.match(
      app,
      /function navigateScene[\s\S]*dispatchLessonEvent\([\s\S]*\);\s*\}/
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

  it("only resets player state for a genuine routed page change", () => {
    assert.match(
      app,
      /useEffect\(\(\) => \{\s*if \(initialStepIndex === handledRoutedStepIndexRef\.current\) return;[\s\S]*dispatch\(\{ type: "SELECT_STEP", stepIndex: initialStepIndex \}\);\s*\}, \[initialStepIndex[^\]]*\]\);/
    );
    assert.doesNotMatch(
      app,
      /\}, \[initialStepIndex, state\.stepIndex\]\);/
    );
  });

  it("clears page-local errors and transient microphone work on routed page changes", () => {
    assert.match(
      app,
      /const cancelPageLocalActivity = useCallback\(\(\) => \{[\s\S]*setError\(""\);[\s\S]*activeRecordingRef\.current\?\.cancelController\.abort\(\);[\s\S]*microphoneAccessControllerRef\.current\?\.abort\(\);[\s\S]*setIsHoldingMic\(false\);[\s\S]*setIsPreparingMicrophone\(false\);[\s\S]*\}, \[\]\);/
    );
    assert.match(
      app,
      /if \(initialStepIndex === handledRoutedStepIndexRef\.current\) return;[\s\S]*cancelPageLocalActivity\(\);[\s\S]*dispatch\(\{ type: "SELECT_STEP", stepIndex: initialStepIndex \}\);/
    );
  });

  it("cancels stale microphone permission requests without changing the new page", () => {
    assert.match(
      app,
      /const microphoneAccessController = new AbortController\(\);[\s\S]*requestMicrophoneAccessWithSignal\(\{\s*signal: microphoneAccessController\.signal,\s*\}\)/
    );
    assert.match(
      app,
      /if \(\s*microphoneAccessController\.signal\.aborted \|\|\s*microphoneAccessControllerRef\.current !== microphoneAccessController\s*\) \{\s*return;\s*\}[\s\S]*dispatch\(\{ type: "START" \}\);/
    );
    assert.match(
      app,
      /catch \(caughtError\) \{\s*if \(\s*microphoneAccessController\.signal\.aborted \|\|[\s\S]*isAbortError\(caughtError\)[\s\S]*\) \{\s*return;\s*\}[\s\S]*dispatch\(\{ type: "SYSTEM_ERROR", feedbackText \}\);/
    );
    assert.match(
      app,
      /finally \{\s*if \(microphoneAccessControllerRef\.current === microphoneAccessController\) \{[\s\S]*setIsPreparingMicrophone\(false\);\s*\}\s*\}/
    );
    assert.match(
      app,
      /return \(\) => \{[\s\S]*microphoneAccessControllerRef\.current\?\.abort\(\);[\s\S]*\};/
    );
  });
});
