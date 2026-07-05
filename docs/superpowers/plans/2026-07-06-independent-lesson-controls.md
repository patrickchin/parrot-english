# Independent Lesson Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the visible lesson action-bar container, render every bottom action or status as an independent pill, standardize lesson pill geometry and normal UI type, and move Back left while centering the title cluster.

**Architecture:** Preserve `LessonPlayer` state and handlers while changing only the lesson-control JSX boundaries and lesson CSS. Keep one invisible semantic `nav` as a responsive flex layout; its children own every visible surface. Define shared lesson UI custom properties in `:root`, then use them across the header, character labels, session controls, and bottom pills.

**Tech Stack:** React 19, TypeScript, CSS custom properties, Lucide React, Node test runner, Vite

---

## File Map

- `src/App.tsx`: moves the build badge beside Back and flattens bottom controls into independent siblings.
- `src/styles.css`: defines shared lesson pill/type tokens, repositions the header, styles independent controls, and supplies narrow/short responsive layouts.
- `tests/lesson-controls-ui.test.mjs`: protects control semantics, event behavior, and the absence of the old dock/prompt wrappers.
- `tests/stage-layout.test.mjs`: protects header positioning, shared tokens, independent surfaces, and responsive touch targets.

### Task 1: Flatten the Lesson Controls

**Files:**
- Modify: `tests/lesson-controls-ui.test.mjs`
- Modify: `src/App.tsx:509-584`

- [ ] **Step 1: Write the failing independent-control tests**

Replace the old “one action dock” structural assertion with:

```js
it("renders every lesson action as an independent control", () => {
  const controls = app.match(
    /<nav[\s\S]*?className="scene-controls"[\s\S]*?<\/nav>/g,
  ) ?? [];

  assert.equal(controls.length, 1);
  assert.match(controls[0], /aria-label="Previous scene"/);
  assert.match(controls[0], /aria-label=\{playbackLabel\}/);
  assert.match(controls[0], /className="learner-target-pill"/);
  assert.match(controls[0], /className="dock-status"/);
  assert.match(controls[0], /className=\{`hold-to-talk-button/);
  assert.match(controls[0], /className="checking-label"/);
  assert.match(controls[0], /aria-label="Next scene"/);
  assert.doesNotMatch(controls[0], /scene-control-dock|learner-mic-prompt/);
});
```

Update “uses only the dock prompt for user speech” to assert
`learner-target-pill` exists and both `learner-mic-prompt` and
`user-turn-panel` are absent.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/lesson-controls-ui.test.mjs
```

Expected: FAIL because `scene-control-dock` and `learner-mic-prompt` still wrap
the controls and `learner-target-pill` does not exist.

- [ ] **Step 3: Replace the lesson-control JSX with independent siblings**

Keep the existing button props and handlers, but replace the current `nav` with:

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
    <>
      <strong
        aria-live="assertive"
        className="learner-target-pill"
        role="status"
      >
        {currentStep.dialogue}
      </strong>
      {isEvaluating ? (
        <span aria-live="assertive" className="checking-label" role="status">
          Checking your speech...
        </span>
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
    </>
  ) : (
    <span className="dock-status">{progressLabel}</span>
  )}

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

- [ ] **Step 4: Run the focused test and verify GREEN**

Run `node --test tests/lesson-controls-ui.test.mjs`.

Expected: PASS with the playback, recording, live-region, and navigation
contracts unchanged.

- [ ] **Step 5: Commit the structural change**

```bash
git add src/App.tsx tests/lesson-controls-ui.test.mjs
git commit -m "refactor: separate lesson action controls"
```

### Task 2: Reposition the Header and Standardize Pills

**Files:**
- Modify: `tests/stage-layout.test.mjs`
- Modify: `src/App.tsx:410-447`
- Modify: `src/styles.css:1-15,662-708,921-1150,1180-1350`

- [ ] **Step 1: Write failing header and token tests**

Replace the old action-dock assertions with tests using `getRule()`:

```js
it("uses an invisible control layout with independent pill surfaces", () => {
  const controls = getRule(".scene-controls");
  const independentPills = getRule(
    ".scene-control-button,\n.playback-control-button,\n.dock-status,\n.learner-target-pill,\n.hold-to-talk-button,\n.checking-label",
  );

  assert.match(controls, /display:\s*flex/);
  assert.match(controls, /flex-wrap:\s*wrap/);
  assert.doesNotMatch(controls, /background:|border:|box-shadow:/);
  assert.match(independentPills, /min-height:\s*var\(--lesson-pill-height\)/);
  assert.doesNotMatch(styles, /\.scene-control-dock\s*\{/);
});

it("anchors Back left and centers the title cluster", () => {
  assert.match(getRule(".lesson-list-back-button"), /left:\s*var\(--lesson-edge-gap\)/);
  assert.doesNotMatch(getRule(".lesson-list-back-button"), /translateX/);
  assert.match(getRule(".scene-hud"), /left:\s*50%/);
  assert.match(getRule(".scene-hud"), /transform:\s*translateX\(-50%\)/);
  assert.match(getRule(".build-version-badge"), /position:\s*absolute/);
});

it("shares one normal type size and pill geometry", () => {
  const root = getRule(":root");
  assert.match(root, /--lesson-ui-font-size:\s*clamp\(1rem,\s*1\.3vw,\s*1\.2rem\)/);
  assert.match(root, /--lesson-pill-height:\s*64px/);
  assert.match(root, /--lesson-pill-border:\s*4px solid #fff/);
  assert.match(root, /--lesson-pill-radius:\s*999px/);
  assert.match(getRule(".character-name"), /font-size:\s*var\(--lesson-ui-font-size\)/);
  assert.match(getRule(".scene-title"), /font-size:\s*var\(--lesson-ui-font-size\)/);
  assert.match(getRule(".lesson-list-back-button"), /font-size:\s*var\(--lesson-ui-font-size\)/);
});
```

- [ ] **Step 2: Run the layout test and verify RED**

Run `node --test tests/stage-layout.test.mjs`.

Expected: FAIL because the shared custom properties do not exist, Back is
centered, the title cluster is left, and the blue dock is still styled.

- [ ] **Step 3: Move the build badge out of the centered title cluster**

In `src/App.tsx`, leave the title card and progress dots inside `.scene-hud`.
Move the unchanged `.build-version-badge` span to immediately after the Back
button. This lets the title cluster center independently while the build badge
anchors beneath Back.

- [ ] **Step 4: Define the shared lesson UI tokens**

Add these properties to `:root`:

```css
--lesson-ui-font-size: clamp(1rem, 1.3vw, 1.2rem);
--lesson-pill-height: 64px;
--lesson-pill-padding: 20px;
--lesson-pill-border: 4px solid #fff;
--lesson-pill-radius: 999px;
--lesson-pill-shadow-depth: 5px;
--lesson-edge-gap: clamp(14px, 2vw, 30px);
```

- [ ] **Step 5: Implement the centered header and standardized pills**

Replace one-off header and control values with the shared variables. The key
layout and common surface rules are:

```css
.scene-hud {
  position: absolute;
  top: clamp(14px, 2.2vh, 28px);
  left: 50%;
  z-index: 20;
  display: grid;
  justify-items: center;
  gap: 10px;
  transform: translateX(-50%);
}

.lesson-list-back-button {
  left: var(--lesson-edge-gap);
  min-height: var(--lesson-pill-height);
  border: var(--lesson-pill-border);
  border-radius: var(--lesson-pill-radius);
  padding: 0 var(--lesson-pill-padding) 0 12px;
  font-size: var(--lesson-ui-font-size);
  transform: none;
}

.lesson-list-back-button:hover {
  filter: brightness(1.08);
  transform: translateY(-2px);
}

.build-version-badge {
  position: absolute;
  top: calc(clamp(14px, 2.2vh, 28px) + var(--lesson-pill-height) + 10px);
  left: var(--lesson-edge-gap);
  z-index: 20;
}

.scene-controls {
  position: absolute;
  bottom: clamp(12px, 2vh, 24px);
  left: 50%;
  z-index: 24;
  display: flex;
  width: min(calc(100vw - 24px), 1160px);
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: clamp(8px, 1vw, 14px);
  transform: translateX(-50%);
}

.scene-control-button,
.playback-control-button,
.dock-status,
.learner-target-pill,
.hold-to-talk-button,
.checking-label {
  min-height: var(--lesson-pill-height);
  border: var(--lesson-pill-border);
  border-radius: var(--lesson-pill-radius);
  padding: 0 var(--lesson-pill-padding);
  font-size: var(--lesson-ui-font-size);
  font-weight: 950;
  line-height: 1;
}
```

Keep semantic colors: pink navigation, yellow playback, blue status/checking,
white learner phrase, and green microphone with pink recording state. Give each
surface its own tactile shadow. Set `.learner-target-pill` to a bounded width,
centered text, and ellipsis on a single line. Apply
`font-size: var(--lesson-ui-font-size)` to `.character-name`, `.scene-title`,
`.user-session-bar > span:first-child`, and `.user-session-bar button`.

- [ ] **Step 6: Run both focused tests and verify GREEN**

Run:

```bash
node --test tests/lesson-controls-ui.test.mjs tests/stage-layout.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit the header and pill system**

```bash
git add src/App.tsx src/styles.css tests/stage-layout.test.mjs
git commit -m "style: standardize lesson pills and header"
```

### Task 3: Preserve Independent Controls Responsively

**Files:**
- Modify: `tests/stage-layout.test.mjs`
- Modify: `src/styles.css:1435-1675`

- [ ] **Step 1: Write failing responsive tests**

Replace dock-specific compact assertions with:

```js
assert.match(compactStyles, /:root\s*\{[^}]*--lesson-pill-height:\s*52px/);
assert.match(compactStyles, /\.scene-controls\s*\{[^}]*width:\s*calc\(100vw - 20px\)/);
assert.doesNotMatch(compactStyles, /scene-control-dock|learner-mic-prompt/);
assert.match(compactStyles, /\.lesson-list-back-button > span\s*\{[^}]*display:\s*none/);

assert.match(shortStyles, /:root\s*\{[^}]*--lesson-pill-height:\s*44px/);
assert.match(shortStyles, /\.scene-controls\s*\{[^}]*bottom:\s*6px/);
assert.match(shortStyles, /\.hold-to-talk-button > span\s*\{[^}]*display:\s*none/);
assert.doesNotMatch(shortStyles, /scene-control-dock|learner-mic-prompt/);
```

- [ ] **Step 2: Run the layout test and verify RED**

Run `node --test tests/stage-layout.test.mjs`.

Expected: FAIL because the current media queries still style the removed dock
and prompt wrapper and do not override the shared height token.

- [ ] **Step 3: Replace responsive dock rules with token overrides**

At `max-width: 720px`, set `--lesson-pill-height: 52px`, keep the title visible,
hide only the Back text label, use a circular Back button, allow the independent
controls to wrap, and let the learner phrase consume a full centered row when
needed. Increase the stage control safe area enough for two rows.

At `max-height: 620px`, set `--lesson-pill-height: 44px`, compact padding and
gaps, keep one-line ellipsis on status/phrase pills, and hide only the microphone
button text. Remove every `.scene-control-dock` and `.learner-mic-prompt` media
rule.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
node --test tests/lesson-controls-ui.test.mjs tests/stage-layout.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit responsive behavior**

```bash
git add src/styles.css tests/stage-layout.test.mjs
git commit -m "style: keep lesson pills responsive"
```

### Task 4: Verify the Complete Lesson Screen

**Files:**
- Verify: `src/App.tsx`
- Verify: `src/styles.css`
- Verify: `tests/lesson-controls-ui.test.mjs`
- Verify: `tests/stage-layout.test.mjs`

- [ ] **Step 1: Run the full test suite**

Run `npm test`.

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run lint**

Run `npm run lint`.

Expected: exit 0; existing generated-file warnings are acceptable if unchanged.

- [ ] **Step 3: Run the production build**

Run `npm run build`.

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 4: Inspect the real component in the in-app browser**

At desktop, narrow mobile, and short landscape sizes, verify:

- no visible shared action bar exists;
- every bottom item has its own pill surface;
- Back stays top-left and the title cluster is centered;
- all normal pill labels and character names use one visual size;
- mobile wrapping does not overlap characters or speech; and
- learner target, mic, recording, and checking states remain independently
  readable and operable.

- [ ] **Step 5: Check the final diff**

Run:

```bash
git diff --check origin/main...HEAD
git status --short --branch
```

Expected: no whitespace errors; only the approved design, plan, implementation,
and test files are committed. The pre-existing untracked `.superpowers/`
directory remains untouched.
