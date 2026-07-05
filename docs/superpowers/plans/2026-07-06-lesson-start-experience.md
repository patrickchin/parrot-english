# Lesson Start Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the preflight lesson entry flow with one large centered Start action, defer microphone permission until recording, and remove the persistent audio control.

**Architecture:** Keep the existing React reducer and lesson phases. Make the Start handler synchronously dispatch `START`, let `recordSpeechClip` continue to own microphone access in the listening phase, and use the existing `lesson-flow-banner has-action` state as a full-stage centering layer. Remove only the persistent volume state and control; automatic lesson audio remains unchanged.

**Tech Stack:** React 19, TypeScript, CSS, Node.js test runner, Vite

---

### Task 1: Specify the new entry behavior

**Files:**
- Modify: `tests/microphone-prompt-ui.test.mjs`

- [ ] **Step 1: Replace the preflight-permission expectation and add entry UI assertions**

Replace the existing `requests microphone permission before the lesson starts`
test and add the two adjacent tests below inside the existing `describe` block:

```js
it("starts immediately without preflight microphone permission", () => {
  const startLesson = app.match(/\n  function startLesson\(\) \{([\s\S]*?)\n  \}/);

  assert.ok(startLesson, "Expected startLesson to be synchronous");
  assert.doesNotMatch(app, /requestMicrophoneAccess/);
  assert.match(
    startLesson[1],
    /setError\(""\);[\s\S]*dispatch\(\{ type: "START" \}\);/
  );
  assert.doesNotMatch(startLesson[1], /await|isPreparingMicrophone/);
});

it("centers a large primary action over the idle and finished scene", () => {
  const actionLayerRule = getRule(".lesson-flow-banner.has-action");
  const primaryActionRule = getRule(
    ".lesson-flow-banner.has-action .start-lesson-button"
  );

  assert.match(actionLayerRule, /inset:\s*0/);
  assert.match(actionLayerRule, /width:\s*100%/);
  assert.match(actionLayerRule, /min-height:\s*100%/);
  assert.match(actionLayerRule, /transform:\s*none/);
  assert.match(actionLayerRule, /pointer-events:\s*none/);
  assert.match(primaryActionRule, /width:\s*min\(/);
  assert.match(primaryActionRule, /min-height:\s*clamp\(/);
  assert.match(primaryActionRule, /pointer-events:\s*auto/);
});

it("does not render a persistent lesson audio control", () => {
  assert.doesNotMatch(app, /Volume2|VolumeX|volume-button/);
  assert.doesNotMatch(app, /const \[muted, setMuted\]/);
  assert.doesNotMatch(styles, /\.volume-button/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/microphone-prompt-ui.test.mjs
```

Expected: FAIL because `startLesson` is asynchronous, the centered
`.lesson-flow-banner.has-action` rule does not exist, and the volume control is
still rendered.

- [ ] **Step 3: Commit the failing test specification**

```bash
git add tests/microphone-prompt-ui.test.mjs
git commit -m "test: specify lesson start experience"
```

### Task 2: Implement the immediate centered Start action

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `tests/microphone-prompt-ui.test.mjs`

- [ ] **Step 1: Simplify `LessonPlayer` entry and automatic audio behavior**

In `src/App.tsx`, keep only the icons still rendered:

```tsx
import { ChevronLeft, ChevronRight, Mic } from "lucide-react";
```

Remove `requestMicrophoneAccess` from the speech-recorder import, remove the
`isPreparingMicrophone` and `muted` state values, and remove the muted timeout
branch and `muted` dependency from the audio-sequencing effect. Replace the
Start handler and label with:

```tsx
function startLesson() {
  setError("");
  dispatch({ type: "START" });
}

const startButtonLabel =
  state.phase === LessonPhase.Finished ? "再来一次" : "开始";
```

Delete the complete `volume-button` JSX block. Keep the existing
`lesson-flow-banner` conditional so `has-action` is present only for idle and
finished states.

- [ ] **Step 2: Center and enlarge the primary action**

In `src/styles.css`, remove `.volume-button` from focus, shared control, SVG,
hover, and mobile rules. Add this rule directly after `.lesson-flow-banner`:

```css
.lesson-flow-banner.has-action {
  inset: 0;
  width: 100%;
  min-height: 100%;
  transform: none;
  pointer-events: none;
}
```

Add this rule after the base `.start-lesson-button` rule:

```css
.lesson-flow-banner.has-action .start-lesson-button {
  width: min(72vw, 620px);
  min-height: clamp(108px, 18vh, 176px);
  pointer-events: auto;
}
```

Remove `.start-lesson-button:disabled`, because Start no longer has an
asynchronous preparation state. Keep the existing responsive button font and
border rules; the more-specific `has-action` selector preserves the large
centered dimensions at every viewport size.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run:

```bash
node --test tests/microphone-prompt-ui.test.mjs
```

Expected: all microphone prompt UI tests PASS.

- [ ] **Step 4: Run adjacent UI and lesson tests**

Run:

```bash
node --test tests/stage-layout.test.mjs tests/lesson-state.test.mjs tests/lesson-audio.test.mjs tests/speech-recorder.test.mjs
```

Expected: all selected tests PASS.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/App.tsx src/styles.css
git commit -m "feat: simplify lesson start experience"
```

### Task 3: Verify the integrated experience

**Files:**
- Verify: `src/App.tsx`
- Verify: `src/styles.css`
- Verify: `tests/microphone-prompt-ui.test.mjs`

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
- no top-right audio control is visible;
- clicking Start begins the first example immediately;
- no microphone permission prompt appears on Start; and
- the progress banner replaces the Start button after entry.

- [ ] **Step 3: Inspect the speaking transition**

Continue until the first listening phase. Verify that the existing microphone
panel appears and that microphone permission, if not already granted or denied,
is requested at that point rather than on Start.

- [ ] **Step 4: Review the final branch diff**

```bash
git diff --check main...HEAD
git diff --stat main...HEAD
git status --short
```

Expected: the branch contains only the design, plan, focused test, React, and
CSS changes; unrelated pre-existing untracked files remain uncommitted.
