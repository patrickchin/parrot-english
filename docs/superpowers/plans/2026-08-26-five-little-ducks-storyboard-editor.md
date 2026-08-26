# Five Little Ducks Storyboard Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sequential Five Little Ducks dubbing wizard with the approved simplified video-project home and six-scene editor, including mixed R2/ElevenLabs playback, free scene/line navigation, same-line recording review, and resilient fallbacks.

**Architecture:** Keep `DuckDub.tsx` as the media/controller boundary and the existing v2 Worker/R2 contract. Replace wizard phases with an orthogonal pure editor reducer, split project-home and scene-editor presentation into focused React components, and extend the existing Web Audio scheduler with a per-line preferred/fallback URL resolver. The full video and each canonical four-line scene use the same scheduler and duck clock; single-line guide/take playback remains on the existing helper.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7, Tailwind 4, Cloudflare Worker/R2, Web Audio, MediaRecorder, Node test runner, Vite SSR component tests, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-26-five-little-ducks-storyboard-editor-design.md`

## Global Constraints

- Preserve `five-little-ducks-v2`, all 24 authored lines, six four-line scenes, the 98-second boundary, existing ElevenLabs guide assets, private R2 API, consent header, account deletion, and reload compatibility.
- Do not add a timeline, multiple takes, export, YouTube/protected media, dependencies, database fields, Worker endpoints, a countdown, or guide/music playback during recording.
- Use Tailwind 4 utilities in React, `ActionButton`/`TextButton` from `src/shared/ui.tsx`, and `RouteHeader`/`HeaderLink` from `src/app/AppHeader.tsx`.
- Keep media objects, Blob URLs, microphone sessions, `AbortController`s, animation handles, and generation tokens out of reducer state.
- Disable navigation only while microphone opening, recording, saving, deletion, or recoverable unsaved-Blob resolution can lose data; ordinary playback is cancellable by navigation.
- Use explicit accessible labels, `aria-current`, one polite live region, alerts for actionable failures, visible text, 48 px learner targets, reduced-motion support, and no horizontal overflow from 280 px upward.
- Use test-first red/green cycles. Commit after each task only when its focused tests pass.

---

## File Map

- `src/dubbing/dub-script.ts`: canonical 24-line script and six scene ranges; add only pure scene lookup helpers if needed.
- `src/dubbing/dub-state.ts`: replace linear wizard state/events with editor navigation, operations, saved map, fallback markers, and derivation helpers.
- `src/dubbing/dub-playback.ts`: canonical-range validation, per-line preferred/fallback loading, Web Audio scheduling, fixed/scoped duration, callbacks, and cleanup.
- `src/dubbing/DubProjectHome.tsx`: project bar, dominant full-video stage/transport, six-scene dock, Continue, completion label, and grown-up options.
- `src/dubbing/DubSceneEditor.tsx`: scene stage/transport, four line selectors, lyric, guide/record actions, waveform/take playback, errors, and back action.
- `src/dubbing/DuckDub.tsx`: status loading, consent, reducer/controller wiring, media cancellation, recording/upload recovery, playback source resolution, focus, and route composition.
- `src/dubbing/DuckScene.tsx`, `src/dubbing/DubTakeWaveform.tsx`: reused without changing their domain responsibilities.
- `tests/dub-state.test.mjs`: editor state, first-missing selection, statuses, and navigation safety.
- `tests/dub-playback.test.mjs`: mixed source loading, private fallback, unavailable-line continuation, durations, and cleanup.
- `tests/dub-ui.test.mjs`: SSR-visible project and scene structures, explicit controls, accessible state names, and live messages.
- `src/testing/e2e-browser-mocks.ts`: deterministic guide/private fetch telemetry and corrupt-private/generated-failure scenarios.
- `tests/e2e/dubbing.spec.ts`: complete browser flow, recovery, focus, responsive layout, and media cleanup.
- `docs/design/product-experience.md`, `docs/design/technical-architecture.md`: document the shipped non-linear editor and mixed playback without changing server architecture.

### Task 1: Replace Wizard State With the Pure Editor Domain

**Files:**
- Modify: `src/dubbing/dub-state.ts`
- Test: `tests/dub-state.test.mjs`

**Interfaces:**

```ts
export type DubView = "loading" | "intro" | "project" | "scene";
export type DubOperation =
  | "idle" | "guide-playing" | "mic-opening" | "recording" | "saving"
  | "take-playing" | "playback-loading" | "playback" | "deleting";
export type DubPlaybackScope = "full" | "scene" | null;
export type DubState = {
  error: string;
  needsRetake: Record<string, true>;
  operation: DubOperation;
  playbackScope: DubPlaybackScope;
  saveRecovery: "record" | "save" | null;
  saved: Record<string, string>;
  selectedLineIndex: number;
  selectedSceneIndex: number;
  view: DubView;
};
export type DubSceneStatus =
  | { kind: "not-started"; recorded: 0 }
  | { kind: "in-progress"; recorded: 1 | 2 | 3 }
  | { kind: "done"; recorded: 4 }
  | { kind: "needs-retake"; recorded: number };
export function firstMissingDubLineIndex(savedLineIds: ReadonlySet<string>): number;
export function getDubSceneStatus(state: Pick<DubState, "saved" | "needsRetake">, sceneIndex: number): DubSceneStatus;
export function reduceDubState(state: DubState, event: DubEvent): DubState;
```

Events must cover `LOADED`, `CONFIRMED`, `OPEN_SCENE`, `CONTINUE`, `SELECT_LINE`, `BACK_TO_PROJECT`, `OPERATION_STARTED`, `OPERATION_FINISHED`, `SAVE_FAILED`, `SAVE_SUCCEEDED`, `MARK_NEEDS_RETAKE`, `CLEAR_NEEDS_RETAKE`, `SET_ERROR`, and `RESET_SUCCEEDED`. `OPEN_SCENE` selects its first missing line or first authored line when complete. Selection/navigation events are ignored while `operation` can lose a take.

- [ ] **Step 1: Rewrite reducer tests first**

Add exact cases that assert:

```js
state = reduceDubState(state, { type: "CONFIRMED" });
assert.equal(state.view, "project");
state = reduceDubState(state, { type: "CONTINUE" });
assert.deepEqual(
  [state.view, state.selectedSceneIndex, state.selectedLineIndex],
  ["scene", 1, 5],
);
state = reduceDubState(state, { type: "OPEN_SCENE", sceneIndex: 4 });
assert.deepEqual([state.selectedSceneIndex, state.selectedLineIndex], [4, 16]);
state = reduceDubState(state, { type: "SELECT_LINE", lineId: "line-20" });
assert.equal(state.selectedLineIndex, 19);
```

Also assert all four scene statuses, same-line position after `SAVE_SUCCEEDED`, replacement clearing `needsRetake`, safe back navigation, blocked navigation during save/retry, and reset returning to intro.

- [ ] **Step 2: Run `node --test tests/dub-state.test.mjs`**

Expected: FAIL because the current reducer still exposes wizard phases and saved-only line selection.

- [ ] **Step 3: Implement the minimal editor reducer and pure derivations**

Delete `NEXT_LINE`, verse-preview, and final-ready transitions. Keep canonical line/scene validation inside the reducer and return the unchanged state for invalid/unsafe events.

- [ ] **Step 4: Run `node --test tests/dub-state.test.mjs`**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dubbing/dub-state.ts tests/dub-state.test.mjs
git commit -m "refactor: model duck dub as storyboard editor"
```

### Task 2: Add Per-Line Mixed Audio With Private Fallback

**Files:**
- Modify: `src/dubbing/dub-playback.ts`
- Modify: `tests/dub-playback.test.mjs`

**Interfaces:**

```ts
export type DubAudioSource = {
  fallbackUrl?: string;
  preferredUrl: string;
};
type StartDubPlaybackOptions = {
  // existing injectable clock/fetch/cancellation fields remain
  lines?: readonly DubLine[];
  onLineFallback?: (lineId: DubLine["id"], stage: DubLinePlaybackStage) => void;
  onLineUnavailable?: (lineId: DubLine["id"]) => void;
  resolveAudioSource: (line: DubLine) => DubAudioSource;
};
```

The loader tries `preferredUrl`, calls `onLineFallback` only when that attempt fails, then fetches/decodes `fallbackUrl`. If both fail, it calls `onLineUnavailable`, omits that voice source, and continues. External abort remains an `AbortError`; setup failures outside an individual source still reject without exposing technical detail.

- [ ] **Step 1: Add failing mixed-source scheduler tests**

Cover these exact behaviors:

- unsaved lines fetch only guide URLs while saved lines prefer private URLs;
- a private fetch failure retries that line's guide, reports `fetch`, and still starts all voices;
- a private decode failure retries the guide, reports `decode`, and continues;
- both sources failing omits only that voice and calls `onLineUnavailable` once;
- a four-line scene rebases its first cue and lasts through its decoded final tail;
- full playback remains exactly `DUB_DURATION_MS`;
- stop/abort cancels both first-choice and fallback work and closes the context once.

Use explicit resolvers such as:

```js
resolveAudioSource(line) {
  return line.id === "line-1"
    ? { preferredUrl: `/api/dubs/five-little-ducks-v2/lines/${line.id}/audio`, fallbackUrl: `/assets/audio/five-little-ducks-v2-guide-${line.id}.mp3` }
    : { preferredUrl: `/assets/audio/five-little-ducks-v2-guide-${line.id}.mp3` };
}
```

- [ ] **Step 2: Run `node --test tests/dub-playback.test.mjs`**

Expected: FAIL because `resolveAudioSource`, callbacks, and fallback loading do not exist.

- [ ] **Step 3: Refactor only the line loader**

Keep `getPlaybackScope`, `scheduleDubAudio`, music, tick timing, and idempotent cleanup. Replace the hard-coded `getDubLineAudioUrl(id)` load with a small `loadAndDecode(url, lineId)` helper plus the preferred/fallback loop. Remove `DubLinePlaybackError` only after all controller/test callers are migrated.

- [ ] **Step 4: Run `node --test tests/dub-playback.test.mjs`**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dubbing/dub-playback.ts tests/dub-playback.test.mjs
git commit -m "feat: mix saved and generated duck dub audio"
```

### Task 3: Build the Project Home and Focused Scene Editor Views

**Files:**
- Create: `src/dubbing/DubProjectHome.tsx`
- Create: `src/dubbing/DubSceneEditor.tsx`
- Modify: `src/dubbing/DuckDub.tsx`
- Modify: `tests/dub-ui.test.mjs`

**Component contracts:**

```ts
export type DubProjectHomeProps = {
  activeLine: DubLine;
  needsRetake: ReadonlySet<string>;
  onContinue(): void;
  onDelete(): void;
  onOpenScene(sceneIndex: number): void;
  onTogglePlayback(): void;
  playback: "idle" | "loading" | "playing";
  saved: Readonly<Record<string, string>>;
};

export type DubSceneEditorProps = {
  activeLine: DubLine;
  activeSceneIndex: number;
  error: string;
  needsRetake: ReadonlySet<string>;
  onBack(): void;
  onHearGuide(): void;
  onHearTake(): void;
  onRecord(): void;
  onRetrySave(): void;
  onSelectLine(lineId: string): void;
  onToggleScenePlayback(): void;
  operation: DubOperation;
  pendingTake: Blob | null;
  saveRecovery: "record" | "save" | null;
  saved: Readonly<Record<string, string>>;
};
```

Props may be grouped into handler objects during implementation, but the named behaviors and state stay explicit. `DubProjectHome` owns the six scene buttons/dock; `DubSceneEditor` owns the four line buttons. Neither component starts media or performs fetches.

- [ ] **Step 1: Replace SSR UI assertions with the approved information architecture**

Assert the project view has `Play full video`, six separately named scene buttons, `Draft`, `n of 24 voice clips recorded`, `Continue Scene n`, a dominant player region, and no lyric/waveform/record/Next controls. Assert all-saved state shows `Your dub` and `All scenes recorded` while scenes remain selectable.

Assert the scene view has `Back to full video`, `Play this scene`, four line selectors with recorded/generated/needs-retake accessible names, `aria-current` on selected scene/line, the full lyric, `Hear example`, one fixed `Record line` position, optional waveform/`Hear my voice`, and no `Next line`.

- [ ] **Step 2: Run `node --test tests/dub-ui.test.mjs`**

Expected: FAIL on the old two-column wizard markup and controls.

- [ ] **Step 3: Implement presentation components and compose them from `DuckDubView`**

Use one wide workspace container (`max-w-[1600px]`), an aspect-video player, compact six-column desktop dock, horizontal narrow-phone dock, and a wide two-column scene editor. Keep the existing intro/loading/delete recovery UI and shared header. Reuse `DuckScene` and `DubTakeWaveform`.

- [ ] **Step 4: Run `node --test tests/dub-ui.test.mjs tests/dub-state.test.mjs`**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dubbing/DubProjectHome.tsx src/dubbing/DubSceneEditor.tsx src/dubbing/DuckDub.tsx tests/dub-ui.test.mjs
git commit -m "feat: add duck dub storyboard workspace"
```

### Task 4: Wire Navigation, Recording, Mixed Playback, and Recovery

**Files:**
- Modify: `src/dubbing/DuckDub.tsx`
- Modify: `src/testing/e2e-browser-mocks.ts`
- Modify: `tests/e2e/dubbing.spec.ts`

**Controller behavior:**

```ts
function resolveLineAudio(line: DubLine): DubAudioSource {
  const guide = getStaticAudioLineForSpeech("narrator", line.text);
  return Object.hasOwn(state.saved, line.id)
    ? { preferredUrl: getDubLineAudioUrl(line.id), fallbackUrl: guide.src }
    : { preferredUrl: guide.src };
}
```

The controller calls `startDubPlayback` with all `DUB_LINES` on project home and `DUB_VERSES[selectedSceneIndex]` in a scene. `onLineFallback` dispatches `MARK_NEEDS_RETAKE`; `onLineUnavailable` produces a non-blocking exact scene/line alert. A successful replacement dispatches `CLEAR_NEEDS_RETAKE` through `SAVE_SUCCEEDED`.

- [ ] **Step 1: Rewrite the core Playwright flows first**

Add/replace tests for:

1. confirmation opens project home, not line 1;
2. empty project plays a fully generated full draft;
3. partial project plays a mixed full draft and scene, fetching private URLs only for saved lines;
4. Continue opens first missing scene/line; arbitrary scene and line selection works out of order;
5. Record starts immediately after microphone readiness with no countdown, Stop saves the selected slot, waveform and local replay appear, and focus/state remain on the same line;
6. Back returns home without losing progress and reload resumes statuses;
7. replacement overwrites the chosen canonical slot;
8. temporary upload failure retains Blob/waveform and Save again; rejection removes retry-save and offers Record again;
9. corrupt private fetch/decode falls back to the guide, completes playback, and marks the scene Needs retake;
10. both-source failure continues animation/music and reports the exact scene/line;
11. delayed/denied/unsupported microphone, route-exit cleanup, delete/reset recovery, six-second auto-stop, and idempotent audio cleanup remain covered.

- [ ] **Step 2: Run the focused browser file**

Run: `npx playwright test tests/e2e/dubbing.spec.ts`

Expected: FAIL because the controller still advances sequentially and playback requests only private audio.

- [ ] **Step 3: Implement controller wiring without changing server APIs**

Refactor controller callbacks around selected scene/line and exclusive operation. Cancel guide/take/scoped playback before recording or navigation. Keep the pending Blob and object URL after retryable upload failure; discard them only for explicit re-record, successful upload, deletion, or unmount. Do not auto-play a guide on scene/line selection and do not auto-advance after save.

- [ ] **Step 4: Extend only the existing browser doubles required by the new assertions**

Track guide and private fetches separately, make `corrupt-line-5` fail the private decode but allow its guide, and add one deterministic both-source-failure scenario. Preserve current API/upload/reset/microphone semantics.

- [ ] **Step 5: Run focused tests**

```bash
node --test tests/dub-state.test.mjs tests/dub-playback.test.mjs tests/dub-ui.test.mjs tests/dub-api.test.mjs tests/dub-worker.test.mjs tests/dub-waveform.test.mjs
npx playwright test tests/e2e/dubbing.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/dubbing/DuckDub.tsx src/testing/e2e-browser-mocks.ts tests/e2e/dubbing.spec.ts
git commit -m "feat: wire non-linear duck dubbing workflow"
```

### Task 5: Lock Responsive and Accessible Editor Behavior

**Files:**
- Modify: `tests/e2e/dubbing.spec.ts`
- Modify: `src/dubbing/DubProjectHome.tsx`
- Modify: `src/dubbing/DubSceneEditor.tsx`
- Modify: `src/dubbing/DuckDub.tsx` only if shared focus/live-region wiring needs adjustment

- [ ] **Step 1: Add failing viewport, focus, keyboard, and reduced-motion tests**

At 1440×900 assert the project workspace uses at least 90% of the viewport width, the 16:9 stage is dominant, and all six compact scene controls sit beneath it. At 280×568 and 390×844 assert no document horizontal overflow, the scene dock scrolls horizontally, selected scene remains reachable, all learner targets are at least 48 px, and the scene editor can scroll to active recording/review controls. At 640×360 assert header, player, selected line, and record action do not overlap and remain operable.

Keyboard assertions: scene click/Enter focuses the scene heading, line selection focuses its line heading, recording/save/failure returns focus to the fixed recording/recovery action, scoped playback completion returns focus to its play control, and `aria-current`/live status communicate state without color. Keep the existing reduced-motion duck assertion.

- [ ] **Step 2: Run `npx playwright test tests/e2e/dubbing.spec.ts`**

Expected: FAIL on any missing containment or focus behavior.

- [ ] **Step 3: Make minimal Tailwind/focus fixes**

Do not add page-specific CSS. Preserve a web-workspace silhouette on desktop; stack only at narrow breakpoints. Avoid nested interactive elements and keep stage SVG hidden from the accessibility tree.

- [ ] **Step 4: Run `npx playwright test tests/e2e/dubbing.spec.ts`**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dubbing/DubProjectHome.tsx src/dubbing/DubSceneEditor.tsx src/dubbing/DuckDub.tsx tests/e2e/dubbing.spec.ts
git commit -m "test: harden duck dub editor UX"
```

### Task 6: Synchronize Documentation and Verify the Entire Product

**Files:**
- Modify: `docs/design/product-experience.md`
- Modify: `docs/design/technical-architecture.md`

- [ ] **Step 1: Update product and technical documentation**

Describe the full-video project home, six selectable scenes, four independent line clips per scene, mixed saved/generated draft playback, no-countdown/same-line recording review, session-local Needs retake, and unchanged private v2 R2/API boundary. Remove statements that describe mandatory line-by-line/verse-preview advancement.

- [ ] **Step 2: Run focused verification from a clean command invocation**

```bash
node --test tests/dub-state.test.mjs tests/dub-playback.test.mjs tests/dub-ui.test.mjs tests/dub-api.test.mjs tests/dub-worker.test.mjs tests/dub-waveform.test.mjs
npx playwright test tests/e2e/dubbing.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run full verification**

```bash
npm test
npm run test:browser
npm run build
npm run lint
git diff --check origin/main...HEAD
git status --short
```

Expected: all commands exit 0 and only intentional tracked changes remain.

- [ ] **Step 4: Request an independent specification/code review**

The reviewer must compare `origin/main...HEAD` with the approved spec, inspect security/privacy regressions, cancellation and Blob lifecycle, mixed-source fallback behavior, accessible semantics, responsive layout, and test gaps. Resolve every actionable finding with another red/green cycle.

- [ ] **Step 5: Commit documentation or review fixes**

```bash
git add docs/design/product-experience.md docs/design/technical-architecture.md
git commit -m "docs: describe duck dub storyboard editor"
```

- [ ] **Step 6: Re-run all full verification after the final commit**

Use the exact commands from Step 3. Record the successful output in the PR body.

### Task 7: Merge, Deploy, and Production-Smoke-Test

- [ ] **Step 1: Push and open a PR**

```bash
git push -u origin codex/dub-storyboard-editor
gh pr create --base main --head codex/dub-storyboard-editor --title "Redesign Five Little Ducks as a storyboard editor" --body "## Summary
- replace the sequential dub wizard with a full-video storyboard home and six selectable scenes
- mix private saved takes with checked-in ElevenLabs guides for incomplete playback
- preserve private v2 R2 storage, recording recovery, deletion, and responsive accessibility

## Verification
- npm test
- npm run test:browser
- npm run build
- npm run lint"
```

The PR body must link the approved spec, summarize user-visible behavior, note unchanged R2/API privacy, and list exact verification commands/results.

- [ ] **Step 2: Wait for required checks and inspect failures**

Use `gh pr checks --watch`. Fix failures on the branch, rerun proportional local verification, push, and wait again.

- [ ] **Step 3: Merge the PR**

Merge only after required checks pass and GitHub reports the branch mergeable. Use the repository's accepted merge strategy and verify the resulting `main` commit.

- [ ] **Step 4: Wait for the Cloudflare production deployment**

Inspect the repository deployment/check run associated with the merged `main` commit. If deployment is not automatic, run the repository's documented `npm run deploy:worker` workflow only after confirming required production environment credentials are already configured.

- [ ] **Step 5: Smoke-test production**

Open `https://parrotbook.com/dubs/five-little-ducks`, confirm the deployed build corresponds to the merge commit, and exercise the grown-up confirmation, project home, empty/generated playback, scene selection, line selection, no-countdown record/save/replay, return home, and responsive desktop/phone views without deleting existing real user data.

- [ ] **Step 6: Mark the goal complete**

Report the PR, merge commit, deployment URL/status, production smoke evidence, and any consciously deferred non-goals. Do not declare completion until merged production is verified.
