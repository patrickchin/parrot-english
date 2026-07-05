# Lesson Start Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the small bottom playback entry with one large centered Start/Replay action, defer microphone permission until press-and-hold recording, and remove persistent playback and volume controls.

**Architecture:** Keep the existing React reducer and lesson phases. Dispatch `PLAY_SCENE` or `REPLAY_LESSON` from a stage-centered action, let `startSpeechRecording` continue to request microphone access only from the learner's press-and-hold action, and keep previous/next navigation in the bottom dock. Remove the rendered Play/Pause and volume controls plus their component state and CSS; automatic lesson audio remains unchanged.

**Tech Stack:** React 19, TypeScript, CSS, Node.js test runner, Vite

---

### Task 1: Specify the current lesson entry behavior

**Files:**
- Modify: `tests/lesson-controls-ui.test.mjs`
- Modify: `tests/stage-layout.test.mjs`

- [ ] **Step 1: Require a standalone Start/Replay action and no persistent media controls**

Update the first lesson-controls test so the bottom dock requires previous/next,
status, and learner actions but explicitly excludes playback. Add this adjacent
test:

```js
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
  assert.doesNotMatch(app, /playback-control-button|playbackLabel|Volume2|VolumeX|volume-button/);
  assert.doesNotMatch(app, /const \[muted, setMuted\]/);
  assert.doesNotMatch(styles, /\.playback-control-button|\.volume-button/);
});
```

- [ ] **Step 2: Require centered, touch-sized overlay styling**

Add this test to `tests/stage-layout.test.mjs`:

```js
it("centers a large touch target for starting and replaying lessons", () => {
  const startLayer = getRule(".lesson-start-layer");
  const startButton = getRule(".start-lesson-button");

  assert.match(startLayer, /position:\s*absolute/);
  assert.match(startLayer, /inset:\s*0/);
  assert.match(startLayer, /place-items:\s*center/);
  assert.match(startLayer, /pointer-events:\s*none/);
  assert.match(startButton, /width:\s*min\(/);
  assert.match(startButton, /min-height:\s*clamp\(/);
  assert.match(startButton, /pointer-events:\s*auto/);
});
```

Update existing control-selector and responsive-grid assertions to omit
`.playback-control-button` and the `playback` grid area.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
node --test tests/lesson-controls-ui.test.mjs tests/stage-layout.test.mjs
```

Expected: FAIL because the bottom Play/Pause and top-right volume controls still
exist and the centered Start/Replay layer has not been implemented.

- [ ] **Step 4: Commit the failing test specification**

```bash
git add tests/lesson-controls-ui.test.mjs tests/stage-layout.test.mjs
git commit -m "test: specify prominent lesson start action"
```

### Task 2: Implement the centered Start/Replay action

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `tests/lesson-controls-ui.test.mjs`
- Test: `tests/stage-layout.test.mjs`
- Test: `tests/microphone-prompt-ui.test.mjs`

- [ ] **Step 1: Add the dedicated idle/finished action**

In `src/App.tsx`, keep only the lesson icons still rendered:

```tsx
import { ChevronLeft, ChevronRight, Mic } from "lucide-react";
```

Remove the `muted` state, muted playback timeout, and `muted` effect dependency.
Remove `handlePlaybackControl`, `playbackIsActive`, and `playbackLabel`. Add:

```tsx
function handleStartAction() {
  dispatchSceneControl(
    state.phase === LessonPhase.Finished ? "REPLAY_LESSON" : "PLAY_SCENE",
  );
}

const showStartAction =
  state.phase === LessonPhase.Idle ||
  state.phase === LessonPhase.Finished;
const startActionLabel =
  state.phase === LessonPhase.Finished ? "Replay lesson" : "Start lesson";
```

Render this outside the bottom controls:

```tsx
{showStartAction ? (
  <div className="lesson-start-layer">
    <button
      aria-label={startActionLabel}
      className="start-lesson-button"
      onClick={handleStartAction}
      type="button"
    >
      <span>{startActionLabel}</span>
    </button>
  </div>
) : null}
```

Delete the volume button block and the playback button inside
`scene-controls`. Keep the press-and-hold microphone and previous/next controls
unchanged.

- [ ] **Step 2: Center and enlarge the primary action, then clean obsolete control CSS**

Add:

```css
.lesson-start-layer {
  position: absolute;
  inset: 0;
  z-index: 23;
  display: grid;
  place-items: center;
  padding: var(--lesson-edge-gap);
  pointer-events: none;
}

.start-lesson-button {
  width: min(72vw, 620px);
  min-height: clamp(108px, 18vh, 176px);
  border: 6px solid #fff;
  border-radius: 999px;
  background: #ff467b;
  color: #fff;
  padding: 18px 34px;
  pointer-events: auto;
  cursor: pointer;
  font-size: clamp(2rem, 5vw, 4.4rem);
  font-weight: 950;
  line-height: 1;
  box-shadow: 0 10px 0 rgb(171 38 83 / 42%), 0 24px 48px rgb(31 94 132 / 28%);
}
```

Add hover and focus-visible states consistent with other lesson actions. Remove
all `.volume-button` and `.playback-control-button` rules. Remove playback from
shared pill selectors and change the compact grid to:

```css
grid-template-areas:
  "prompt prompt prompt"
  "previous microphone next";
grid-template-columns: var(--lesson-pill-height) auto var(--lesson-pill-height);
```

Remove `.start-lesson-button` from the obsolete combined mobile selector so it
cannot shrink the new centered action. Leave the unrelated responsive session
layout rules unchanged.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run:

```bash
node --test tests/lesson-controls-ui.test.mjs tests/stage-layout.test.mjs tests/microphone-prompt-ui.test.mjs
```

Expected: all selected UI tests PASS.

- [ ] **Step 4: Run adjacent UI and lesson tests**

Run:

```bash
node --test tests/lesson-state.test.mjs tests/lesson-audio.test.mjs tests/speech-recorder.test.mjs tests/playback-operation.test.mjs
```

Expected: all selected tests PASS.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/App.tsx src/styles.css
git commit -m "feat: add prominent lesson start action"
```

### Task 3: Verify the integrated experience

**Files:**
- Verify: `src/App.tsx`
- Verify: `src/styles.css`
- Verify: `tests/lesson-controls-ui.test.mjs`
- Verify: `tests/stage-layout.test.mjs`

- [ ] **Step 1: Run the complete automated verification suite**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: every command exits with status 0 and no new warnings.

- [ ] **Step 2: Inspect the idle state in a browser**

Run the Vite development server, open the lesson at desktop and narrow mobile
viewport widths, and verify:

- one large Start button is centered over the stage;
- no bottom Play/Pause control or top-right volume control is visible;
- clicking Start begins the first example immediately;
- no microphone permission prompt appears on Start; and
- the Start button disappears after entry.

- [ ] **Step 3: Inspect the speaking transition**

Continue until the first user step. Verify that the existing press-and-hold
microphone action appears and that microphone permission, if not already granted
or denied, is requested when that action is pressed rather than on Start.

- [ ] **Step 4: Review the final branch diff**

```bash
git diff --check main...HEAD
git diff --stat main...HEAD
git status --short
```

Expected: the branch contains only the worktree ignore, design, plan, focused
tests, React, and CSS changes; unrelated pre-existing files remain uncommitted.
