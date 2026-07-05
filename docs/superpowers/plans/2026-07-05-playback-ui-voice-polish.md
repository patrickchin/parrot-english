# Playback UI and Voice Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the learner avatar, restore scene-level playback/navigation controls in a non-occluding dock, repair translucent Peppa assets, and give Dolly and the narrator distinct British ElevenLabs voices.

**Architecture:** Extend the pure scene-script reducer with explicit scene controls while preserving automatic step progression. Keep `user` in validated lesson data but filter it from presentation, then replace the floating learner panel with a reserved bottom control dock. Repair the source sprite alpha and regenerate only Dolly/narrator MP3 cache entries with concrete speaker-specific voice defaults.

**Tech Stack:** React 19, TypeScript, Vite, Node test runner, CSS, JSON catalogs, ElevenLabs `eleven_v3`, WebP/MP3 assets

---

## File Structure

- `lib/lesson-state.js`: pure scene playback, pause, navigation, and replay transitions.
- `lib/lesson-progress.js`: concise idle, paused, playback, and learner status labels.
- `lib/lesson-scene.js`: presentation projection that excludes `user` from visible characters.
- `src/App.tsx`: cancellation coordination, scene controls, speech rendering, and hold-to-talk dock markup.
- `src/styles.css`: reserved dock safe area, control palette, responsive layout, and character baseline.
- `scripts/generate-static-audio.mjs`: concrete Dolly/narrator voice defaults and narrator delivery settings.
- `public/assets/characters/peppa/*.webp`: six repaired opaque-subject character assets.
- `public/assets/audio/*.mp3`: regenerated Dolly and narrator cache files only.
- `tests/lesson-state.test.mjs`: scene control reducer behavior.
- `tests/lesson-progress.test.mjs`: Play and paused-state labels.
- `tests/lesson-scene.test.mjs`: hidden learner presentation behavior.
- `tests/lesson-controls-ui.test.mjs`: scene controls, user prompt, and cancellation wiring contract.
- `tests/microphone-prompt-ui.test.mjs`: hold interaction and compact prompt contract.
- `tests/stage-layout.test.mjs`: dock safe area and responsive layout contract.
- `tests/generate-static-audio.test.mjs`: distinct non-Mandarin voice defaults and narrator settings.
- `tests/architecture-cleanup.test.mjs`: updated scene-script architecture expectations.
- `README.md`, `docs/design/audio-and-content-pipeline.md`, `docs/design/product-experience.md`, `docs/design/technical-architecture.md`: user-facing and architectural documentation.

### Task 1: Add Scene-Level Playback Transitions

**Files:**
- Modify: `tests/lesson-state.test.mjs`
- Modify: `tests/lesson-progress.test.mjs`
- Modify: `lib/lesson-state.js`
- Modify: `lib/lesson-progress.js`

- [ ] **Step 1: Rewrite the start helpers and add failing scene-control tests**

In `tests/lesson-state.test.mjs`, replace `START` with `PLAY_SCENE` in existing start paths:

```js
function startAtUser() {
  const started = reduce(createInitialLessonState(), { type: "PLAY_SCENE" });
  return reduce(started, { type: "LINE_DONE" });
}
```

Update the first two tests to dispatch `PLAY_SCENE`, then add these tests inside the existing suite:

```js
it("pauses at the beginning of the current scene", () => {
  const secondScene = reduce(createInitialLessonState(), { type: "SCENE_NEXT" });
  const paused = reduce(secondScene, { type: "PAUSE_SCENE" });

  assert.equal(paused.phase, LessonPhase.Paused);
  assert.equal(paused.sceneIndex, 1);
  assert.equal(paused.stepIndex, 0);
  assert.equal(paused.feedback, "");
  assert.equal(paused.transcript, "");
});

it("plays the selected scene from its first step", () => {
  const paused = {
    ...createInitialLessonState(),
    phase: LessonPhase.Paused,
    sceneIndex: 1,
    stepIndex: 4,
  };
  const playing = reduce(paused, { type: "PLAY_SCENE" });

  assert.equal(playing.phase, LessonPhase.Speaking);
  assert.equal(playing.sceneIndex, 1);
  assert.equal(playing.stepIndex, 0);
});

it("moves between whole scenes and starts each target scene", () => {
  const next = reduce(createInitialLessonState(), { type: "SCENE_NEXT" });
  const previous = reduce(next, { type: "SCENE_PREVIOUS" });

  assert.equal(next.phase, LessonPhase.Speaking);
  assert.equal(next.sceneIndex, 1);
  assert.equal(next.stepIndex, 0);
  assert.equal(previous.phase, LessonPhase.Speaking);
  assert.equal(previous.sceneIndex, 0);
  assert.equal(previous.stepIndex, 0);
});

it("does not navigate beyond the first or final scene", () => {
  const initial = createInitialLessonState();
  const previous = reduce(initial, { type: "SCENE_PREVIOUS" });
  const final = reduce(initial, { type: "SCENE_NEXT" });
  const next = reduce(final, { type: "SCENE_NEXT" });

  assert.deepEqual(previous, initial);
  assert.deepEqual(next, final);
});

it("replays the complete lesson from scene one", () => {
  const replayed = reduce(
    {
      ...createInitialLessonState(),
      phase: LessonPhase.Finished,
      sceneIndex: 1,
      stepIndex: 0,
    },
    { type: "REPLAY_LESSON" }
  );

  assert.equal(replayed.phase, LessonPhase.Speaking);
  assert.equal(replayed.sceneIndex, 0);
  assert.equal(replayed.stepIndex, 0);
});
```

In `tests/lesson-progress.test.mjs`, add:

```js
  it("labels idle and paused scenes with their Play behavior", () => {
    assert.equal(
      getLessonProgressLabel(createInitialLessonState()),
      "Press Play to begin"
    );
    assert.equal(
      getLessonProgressLabel({
        ...createInitialLessonState(),
        phase: LessonPhase.Paused,
      }),
      "Scene paused — press Play to restart"
    );
  });
```

- [ ] **Step 2: Run the reducer tests and verify RED**

Run:

```bash
node --test tests/lesson-state.test.mjs tests/lesson-progress.test.mjs
```

Expected: FAIL because `LessonPhase.Paused` and the scene-control events do not exist, while the renamed start tests remain idle.

- [ ] **Step 3: Implement the minimal reducer transitions**

In `lib/lesson-state.js`, add the paused phase:

```js
export const LessonPhase = {
  Idle: "idle",
  Paused: "paused",
  Speaking: "speaking",
  WaitingForUser: "waiting-for-user",
  Recording: "recording",
  Evaluating: "evaluating",
  Feedback: "feedback",
  Finished: "finished",
};
```

Replace `START` in the event typedef with the five explicit controls:

```js
 *   | { type: "PLAY_SCENE" }
 *   | { type: "PAUSE_SCENE" }
 *   | { type: "SCENE_PREVIOUS" }
 *   | { type: "SCENE_NEXT" }
 *   | { type: "REPLAY_LESSON" }
```

Add this helper after `getStepPhase`:

```js
function startScene(state, lesson, sceneIndex) {
  const scene = lesson.scenes[sceneIndex];
  const step = scene?.steps[0];
  if (!scene || !step) return state;

  return {
    ...createInitialLessonState(),
    phase: getStepPhase(step),
    sceneIndex,
  };
}
```

Replace the `START` reducer case with:

```js
    case "PLAY_SCENE":
      return startScene(state, lesson, state.sceneIndex);
    case "PAUSE_SCENE":
      return {
        ...createInitialLessonState(),
        phase: LessonPhase.Paused,
        sceneIndex: state.sceneIndex,
      };
    case "SCENE_PREVIOUS":
      return state.sceneIndex === 0
        ? state
        : startScene(state, lesson, state.sceneIndex - 1);
    case "SCENE_NEXT":
      return state.sceneIndex >= lesson.scenes.length - 1
        ? state
        : startScene(state, lesson, state.sceneIndex + 1);
    case "REPLAY_LESSON":
      return startScene(state, lesson, 0);
```

In `lib/lesson-progress.js`, replace the Idle label and add the paused label:

```js
    case LessonPhase.Idle:
      return "Press Play to begin";
    case LessonPhase.Paused:
      return "Scene paused — press Play to restart";
```

- [ ] **Step 4: Run the reducer tests and verify GREEN**

Run:

```bash
node --test tests/lesson-state.test.mjs tests/lesson-progress.test.mjs
```

Expected: all scene-script state tests pass.

- [ ] **Step 5: Commit the state-machine change**

```bash
git add lib/lesson-state.js lib/lesson-progress.js tests/lesson-state.test.mjs tests/lesson-progress.test.mjs
git commit -m "feat: add scene playback controls"
```

### Task 2: Keep the Learner in Data but Hide the Learner Character

**Files:**
- Modify: `tests/lesson-scene.test.mjs`
- Modify: `lib/lesson-scene.js`

- [ ] **Step 1: Change presentation expectations to visible story characters only**

In `tests/lesson-scene.test.mjs`, rename the first test to `"resolves the background and visible story characters"` and make its character expectation exactly:

```js
    assert.deepEqual(
      scene.characters.map(({ id, emote, isActive, asset }) => ({
        id,
        emote,
        isActive,
        asset,
      })),
      [
        {
          id: "peppa",
          emote: "listening",
          isActive: false,
          asset: {
            src: "/assets/peppa-listening.webp",
            alt: "peppa listening",
          },
        },
        {
          id: "dolly",
          emote: "talking",
          isActive: true,
          asset: { src: "/assets/dolly-talking.webp", alt: "dolly talking" },
        },
      ]
    );
```

Replace `"keeps the user active while waiting, recording, and evaluating"` with:

```js
  it("keeps user speech metadata without rendering a learner character", () => {
    for (const phase of [
      LessonPhase.WaitingForUser,
      LessonPhase.Recording,
      LessonPhase.Evaluating,
    ]) {
      const scene = getLessonScenePresentation(
        { ...createInitialLessonState(), phase, stepIndex: 2 },
        lesson,
        catalog
      );

      assert.deepEqual(scene.speech, {
        speaker: "user",
        text: "Here you are!",
        kind: "user",
      });
      assert.equal(scene.characters.some((character) => character.id === "user"), false);
    }
  });
```

- [ ] **Step 2: Run the presentation tests and verify RED**

Run:

```bash
node --test tests/lesson-scene.test.mjs
```

Expected: FAIL because the presentation still includes the `user` catalog entry.

- [ ] **Step 3: Filter the learner before building visible character presentation**

In `lib/lesson-scene.js`, remove `userIsActive` and replace the character projection with:

```js
  const characters = scene.characters
    .filter((id) => id !== "user")
    .map((id) => {
      const definition = catalog.characters.get(id);
      if (!definition) throw new Error(`Unknown character: ${id}`);
      const emote = step.emotes[id];
      const asset = definition.assets[emote];
      if (!asset) throw new Error(`Missing ${id} asset for emote: ${emote}`);

      return {
        id,
        name: definition.name,
        asset,
        emote,
        isActive: state.phase === LessonPhase.Speaking && step.speaker === id,
      };
    });
```

Do not remove `user` from lesson JSON, the character catalog, scene character arrays, or emote maps.

- [ ] **Step 4: Run presentation and data-contract tests**

Run:

```bash
node --test tests/lesson-scene.test.mjs tests/lesson-data.test.mjs
```

Expected: both suites pass; data validation still requires the modeled user.

- [ ] **Step 5: Commit the presentation boundary**

```bash
git add lib/lesson-scene.js tests/lesson-scene.test.mjs
git commit -m "fix: hide learner from scene characters"
```

### Task 3: Restore Controls and Move the Learner Turn into the Dock

**Files:**
- Create: `tests/lesson-controls-ui.test.mjs`
- Modify: `tests/microphone-prompt-ui.test.mjs`
- Modify: `tests/architecture-cleanup.test.mjs`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add failing UI structure and control-wiring tests**

Create `tests/lesson-controls-ui.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("scene playback controls", () => {
  it("renders previous, playback, and next controls in one dock", () => {
    assert.match(app, /scene-control-dock/);
    assert.match(app, /aria-label="Previous scene"/);
    assert.match(app, /aria-label="Next scene"/);
    assert.match(app, /PLAY_SCENE/);
    assert.match(app, /PAUSE_SCENE/);
    assert.match(app, /SCENE_PREVIOUS/);
    assert.match(app, /SCENE_NEXT/);
    assert.match(app, /REPLAY_LESSON/);
  });

  it("cancels pending learner work before manual scene controls", () => {
    assert.match(app, /function cancelPendingWork/);
    assert.match(app, /pressSequenceRef\.current \+= 1/);
    assert.match(app, /playbackControllerRef\.current\?\.abort\(\)/);
    assert.match(app, /recordingControllerRef\.current\?\.abort\(\)/);
    assert.match(app, /recordingRef\.current\?\.cancel\(\)/);
    assert.match(app, /evaluationControllerRef\.current\?\.abort\(\)/);
    assert.match(app, /function dispatchSceneControl/);
  });

  it("uses only the dock prompt for user speech", () => {
    assert.match(app, /scene\.speech\.kind === "user" \? null/);
    assert.match(app, /learner-mic-prompt/);
    assert.doesNotMatch(app, /user-turn-panel/);
  });
});
```

In `tests/microphone-prompt-ui.test.mjs`, change the start assertion from
`dispatch({ type: "START" })` to `dispatch({ type: "PLAY_SCENE" })`, and add:

```js
    assert.match(app, /learner-mic-prompt/);
    assert.doesNotMatch(app, /className="speech-bubble is-user"/);
```

In `tests/architecture-cleanup.test.mjs`, rename `"renders generic characters and a lesson picker"` to `"renders generic story characters with scene controls"`, retain the existing positive catalog/picker assertions, remove the negative Chevron/event assertion, and add:

```js
    assert.match(app, /ChevronLeft|ChevronRight/);
    assert.match(app, /SCENE_NEXT|SCENE_PREVIOUS/);
    assert.match(app, /scene-control-dock/);
```

- [ ] **Step 2: Run the UI contract tests and verify RED**

Run:

```bash
node --test tests/lesson-controls-ui.test.mjs tests/microphone-prompt-ui.test.mjs tests/architecture-cleanup.test.mjs
```

Expected: FAIL because the dock, scene events, and cancellation helper are absent.

- [ ] **Step 3: Add scene-control imports, events, and derived state**

In `src/App.tsx`, replace the icon import with:

```tsx
import {
  ChevronLeft,
  ChevronRight,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
```

Replace `START` in `LessonEvent` with:

```tsx
  | { type: "PLAY_SCENE" }
  | { type: "PAUSE_SCENE" }
  | { type: "SCENE_PREVIOUS" }
  | { type: "SCENE_NEXT" }
  | { type: "REPLAY_LESSON" }
```

After the existing `showUserTurn` calculation, add:

```tsx
  const playbackIsActive = ![
    LessonPhase.Idle,
    LessonPhase.Paused,
    LessonPhase.Finished,
  ].includes(state.phase);
  const atFirstScene = state.sceneIndex === 0;
  const atFinalScene = state.sceneIndex === currentLesson.scenes.length - 1;
  const playbackLabel =
    state.phase === LessonPhase.Finished
      ? "Replay lesson"
      : playbackIsActive
        ? "Pause"
        : "Play";
```

Include `LessonPhase.Paused` in `canSelectLesson`.

Add an audio controller ref beside the existing recording/evaluation refs:

```tsx
  const playbackControllerRef = useRef<AbortController | null>(null);
```

In the saved-audio effect, assign the newly created controller before playback:

```tsx
    const controller = new AbortController();
    playbackControllerRef.current = controller;
```

Add a `finally` after the existing `then`/`catch` chain:

```tsx
      .finally(() => {
        if (playbackControllerRef.current === controller) {
          playbackControllerRef.current = null;
        }
      });
```

In the effect cleanup, abort and clear that same ref:

```tsx
    return () => {
      cancelled = true;
      controller.abort();
      if (playbackControllerRef.current === controller) {
        playbackControllerRef.current = null;
      }
    };
```

- [ ] **Step 4: Centralize cancellation and dispatch control events**

Replace the repeated cancellation body in `handleLessonChange` with a call to
this helper, declared before `handleLessonChange`:

```tsx
  function cancelPendingWork() {
    pressedRef.current = false;
    pressSequenceRef.current += 1;
    playbackControllerRef.current?.abort();
    playbackControllerRef.current = null;
    recordingControllerRef.current?.abort();
    recordingControllerRef.current = null;
    recordingRef.current?.cancel();
    recordingRef.current = null;
    evaluationControllerRef.current?.abort();
    evaluationControllerRef.current = null;
  }

  function dispatchSceneControl(
    type:
      | "PLAY_SCENE"
      | "PAUSE_SCENE"
      | "SCENE_PREVIOUS"
      | "SCENE_NEXT"
      | "REPLAY_LESSON"
  ) {
    cancelPendingWork();
    setError("");
    dispatch({ type });
  }
```

Replace `startLesson` with:

```tsx
  function handlePlaybackControl() {
    if (state.phase === LessonPhase.Finished) {
      dispatchSceneControl("REPLAY_LESSON");
      return;
    }

    dispatchSceneControl(playbackIsActive ? "PAUSE_SCENE" : "PLAY_SCENE");
  }
```

Make `cancelRecording` call `cancelPendingWork()` before dispatching
`RECORDING_CANCELLED`. Keep the phase guard so pointer cancellation only sends
that event from `LessonPhase.Recording`.

- [ ] **Step 5: Remove the active flow banner and user speech bubble**

Delete the complete `.lesson-flow-banner` JSX block. Replace the speech
conditional with this outer user guard while retaining the existing narrator
and character markup inside it:

```tsx
        {scene.speech.kind === "user" ? null : scene.speech.kind === "narration" ||
          scene.speech.kind === "feedback" ||
          scene.speech.kind === "finished" ? (
          <div
            aria-live="polite"
            className={`narrator-caption is-${scene.speech.kind}`}
            role="status"
          >
            <span>Narrator</span>
            <p>{scene.speech.text}</p>
          </div>
        ) : (
          <div
            aria-live="polite"
            className={`speech-bubble is-${scene.speech.kind}`}
            data-speaker={scene.speech.speaker}
            role="status"
            style={
              {
                "--character-count": scene.characters.length,
                "--character-index": Math.max(0, speechCharacterIndex),
              } as CharacterStyle
            }
          >
            <span>{scene.speech.speaker}</span>
            <p>{scene.speech.text}</p>
          </div>
        )}
```

- [ ] **Step 6: Render the safe-zone dock**

Replace the complete `.user-turn-panel` JSX block with:

```tsx
        <nav aria-label="Lesson controls" className="scene-control-dock">
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
            <span aria-live="polite" className="dock-status">
              {progressLabel}
            </span>
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

- [ ] **Step 7: Run UI, state, and presentation tests**

Run:

```bash
node --test tests/lesson-controls-ui.test.mjs tests/microphone-prompt-ui.test.mjs tests/architecture-cleanup.test.mjs tests/lesson-state.test.mjs tests/lesson-scene.test.mjs
```

Expected: UI source contracts and the underlying state/presentation suites pass.

- [ ] **Step 8: Commit the React control surface**

```bash
git add src/App.tsx tests/lesson-controls-ui.test.mjs tests/microphone-prompt-ui.test.mjs tests/architecture-cleanup.test.mjs
git commit -m "feat: restore scene playback controls"
```

### Task 4: Style the Non-Occluding Responsive Dock

**Files:**
- Modify: `tests/stage-layout.test.mjs`
- Modify: `tests/microphone-prompt-ui.test.mjs`
- Modify: `src/styles.css`

- [ ] **Step 1: Add failing safe-zone and palette assertions**

In `tests/stage-layout.test.mjs`, add:

```js
  it("reserves a bottom safe area for one scene control dock", () => {
    const stage = getRule(".lesson-stage");
    const sprite = getRule(".character-sprite");
    const dock = getRule(".scene-control-dock");

    assert.match(stage, /--control-safe-area/);
    assert.match(sprite, /bottom:\s*calc\(var\(--control-safe-area\)/);
    assert.match(dock, /position:\s*absolute/);
    assert.match(dock, /grid-template-columns/);
    assert.match(dock, /background:\s*rgb\(23 60 103/);
  });
```

In the compact-layout test add:

```js
    assert.match(styles, /--control-safe-area:\s*clamp\(/);
    assert.match(styles, /\.scene-control-dock[\s\S]*?grid-template-areas/);
```

In `tests/microphone-prompt-ui.test.mjs`, change the selector from
`.user-turn-panel` to `.learner-mic-prompt` where applicable, retain the
hold-button assertions, and add:

```js
    const promptRule = getRule(".learner-mic-prompt");
    assert.match(promptRule, /background:\s*rgb\(255 255 255/);
    assert.doesNotMatch(styles, /\.user-turn-panel\s*\{/);
```

- [ ] **Step 2: Run the layout tests and verify RED**

Run:

```bash
node --test tests/stage-layout.test.mjs tests/microphone-prompt-ui.test.mjs
```

Expected: FAIL because the dock selectors and control safe area are absent.

- [ ] **Step 3: Reserve stage space and move character baselines**

Add the desktop variable to `.lesson-stage`:

```css
.lesson-stage {
  --control-safe-area: clamp(118px, 16vh, 154px);

  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: linear-gradient(#8bd5fa 0 58%, #8fce65 58%);
  isolation: isolate;
}
```

Change `.character-sprite` to:

```css
.character-sprite {
  --slot-left: calc(
    (var(--character-index) + 1) * 100% / (var(--character-count) + 1)
  );
  position: absolute;
  bottom: calc(var(--control-safe-area) + clamp(4px, 1vh, 14px));
  left: var(--slot-left);
  z-index: 5;
  display: grid;
  width: clamp(150px, 23vw, 340px);
  height: min(48vh, 450px);
  justify-items: center;
  align-items: end;
  filter: drop-shadow(0 18px 13px rgb(64 75 48 / 22%));
  object-position: center bottom;
  transform: translateX(-50%);
  transform-origin: 50% 100%;
  transition: filter 180ms ease, transform 180ms ease;
}
```

- [ ] **Step 4: Replace old flow/panel CSS with the dock styles**

Delete `.lesson-flow-banner`, `.start-lesson-button`, `.flow-status`,
`.user-turn-panel`, and their state/media rules. Add:

```css
.scene-control-dock {
  position: absolute;
  right: clamp(12px, 2vw, 28px);
  bottom: clamp(12px, 2vh, 24px);
  left: clamp(12px, 2vw, 28px);
  z-index: 24;
  display: grid;
  min-height: 86px;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: clamp(8px, 1.2vw, 16px);
  border: 5px solid rgb(255 255 255 / 96%);
  border-radius: 999px;
  background: rgb(23 60 103 / 96%);
  padding: 10px 14px;
  box-shadow: 0 7px 0 rgb(18 55 92 / 42%), 0 16px 34px rgb(21 77 116 / 24%);
}

.scene-control-button,
.playback-control-button {
  display: inline-grid;
  min-width: 58px;
  min-height: 58px;
  place-items: center;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
}

.scene-control-button {
  background: #fff;
  color: #173c67;
}

.scene-control-button:disabled {
  cursor: default;
  opacity: 0.42;
}

.scene-control-button svg {
  width: 34px;
  height: 34px;
}

.playback-control-button {
  grid-auto-flow: column;
  gap: 8px;
  background: #ffd944;
  color: #241d2b;
  padding: 0 18px;
  font-weight: 950;
}

.playback-control-button svg {
  width: 28px;
  height: 28px;
}

.dock-status {
  overflow: hidden;
  color: #fff;
  font-size: clamp(0.95rem, 1.6vw, 1.3rem);
  font-weight: 900;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.learner-mic-prompt {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border-radius: 999px;
  background: rgb(255 255 255 / 97%);
  padding: 8px 10px 8px 18px;
}

.learner-mic-prompt > strong {
  overflow: hidden;
  font-size: clamp(1rem, 1.8vw, 1.45rem);
  line-height: 1.1;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hold-to-talk-button {
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 4px solid #fff;
  border-radius: 999px;
  background: #0f8f68;
  color: #fff;
  cursor: pointer;
  padding: 8px 20px;
  font-size: clamp(0.92rem, 1.5vw, 1.2rem);
  font-weight: 950;
  touch-action: none;
  box-shadow: 0 5px 0 rgb(6 97 70 / 42%);
  user-select: none;
}

.hold-to-talk-button.is-recording {
  animation: micPulse 820ms ease-in-out infinite;
  background: #d62f70;
  box-shadow: 0 5px 0 rgb(145 24 72 / 42%);
}

.learner-mic-prompt.is-recording {
  background: #fff7ce;
}

.learner-mic-prompt.is-evaluating {
  background: #eaf8ff;
}

.checking-label {
  display: inline-grid;
  min-height: 50px;
  place-items: center;
  border-radius: 999px;
  background: #204c7f;
  color: #fff;
  padding: 0 22px;
  font-size: clamp(0.92rem, 1.5vw, 1.15rem);
  font-weight: 950;
}
```

Move `.error-banner` above the dock with:

```css
  bottom: calc(var(--control-safe-area) + 12px);
```

- [ ] **Step 5: Add the narrow-screen dock layout**

Inside `@media (max-width: 720px)`, add:

```css
  .lesson-stage {
    --control-safe-area: clamp(170px, 27vh, 218px);
  }

  .scene-control-dock {
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      "back playback next"
      "prompt prompt prompt";
    border-radius: 28px;
    padding: 10px;
  }

  .scene-control-button:first-child {
    grid-area: back;
  }

  .playback-control-button {
    grid-area: playback;
    justify-self: center;
  }

  .scene-control-button:last-child {
    grid-area: next;
    justify-self: end;
  }

  .learner-mic-prompt,
  .dock-status {
    grid-area: prompt;
  }

  .learner-mic-prompt {
    grid-template-columns: 1fr;
    border-radius: 22px;
    padding: 10px;
  }

  .learner-mic-prompt > strong {
    white-space: normal;
  }
```

Update the existing narrow `.character-sprite` rule to use the safe-area bottom
calculation rather than a fixed pixel bottom.

- [ ] **Step 6: Run focused layout tests and build**

Run:

```bash
node --test tests/stage-layout.test.mjs tests/microphone-prompt-ui.test.mjs tests/lesson-controls-ui.test.mjs
npm run build
```

Expected: focused tests pass and TypeScript/Vite build succeeds.

- [ ] **Step 7: Commit the visual control layout**

```bash
git add src/styles.css tests/stage-layout.test.mjs tests/microphone-prompt-ui.test.mjs
git commit -m "style: add safe-zone lesson controls"
```

### Task 5: Repair Peppa Asset Opacity

**Files:**
- Modify: `public/assets/characters/peppa/peppa-idle.webp`
- Modify: `public/assets/characters/peppa/peppa-talking.webp`
- Modify: `public/assets/characters/peppa/peppa-listening.webp`
- Modify: `public/assets/characters/peppa/peppa-happy.webp`
- Modify: `public/assets/characters/peppa/peppa-sad.webp`
- Modify: `public/assets/characters/peppa/peppa-surprised.webp`

- [ ] **Step 1: Capture the failing alpha evidence**

Run this exact ratio check. `support` counts every non-transparent pixel and
`opaque` counts pixels above 98% alpha:

```bash
for f in public/assets/characters/peppa/*.webp; do
  support=$(magick "$f" -alpha extract -threshold 0 -format '%[fx:mean]' info:)
  opaque=$(magick "$f" -alpha extract -threshold 98% -format '%[fx:mean]' info:)
  ratio=$(awk -v a="$opaque" -v b="$support" 'BEGIN { if (b == 0) print 0; else printf "%.4f", a / b }')
  printf '%s opaque-support-ratio=%s\n' "$f" "$ratio"
done
```

Expected: the Peppa assets show low opaque-support ratios; the reported
`peppa-listening.webp` baseline is approximately `0.0193`.

- [ ] **Step 2: Inspect all six source assets before editing**

Use the local image viewer on every listed Peppa WebP. Confirm each pose and
expression matches its filename and that only opacity—not composition—is in
scope.

- [ ] **Step 3: Edit each asset with the image-generation editing tool**

For each of the six paths, make a separate image edit using the source file and
this exact prompt:

```text
Repair only the transparency of this character asset. Preserve the exact pose,
expression, linework, colors, proportions, composition, and transparent canvas.
Make the entire interior of the character fully opaque. Keep the background
fully transparent and retain only normal antialiased transparency on the outer
edge. Do not add, remove, redraw, or restyle any character detail.
```

Replace the matching source WebP with the edited output. Preserve each original
canvas dimension and encode as WebP; do not create PNG duplicates in `public`.

- [ ] **Step 4: Verify opacity, transparency, format, and dimensions**

Run the Step 1 ratio command again.

Expected: every Peppa asset has an opaque-support ratio of at least `0.80`, with
nonzero transparent background area.

Run:

```bash
file public/assets/characters/peppa/*.webp
identify -format '%f %wx%h %[channels]\n' public/assets/characters/peppa/*.webp
node --test tests/lesson-data.test.mjs tests/web-assets.test.mjs
```

Expected: six valid WebP files with alpha, unchanged dimensions, and passing
catalog/asset-format tests.

- [ ] **Step 5: Commit the repaired sprites**

```bash
git add public/assets/characters/peppa/*.webp
git commit -m "fix: make Peppa sprites opaque"
```

### Task 6: Assign British Voices and Regenerate Saved Audio

**Files:**
- Modify: `tests/generate-static-audio.test.mjs`
- Modify: `tests/architecture-cleanup.test.mjs`
- Modify: `scripts/generate-static-audio.mjs`
- Modify: `public/assets/audio/dolly-it-is-up-high.mp3`
- Modify: `public/assets/audio/dolly-can-help.mp3`
- Modify: `public/assets/audio/dolly-yes-i-can-help.mp3`
- Modify: `public/assets/audio/dolly-here-you-are.mp3`
- Modify: `public/assets/audio/dolly-thank-you.mp3`
- Modify: `public/assets/audio/narrator-copy-dolly.mp3`
- Modify: `public/assets/audio/narrator-copy-peppa.mp3`
- Modify: `public/assets/audio/narrator-ask-with-dolly.mp3`
- Modify: `public/assets/audio/narrator-thank-dolly.mp3`
- Modify: `public/assets/audio/narrator-finished-bella.mp3`
- Modify: `public/assets/audio/narrator-feedback-success.mp3`
- Modify: `public/assets/audio/narrator-retry-bella.mp3`
- Modify: `public/assets/audio/narrator-feedback-continue.mp3`
- Modify: `public/assets/audio/narrator-no-speech-bella.mp3`
- Modify: `public/assets/audio/narrator-no-speech-continue.mp3`

- [ ] **Step 1: Add failing voice identity and delivery tests**

In `tests/generate-static-audio.test.mjs`, retain the speaker-metadata test and
add these source assertions after reading `generator`:

```js
    assert.match(generator, /5N1BjZ10t6GcJUhZCP40/);
    assert.match(generator, /pFZP5JQG7iQjIQuC4Bku/);
    assert.doesNotMatch(generator, /4NQthjVhIGGVfL3Si000/);
    assert.match(generator, /line\.speaker === "narrator"/);
    assert.match(generator, /speed:\s*0\.96/);
    assert.match(generator, /style:\s*0\.35/);
```

In `tests/architecture-cleanup.test.mjs`, replace the positive Mandarin voice ID
assertion with:

```js
    assert.doesNotMatch(generator, /4NQthjVhIGGVfL3Si000/);
    assert.match(generator, /5N1BjZ10t6GcJUhZCP40/);
    assert.match(generator, /pFZP5JQG7iQjIQuC4Bku/);
```

- [ ] **Step 2: Run generator tests and verify RED**

Run:

```bash
node --test tests/generate-static-audio.test.mjs tests/architecture-cleanup.test.mjs
```

Expected: FAIL because Dolly and narrator still share Mandarin `Chen`.

- [ ] **Step 3: Set distinct concrete British voice defaults**

In `scripts/generate-static-audio.mjs`, use these constants:

```js
const ELEVENLABS_PEPPA_VOICE_ID = "Oqy85UMasXzUjUxF0ta5";
const ELEVENLABS_DOLLY_VOICE_ID = "5N1BjZ10t6GcJUhZCP40";
const ELEVENLABS_NARRATOR_VOICE_ID = "pFZP5JQG7iQjIQuC4Bku";
```

These are the available account voices `Adaline - British Newsreader or
Narrator` for Dolly and `Lily - Velvety Actress` for the narrator. Keep all
speaker override behavior unchanged.

Before the generic settings return, add:

```js
  if (line.speaker === "narrator") {
    return {
      similarity_boost: 0.82,
      speed: 0.96,
      stability: 0.5,
      style: 0.35,
      use_speaker_boost: true,
    };
  }
```

- [ ] **Step 4: Run generator tests and verify GREEN**

Run:

```bash
node --test tests/generate-static-audio.test.mjs tests/architecture-cleanup.test.mjs
```

Expected: both suites pass with distinct non-Mandarin defaults.

- [ ] **Step 5: Generate one Dolly and one narrator audition sample**

Run:

```bash
audition_dir=$(mktemp -d /tmp/parrot-voice-audition.XXXXXX)
set -a
source '/Users/patchin/Workspace/test/Parrot English/.dev.vars'
set +a
NODE_OPTIONS=--use-system-ca npm run generate:audio:elevenlabs -- \
  --force \
  --output-dir="$audition_dir" \
  --only=dolly-it-is-up-high \
  --only=narrator-copy-dolly
file "$audition_dir"/*.mp3
```

Expected: two MPEG Layer III files generated by ElevenLabs. Audition them to
confirm Dolly is young and British and the narrator is warm, adult, British,
and measured before spending credits on the remaining lines.

- [ ] **Step 6: Regenerate exactly the Dolly and narrator cache files**

Run:

```bash
set -a
source '/Users/patchin/Workspace/test/Parrot English/.dev.vars'
set +a
NODE_OPTIONS=--use-system-ca npm run generate:audio:elevenlabs -- \
  --force \
  --only=dolly-it-is-up-high \
  --only=dolly-can-help \
  --only=dolly-yes-i-can-help \
  --only=dolly-here-you-are \
  --only=dolly-thank-you \
  --only=narrator-copy-dolly \
  --only=narrator-copy-peppa \
  --only=narrator-ask-with-dolly \
  --only=narrator-thank-dolly \
  --only=narrator-finished-bella \
  --only=narrator-feedback-success \
  --only=narrator-feedback-retry-bella \
  --only=narrator-feedback-continue \
  --only=narrator-feedback-no-speech-bella \
  --only=narrator-feedback-no-speech-continue
```

Expected: five Dolly files and ten narrator files report `generated`; no Peppa
file is regenerated.

- [ ] **Step 7: Verify audio format, coverage, and changed scope**

Run:

```bash
file public/assets/audio/{dolly-*.mp3,narrator-*.mp3}
node --test tests/generate-static-audio.test.mjs tests/static-audio.test.mjs tests/lesson-audio.test.mjs tests/web-assets.test.mjs
git status --short public/assets/audio
```

Expected: all files are MP3, all focused tests pass, and status lists only the
five Dolly and ten narrator cache files from this task.

- [ ] **Step 8: Commit voice configuration and regenerated audio**

```bash
git add scripts/generate-static-audio.mjs tests/generate-static-audio.test.mjs tests/architecture-cleanup.test.mjs public/assets/audio
git commit -m "fix: give Dolly and narrator British voices"
```

### Task 7: Align Product and Architecture Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/design/audio-and-content-pipeline.md`
- Modify: `docs/design/product-experience.md`
- Modify: `docs/design/technical-architecture.md`

- [ ] **Step 1: Update the documented roles and interaction loop**

In `docs/design/product-experience.md`:

- Change the role list to describe Peppa and Dolly as visible story characters,
  `user` as a scripted learner role represented only by the microphone prompt,
  and narrator as voice-only.
- State that scenes advance automatically but Back/Next can restart adjacent
  scenes and Pause/Play restarts the current scene.
- Replace “presses Start” with Play and describe the reserved control dock.
- Retain the rule that user emote data remains complete even though the learner
  asset is not rendered.

- [ ] **Step 2: Update state and presentation architecture**

In `docs/design/technical-architecture.md`:

- Add `paused` to the phase list.
- Replace `START` with `PLAY_SCENE` and document `PAUSE_SCENE`,
  `SCENE_PREVIOUS`, `SCENE_NEXT`, and `REPLAY_LESSON`.
- Explain that automatic steps continue inside a scene and controls restart at
  scene boundaries.
- Explain that `lib/lesson-scene.js` filters `user` from visible character
  presentation while preserving script data.
- Explain cancellation of playback, recording, and evaluation before controls
  change scenes.

- [ ] **Step 3: Update exact voice defaults and asset QA documentation**

In `README.md` and `docs/design/audio-and-content-pipeline.md`, document:

```text
Peppa: Oqy85UMasXzUjUxF0ta5 (Summer)
Dolly: 5N1BjZ10t6GcJUhZCP40 (Adaline)
Narrator: pFZP5JQG7iQjIQuC4Bku (Lily)
```

State that character subjects must be opaque while their background remains
transparent, and that partial alpha should be confined to antialiased edges.

- [ ] **Step 4: Verify docs and runtime language contracts**

Run:

```bash
node --test tests/architecture-cleanup.test.mjs tests/lesson-creator-prompt.test.mjs
git diff --check
```

Expected: both suites pass and no whitespace errors are reported.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md docs/design/audio-and-content-pipeline.md docs/design/product-experience.md docs/design/technical-architecture.md
git commit -m "docs: document scene controls and voice profiles"
```

### Task 8: Full Verification and Browser QA

**Files:**
- Verify only; modify earlier task files if a verified defect requires a new red/green cycle.

- [ ] **Step 1: Run the complete automated verification**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check origin/main...HEAD
```

Expected: all unit tests pass, ESLint exits zero, TypeScript/Vite build succeeds,
and the complete branch diff has no whitespace errors.

- [ ] **Step 2: Start the Vite browser target**

Run:

```bash
npm run dev:vite -- --host 127.0.0.1 --port 4173
```

Keep the process running in a terminal session for browser QA.

- [ ] **Step 3: Verify the desktop lesson flow in the in-app browser**

Load `http://127.0.0.1:4173/` at approximately 1440×900 and verify:

1. Only Peppa and Dolly render; no learner sprite or “You” name tag appears.
2. Peppa is visually opaque in every scene/emote reached.
3. Back, Play/Pause, and Next appear in one bottom dock.
4. The dock does not cover characters, names, speech bubbles, or captions.
5. Next starts the next scene at its first line; Back starts the prior scene.
6. Pause stops activity; Play restarts the current scene from its first line.
7. During a user step, no user speech bubble appears and the dock alone shows
   the target phrase and hold-to-speak control.
8. The hold action changes visibly for recording and evaluation.
9. Finished state offers Replay Lesson and restarts scene one.

Capture screenshots for the ordinary speaking and learner-turn states.

- [ ] **Step 4: Verify the narrow responsive layout**

Resize to approximately 390×844 and repeat checks 1, 3, 4, 6, and 7. Confirm
the prompt moves to its own dock row and the larger reserved safe area keeps
story elements clear.

- [ ] **Step 5: Verify regenerated voices in the running lesson**

Unmute playback and listen to at least one Dolly line and one narrator line.
Confirm Dolly has no Mandarin/Chinese accent and the narrator is distinct,
British, adult, warm, and measured. Confirm Peppa still uses her existing voice.

- [ ] **Step 6: Stop the development server and inspect final scope**

Stop the Vite terminal session, then run:

```bash
git status -sb
git diff --stat origin/main...HEAD
git log --oneline origin/main..HEAD
```

Expected: only `.superpowers/` remains untracked; implementation, assets, tests,
and docs are committed on `codex/playback-ui-voice-polish`.

- [ ] **Step 7: Apply the verification-before-completion gate**

Read and follow `superpowers:verification-before-completion`. Re-run any command
whose evidence is stale after browser fixes. Do not claim completion until the
fresh final output confirms the result.
