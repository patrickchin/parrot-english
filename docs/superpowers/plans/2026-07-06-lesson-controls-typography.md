# Lesson Controls and Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the nearly full-width lesson dock with a narrower center dock flanked by separate pink chevron buttons, and normalize lesson-screen text sizes.

**Architecture:** Keep the controls inside one semantic `nav`, but make previous, center action dock, and next three sibling grid items. Preserve the current playback, recording, and navigation handlers while changing only JSX grouping and CSS layout/type rules. Extend the source-contract layout tests before each production change.

**Tech Stack:** React 19, TypeScript, CSS, Lucide React, Node test runner, Vite

---

### Task 1: Separate Scene Navigation From the Action Dock

**Files:**
- Modify: `tests/stage-layout.test.mjs:1-145`
- Modify: `src/App.tsx:509-584`
- Modify: `src/styles.css:769-836`

- [ ] **Step 1: Write the failing control-structure test**

Add the app source fixture beside the existing CSS fixture and add this test to
`catalog-driven stage layout`:

```js
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

// In "reserves a safe area for the lesson control dock", replace the old
// position assertions with the new outer control group contract.
const controls = getRule(".scene-controls");
const dock = getRule(".scene-control-dock");
assert.match(controls, /position:\s*absolute/);
assert.match(controls, /grid-template-columns:/);
assert.match(dock, /background:\s*rgb\(23 60 103/);

it("keeps pink chevron navigation outside the center action dock", () => {
  const controls = app.match(
    /<nav aria-label="Lesson controls" className="scene-controls">[\s\S]*?<\/nav>/,
  );
  const navigationButton = getRule(".scene-control-button");
  const controlGroup = getRule(".scene-controls");
  const dock = getRule(".scene-control-dock");

  assert.ok(controls, "Expected the lesson controls nav");
  assert.match(
    controls[0],
    /aria-label="Previous scene"[\s\S]*<ChevronLeft[\s\S]*<div className="scene-control-dock">[\s\S]*aria-label=\{playbackLabel\}[\s\S]*<\/div>\s*<button\s*aria-label="Next scene"[\s\S]*<ChevronRight/,
  );
  assert.match(controlGroup, /width:\s*min\(86vw,\s*1320px\)/);
  assert.match(controlGroup, /grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto/);
  assert.match(dock, /grid-template-columns:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(navigationButton, /background:\s*#ff467b/);
  assert.match(navigationButton, /color:\s*#fff/);
  assert.match(navigationButton, /border:\s*5px solid #fff/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/stage-layout.test.mjs
```

Expected: FAIL because `.scene-controls` and the nested center dock do not yet
exist and the navigation buttons are still white.

- [ ] **Step 3: Group the center controls without changing behavior**

Change the control JSX in `src/App.tsx` to this structure, leaving the existing
button handlers and learner prompt body unchanged:

```tsx
<nav aria-label="Lesson controls" className="scene-controls">
  <button
    aria-label="Previous scene"
    className="scene-control-button"
    disabled={atFirstScene}
    onClick={() => dispatchSceneControl("SCENE_PREVIOUS")}
    type="button"
  >
    <ChevronLeft aria-hidden="true" strokeWidth={3.2} />
  </button>

  <div className="scene-control-dock">
    <button
      aria-label={playbackLabel}
      className={`playback-control-button ${
        playbackIsActive ? "is-playing" : ""
      }`}
      onClick={handlePlaybackControl}
      type="button"
    >
      {state.phase === LessonPhase.Finished ? (
        <RotateCcw aria-hidden="true" strokeWidth={3} />
      ) : playbackIsActive ? (
        <Pause aria-hidden="true" strokeWidth={3} />
      ) : (
        <Play aria-hidden="true" strokeWidth={3} />
      )}
      <span>{playbackLabel}</span>
    </button>

    {showUserTurn ? (
      <div
        aria-live="assertive"
        className={`learner-mic-prompt ${
          isRecording ? "is-recording" : isEvaluating ? "is-evaluating" : ""
        }`}
        role="status"
      >
        <strong>{currentStep.dialogue}</strong>
        {isEvaluating ? (
          <span className="checking-label">Checking your speech...</span>
        ) : (
          <button
            aria-label={
              isRecording ? "Release when you finish" : "Press and hold to speak"
            }
            className={`hold-to-talk-button ${isRecording ? "is-recording" : ""}`}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onPointerCancel={cancelRecording}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            type="button"
          >
            <Mic aria-hidden="true" strokeWidth={3.6} />
            <span>
              {isRecording ? "Release when you finish" : "Press and hold to speak"}
            </span>
          </button>
        )}
      </div>
    ) : (
      <span className="dock-status">{progressLabel}</span>
    )}
  </div>

  <button
    aria-label="Next scene"
    className="scene-control-button"
    disabled={atFinalScene}
    onClick={() => dispatchSceneControl("SCENE_NEXT")}
    type="button"
  >
    <ChevronRight aria-hidden="true" strokeWidth={3.2} />
  </button>
</nav>
```

- [ ] **Step 4: Implement the desktop control layout**

Replace the existing dock positioning and button color rules in
`src/styles.css` with:

```css
.scene-controls {
  position: absolute;
  bottom: clamp(12px, 2vh, 24px);
  left: 50%;
  z-index: 24;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  width: min(86vw, 1320px);
  align-items: center;
  gap: clamp(10px, 1.2vw, 18px);
  transform: translateX(-50%);
}

.scene-control-dock {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  min-height: 86px;
  align-items: center;
  gap: clamp(8px, 1vw, 16px);
  border: 5px solid #fff;
  border-radius: 999px;
  background: rgb(23 60 103 / 96%);
  padding: clamp(8px, 1.2vw, 14px);
  box-shadow: 0 8px 0 rgb(12 38 68 / 38%), 0 18px 42px rgb(26 86 126 / 28%);
}

.scene-control-button {
  width: 64px;
  min-width: 64px;
  min-height: 64px;
  aspect-ratio: 1;
  border: 5px solid #fff;
  background: #ff467b;
  color: #fff;
  box-shadow: 0 6px 0 rgb(171 38 83 / 42%);
}
```

Keep the existing Lucide SVG sizing, focus styles, disabled state, and playback
button styles.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
node --test tests/stage-layout.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the control separation**

```bash
git add src/App.tsx src/styles.css tests/stage-layout.test.mjs
git commit -m "style: separate lesson navigation controls"
```

### Task 2: Normalize the Lesson Typography

**Files:**
- Modify: `tests/stage-layout.test.mjs`
- Modify: `src/styles.css:240-257, 522-589, 673-925, 1049-1052`

- [ ] **Step 1: Write the failing typography test**

Add this test to `catalog-driven stage layout`:

```js
it("uses an explicit lesson-screen type hierarchy", () => {
  assert.match(getRule(".user-session-bar > span:first-child"), /font-size:\s*0\.95rem/);
  assert.match(getRule(".user-session-bar button"), /font-size:\s*0\.875rem/);
  assert.match(getRule(".scene-title"), /font-size:\s*clamp\(1\.05rem,\s*1\.55vw,\s*1\.5rem\)/);
  assert.match(getRule(".lesson-list-back-button"), /font-size:\s*clamp\(1rem,\s*1\.25vw,\s*1\.2rem\)/);
  assert.match(getRule(".character-name"), /font-size:\s*clamp\(0\.9rem,\s*1vw,\s*1\.05rem\)/);
  assert.match(
    styles,
    /\.speech-bubble > span,\s*\.narrator-caption > span\s*\{[^}]*font-size:\s*clamp\(0\.875rem,\s*1vw,\s*1rem\)/s,
  );
  assert.match(
    styles,
    /\.speech-bubble p,\s*\.narrator-caption p\s*\{[^}]*font-size:\s*clamp\(1\.5rem,\s*2\.5vw,\s*2\.625rem\)/s,
  );
  assert.match(getRule(".playback-control-button"), /font-size:\s*clamp\(1rem,\s*1\.3vw,\s*1\.2rem\)/);
  assert.match(getRule(".dock-status"), /font-size:\s*clamp\(1rem,\s*1\.3vw,\s*1\.2rem\)/);
  assert.match(getRule(".learner-mic-prompt > strong"), /font-size:\s*clamp\(1\.15rem,\s*1\.7vw,\s*1\.5rem\)/);
  assert.match(getRule(".hold-to-talk-button"), /font-size:\s*clamp\(0\.95rem,\s*1\.3vw,\s*1\.15rem\)/);
  assert.match(getRule(".checking-label"), /font-size:\s*clamp\(0\.9rem,\s*1\.2vw,\s*1\.05rem\)/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `node --test tests/stage-layout.test.mjs`.

Expected: FAIL on the first old font-size declaration.

- [ ] **Step 3: Apply the approved type sizes**

Set these declarations in `src/styles.css`:

```css
.user-session-bar > span:first-child { font-size: 0.95rem; }
.user-session-bar button { font-size: 0.875rem; }
.scene-title { font-size: clamp(1.05rem, 1.55vw, 1.5rem); }
.lesson-list-back-button { font-size: clamp(1rem, 1.25vw, 1.2rem); }
.character-name { font-size: clamp(0.9rem, 1vw, 1.05rem); }
.speech-bubble > span,
.narrator-caption > span { font-size: clamp(0.875rem, 1vw, 1rem); }
.speech-bubble p,
.narrator-caption p { font-size: clamp(1.5rem, 2.5vw, 2.625rem); }
.playback-control-button,
.dock-status { font-size: clamp(1rem, 1.3vw, 1.2rem); }
.learner-mic-prompt > strong { font-size: clamp(1.15rem, 1.7vw, 1.5rem); }
.hold-to-talk-button { font-size: clamp(0.95rem, 1.3vw, 1.15rem); }
.checking-label { font-size: clamp(0.9rem, 1.2vw, 1.05rem); }
```

Update the narrow-screen dialogue override to
`clamp(1.5rem, 5vw, 1.8rem)` so it remains within the approved hierarchy.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run `node --test tests/stage-layout.test.mjs`.

Expected: PASS.

- [ ] **Step 5: Commit the typography pass**

```bash
git add src/styles.css tests/stage-layout.test.mjs
git commit -m "style: normalize lesson typography"
```

### Task 3: Preserve Responsive Controls

**Files:**
- Modify: `tests/stage-layout.test.mjs:60-144`
- Modify: `src/styles.css:1000-1260`

- [ ] **Step 1: Update responsive tests for separated navigation**

Replace the old dock expectations with:

```js
assert.match(
  compactStyles,
  /\.scene-controls\s*\{[^}]*width:\s*calc\(100vw - 20px\)[^}]*grid-template-columns:\s*52px minmax\(0,\s*1fr\) 52px/,
);
assert.match(
  compactStyles,
  /\.scene-control-dock\s*\{[^}]*grid-template-areas:\s*"prompt"\s*"playback"[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
);
assert.match(
  compactStyles,
  /\.scene-control-button\s*\{[^}]*width:\s*52px[^}]*min-width:\s*52px[^}]*min-height:\s*52px/,
);
assert.match(
  shortStyles,
  /\.scene-controls\s*\{[^}]*bottom:\s*6px[^}]*grid-template-columns:\s*44px minmax\(0,\s*1fr\) 44px/,
);
assert.match(
  combinedStyles,
  /\.scene-control-dock\s*\{[^}]*grid-template-areas:\s*"playback prompt"[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\)/,
);
```

Retain the safe-area, character position, learner prompt, and 44-pixel target
assertions.

- [ ] **Step 2: Run the focused test and verify RED**

Run `node --test tests/stage-layout.test.mjs`.

Expected: FAIL because the responsive CSS still assigns back/next grid areas
inside the blue dock.

- [ ] **Step 3: Implement narrow and short layout rules**

Use these responsive structures:

```css
@media (max-width: 720px) {
  .scene-controls {
    width: calc(100vw - 20px);
    grid-template-columns: 52px minmax(0, 1fr) 52px;
    gap: 8px;
  }

  .scene-control-dock {
    grid-template-areas:
      "prompt"
      "playback";
    grid-template-columns: minmax(0, 1fr);
    border-radius: 28px;
    padding: 10px;
  }

  .scene-control-button {
    width: 52px;
    min-width: 52px;
    min-height: 52px;
  }

  .playback-control-button { grid-area: playback; justify-self: center; }
  .learner-mic-prompt,
  .dock-status { grid-area: prompt; }
}

@media (max-height: 620px) {
  .scene-controls {
    bottom: 6px;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    gap: 6px;
  }
}

@media (max-width: 720px) and (max-height: 620px) {
  .scene-control-dock {
    grid-template-areas: "playback prompt";
    grid-template-columns: auto minmax(0, 1fr);
    border-radius: 999px;
  }
}
```

Move short-screen positioning from `.scene-control-dock` to `.scene-controls`,
keep dock border/padding compaction on `.scene-control-dock`, and remove obsolete
first/last-child grid-area rules.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run `node --test tests/stage-layout.test.mjs`.

Expected: PASS.

- [ ] **Step 5: Commit responsive behavior**

```bash
git add src/styles.css tests/stage-layout.test.mjs
git commit -m "fix: preserve responsive lesson controls"
```

### Task 4: Verify and Publish

**Files:**
- Verify: `src/App.tsx`
- Verify: `src/styles.css`
- Verify: `tests/stage-layout.test.mjs`

- [ ] **Step 1: Run automated verification**

```bash
node --test tests/stage-layout.test.mjs
npm test
npm run lint
npm run build
git diff --check origin/main...HEAD
```

Expected: all tests pass, lint and build exit zero, and `git diff --check`
prints no errors.

- [ ] **Step 2: Inspect the lesson in the browser**

Run the local app and verify these viewport families in the in-app browser:

- screenshot-like desktop: 2010×1248;
- narrow: 390×844; and
- short landscape: 844×390.

Confirm the pink chevron buttons are outside the blue dock, the dock is visibly
narrower on desktop, dialogue remains the largest text, no label clips, and
controls remain reachable.

- [ ] **Step 3: Review final repository state**

```bash
git status --short
git log --oneline origin/main..HEAD
```

Expected: only the intentionally ignored `.superpowers/` brainstorming artifact
may remain untracked; implementation and documentation commits are present.

- [ ] **Step 4: Push and open the pull request**

```bash
git push -u origin codex/action-bar-typography
```

Open a non-draft pull request with base `main`, title
`Polish lesson controls and typography`, and a body summarizing the separated
pink navigation controls, narrower action dock, responsive behavior, typography
normalization, and verification commands.
