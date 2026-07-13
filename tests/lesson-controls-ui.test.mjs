import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

describe("scene playback controls", () => {
  it("renders navigation and speaking actions without persistent playback controls", () => {
    const controls = app.match(
      /<nav[\s\S]*?className="scene-controls"[\s\S]*?<\/nav>/g,
    ) ?? [];

    assert.equal(controls.length, 1);
    assert.match(controls[0], /aria-label="Previous scene"/);
    assert.match(controls[0], /className="learner-target-pill"/);
    assert.match(controls[0], /className="dock-status"/);
    assert.match(controls[0], /className=\{`hold-to-talk-button/);
    assert.match(controls[0], /className="checking-label"/);
    assert.match(controls[0], /aria-label="Next scene"/);
    assert.doesNotMatch(
      controls[0],
      /scene-control-dock|learner-mic-prompt|playback-control-button|playbackLabel/,
    );
    assert.match(app, /PLAY_SCENE/);
    assert.match(app, /PAUSE_SCENE/);
    assert.match(app, /SCENE_PREVIOUS/);
    assert.match(app, /SCENE_NEXT/);
    assert.match(app, /REPLAY_LESSON/);
  });

  it("renders a standalone Start or Replay action outside the bottom controls", () => {
    assert.match(
      app,
      /const showStartAction =\s*state\.phase === LessonPhase\.Idle \|\|\s*state\.phase === LessonPhase\.Finished/,
    );
    assert.match(
      app,
      /const startActionLabel =\s*state\.phase === LessonPhase\.Finished\s*\? "Replay lesson"\s*:\s*"Start lesson"/,
    );
    assert.match(
      app,
      /className="lesson-start-layer"[\s\S]*aria-label=\{startActionLabel\}[\s\S]*className="start-lesson-button"[\s\S]*onClick=\{handleStartAction\}/,
    );
    assert.doesNotMatch(
      app,
      /playback-control-button|playbackLabel|Volume2|VolumeX|volume-button/,
    );
    assert.doesNotMatch(app, /const \[muted, setMuted\]/);
    assert.doesNotMatch(styles, /\.playback-control-button|\.volume-button/);
  });

  it("focuses Start after idle agreement for every correlated POP sequence", () => {
    assert.match(
      app,
      /const startActionRef = useRef<HTMLButtonElement \| null>\(null\)/,
    );
    assert.match(
      app,
      /useEffect\(\(\) => \{\s*if \(\s*state\.sceneIndex === routedSceneIndex &&\s*state\.phase === LessonPhase\.Idle\s*\) \{\s*startActionRef\.current\?\.focus\(\{ preventScroll: true \}\);\s*\}\s*\}, \[\s*historyPopSequence,\s*routedLocationKey,\s*routedSceneIndex,\s*state\.phase,\s*state\.sceneIndex,?\s*\]\)/,
    );
    assert.match(
      app,
      /className="start-lesson-button"[\s\S]*?onClick=\{handleStartAction\}[\s\S]*?ref=\{startActionRef\}/,
    );
  });

  it("cancels pending learner work before manual scene controls", () => {
    assert.match(app, /const cancelPendingWork = useCallback\(\(\) => \{/);
    assert.match(app, /pressSequenceRef\.current \+= 1/);
    assert.match(app, /playbackControllerRef\.current\?\.abort\(\)/);
    assert.match(app, /recordingControllerRef\.current\?\.abort\(\)/);
    assert.match(app, /recordingRef\.current\?\.cancel\(\)/);
    assert.match(app, /evaluationControllerRef\.current\?\.abort\(\)/);
    const sceneControl = app.match(
      /function dispatchSceneControl\([\s\S]*?\n\s{2}\) \{([\s\S]*?)\n\s{2}\}/,
    );
    assert.ok(sceneControl);

    assert.match(sceneControl[1], /dispatchLessonEvent\(\{ type \}, \{ cancel: true \}\)/);
  });

  it("invalidates stale playback outcomes before controls or unmount can move state", () => {
    assert.match(app, /createPlaybackOperation/);
    assert.match(app, /const playbackGenerationRef = useRef\(0\)/);
    assert.match(
      app,
      /const cancelPendingWork = useCallback\(\(\) => \{[\s\S]*?playbackGenerationRef\.current \+= 1;[\s\S]*?playbackControllerRef\.current\?\.abort\(\)/,
    );
    assert.match(
      app,
      /useEffect\(\s*\(\) => \(\) => \{[\s\S]*?playbackGenerationRef\.current \+= 1;/
    );
    assert.match(
      app,
      /createPlaybackOperation\(\{[\s\S]*?getCurrentGeneration: \(\) => playbackGenerationRef\.current[\s\S]*?\}\)/
    );
    assert.doesNotMatch(app, /if \(muted\)|window\.setTimeout/);
    assert.match(app, /\.then\(\(\) => playbackOperation\.complete\(\)\)/);
    assert.match(app, /playbackOperation\.fail\(caughtError\)/);
  });

  it("invalidates pending speech before unmount aborts it", () => {
    assert.match(
      app,
      /useEffect\(\s*\(\) => \(\) => \{\s*routeActivityGuardRef\.current\.invalidate\(\);\s*pressedRef\.current = false;\s*pressSequenceRef\.current \+= 1;[\s\S]*?recordingControllerRef\.current\?\.abort\(\)/,
    );
  });

  it("uses an independent learner target pill for user speech", () => {
    assert.match(app, /scene\.speech\.kind === "user" \? null/);
    assert.match(app, /learner-target-pill/);
    assert.doesNotMatch(app, /learner-mic-prompt|user-turn-panel/);
  });

  it("keeps the screen-reader summary as the only live progress region", () => {
    assert.match(app, /<span className="dock-status">/);
    assert.doesNotMatch(
      app,
      /<span aria-live="polite" className="dock-status">/
    );
  });

  it("shows contrasting local focus rings on dock controls", () => {
    assert.match(
      styles,
      /\.scene-control-button:focus-visible\s*\{[^}]*outline:\s*4px solid #fff[^}]*outline-offset:\s*3px/,
    );
    assert.match(
      styles,
      /\.hold-to-talk-button:focus-visible\s*\{[^}]*outline:\s*4px solid var\(--color-brand-ink\)/,
    );
  });

  it("delegates completed recordings to the speech operation boundary", () => {
    assert.match(app, /finishSpeechOperation/);
    assert.match(app, /const generation = pressSequenceRef\.current/);
    assert.match(
      app,
      /getCurrentGeneration: \(\) => pressSequenceRef\.current/
    );
  });

  it("uses URL-first scene transitions and reconciles POP routes through the production helper", () => {
    assert.match(app, /createLessonRouteActivityGuard/);
    assert.match(app, /invalidateLessonRouteActivity/);
    assert.match(app, /createLessonHistoryPopToken/);
    assert.match(app, /consumeLessonHistoryPopToken/);
    assert.match(app, /getLessonEventTargetSceneIndex/);
    assert.match(app, /getLessonRouteReconciliationEvent/);
    assert.match(app, /const routeActivityGuardRef = useRef\(/);
    assert.match(app, /const routedSceneRef = useRef\(routedSceneIndex\)/);
    assert.match(app, /routedLocationKey: string/);
    assert.match(app, /const \[historyPopSequence, setHistoryPopSequence\] = useState\(0\)/);
    assert.match(app, /const historyPopSequenceRef = useRef\(0\)/);
    assert.match(app, /const pendingHistoryPopTokenRef = useRef<\{\s*destinationKey: string;\s*sequence: number;\s*\} \| null>\(null\)/);
    assert.match(app, /const pendingRoutedEventRef = useRef<\{[\s\S]*?event: LessonEvent;[\s\S]*?sceneIndex: number;[\s\S]*?\} \| null>\(null\)/);

    const renderSetup = app.slice(
      app.indexOf("const routeActivityGuardRef"),
      app.indexOf("const cancelPendingWork"),
    );
    assert.doesNotMatch(renderSetup, /routedSceneRef\.current\s*=/);
    assert.doesNotMatch(renderSetup, /\.invalidate\(\)/);
    assert.match(
      app,
      /useLayoutEffect\(\(\) => \{\s*if \(routedSceneRef\.current === routedSceneIndex\) return;\s*routedSceneRef\.current = routedSceneIndex;\s*invalidateRouteActivity\(\);\s*\}, \[invalidateRouteActivity, routedSceneIndex\]\)/,
    );
    assert.match(
      app,
      /useEffect\(\(\) => \{\s*const pendingRoutedEvent = pendingRoutedEventRef\.current;\s*const popReconciliation = consumeLessonHistoryPopToken\(\s*pendingHistoryPopTokenRef\.current,\s*routedLocationKey,?\s*\);\s*pendingHistoryPopTokenRef\.current = popReconciliation\.pendingToken;\s*const reconciliationEvent = getLessonRouteReconciliationEvent\(\s*pendingRoutedEvent,\s*routedSceneIndex,\s*\{\s*currentSceneIndex: state\.sceneIndex,\s*isHistoryPop: popReconciliation\.isHistoryPop,\s*\},?\s*\);\s*if \(!reconciliationEvent\) return;\s*pendingRoutedEventRef\.current = null;[\s\S]*?dispatch\(reconciliationEvent\);\s*\}, \[\s*cancelPendingWork,\s*historyPopSequence,\s*routedLocationKey,\s*routedSceneIndex,\s*state\.sceneIndex,?\s*\]\)/,
    );
    assert.match(
      app,
      /const targetSceneIndex = getLessonEventTargetSceneIndex\(\s*state,\s*event,\s*currentLesson,?\s*\)/,
    );
    assert.match(app, /pendingHistoryPopTokenRef\.current = null;\s*pendingRoutedEventRef\.current = \{\s*event,\s*sceneIndex: targetSceneIndex,\s*\}/);
    assert.match(app, /onNavigateScene\(targetSceneIndex\);\s*return;/);
  });

  it("clears stale POP intent before recording a rapid internal scene PUSH", () => {
    assert.match(
      app,
      /if \(targetSceneIndex !== null\) \{[\s\S]*?pendingHistoryPopTokenRef\.current = null;\s*pendingRoutedEventRef\.current = \{\s*event,\s*sceneIndex: targetSceneIndex,\s*\};\s*onNavigateScene\(targetSceneIndex\)/,
    );
  });

  it("captures a keyed POP token and increments its render sequence before exiting", () => {
    assert.match(
      app,
      /const invalidateRouteActivity = useCallback\(\(\) => \{\s*invalidateLessonRouteActivity\(\s*routeActivityGuardRef\.current,\s*cancelPendingWork,?\s*\);\s*\}, \[cancelPendingWork\]\)/,
    );
    assert.match(
      app,
      /const exitRouteActivity = useCallback\(\(\) => \{\s*exitLessonRouteActivity\(\s*pendingRoutedEventRef,\s*routeActivityGuardRef\.current,\s*cancelPendingWork,?\s*\);\s*\}, \[cancelPendingWork\]\)/,
    );
    assert.match(
      app,
      /useLayoutEffect\(\(\) => \{\s*const handlePopState = \(event: PopStateEvent\) => \{\s*const token = createLessonHistoryPopToken\(\s*historyPopSequenceRef\.current,\s*event\.state,\s*window\.history\.state,?\s*\);\s*historyPopSequenceRef\.current = token\.sequence;\s*pendingHistoryPopTokenRef\.current = token;\s*setHistoryPopSequence\(token\.sequence\);\s*exitRouteActivity\(\);\s*\};\s*window\.addEventListener\("popstate", handlePopState, true\);\s*return \(\) =>\s*window\.removeEventListener\("popstate", handlePopState, true\);\s*\}, \[exitRouteActivity\]\)/,
    );
    assert.match(
      app,
      /const handleBack = useCallback\(\(\) => \{\s*exitRouteActivity\(\);\s*onBack\(\);\s*\}, \[exitRouteActivity, onBack\]\)/,
    );
    assert.match(
      app,
      /const handleHome = useCallback\(\(\) => \{\s*exitRouteActivity\(\);\s*onHome\(\);\s*\}, \[exitRouteActivity, onHome\]\)/,
    );
    assert.match(app, /onClick=\{handleBack\}/);
    assert.match(app, /onClick=\{handleHome\}/);
  });

  it("registers the distinct route-exit barrier and invalidates during layout cleanup", () => {
    assert.match(app, /const registerLessonRouteExitBarrier = useContext\(/);
    assert.match(
      app,
      /useLayoutEffect\(\(\) => \{\s*const unregister = registerLessonRouteExitBarrier\(exitRouteActivity\);\s*return \(\) => \{\s*exitRouteActivity\(\);\s*unregister\(\);\s*\};\s*\}, \[exitRouteActivity, registerLessonRouteExitBarrier\]\)/,
    );
    assert.match(
      app,
      /routedSceneRef\.current = routedSceneIndex;\s*invalidateRouteActivity\(\)/,
    );
    assert.match(
      app,
      /if \(targetSceneIndex !== null\) \{\s*invalidateRouteActivity\(\)/,
    );
  });

  it("routes every potentially scene-crossing completion through dispatchLessonEvent", () => {
    assert.match(app, /onCompleted: \(\) =>[\s\S]*?dispatchLessonEvent\(completionEvent\)/);
    assert.match(app, /dispatchLessonEvent\(\{ type \}, \{ cancel: true \}\)/);
    assert.match(app, /dispatchSceneControl\("REPLAY_LESSON"\)/);
    assert.match(app, /dispatchSceneControl\("SCENE_PREVIOUS"\)/);
    assert.match(app, /dispatchSceneControl\("SCENE_NEXT"\)/);
    assert.doesNotMatch(app, /dispatch\(completionEvent\)/);
  });

  it("requires the current route generation for asynchronous playback and speech outcomes", () => {
    assert.match(app, /const routeGeneration = routeActivityGuardRef\.current\.capture\(\)/);
    assert.match(
      app,
      /onCompleted: \(\) => \{\s*if \(!routeActivityGuardRef\.current\.isCurrent\(routeGeneration\)\) return;\s*dispatchLessonEvent\(completionEvent\);\s*\}/,
    );
    assert.match(
      app,
      /onFailed: \(caughtError\) => \{\s*if \(!routeActivityGuardRef\.current\.isCurrent\(routeGeneration\)\) return;/,
    );
    assert.match(
      app,
      /const session = await startSpeechRecording[\s\S]*?if \(\s*!routeActivityGuardRef\.current\.isCurrent\(routeGeneration\) \|\|/,
    );
    assert.match(
      app,
      /onEvaluated: \(result\) => \{\s*if \(!routeActivityGuardRef\.current\.isCurrent\(routeGeneration\)\) return;/,
    );
    assert.match(
      app,
      /onFailed: \(caughtError\) => \{\s*if \(!routeActivityGuardRef\.current\.isCurrent\(routeGeneration\)\) return;[\s\S]*?Speech check failed/,
    );
  });

  it("renders distinct lesson-list and main-menu navigation controls", () => {
    assert.match(app, /aria-label="Back to lesson list"/);
    assert.match(
      app,
      /aria-label="Back to main menu"[\s\S]*?className="lesson-home-button app-header-control app-header-control--secondary app-header-control--surface"[\s\S]*?onClick=\{handleHome\}/,
    );
    assert.match(styles, /button:focus-visible/);
  });
});
