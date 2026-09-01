# Nursery-Rhyme Karaoke Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every nursery-rhyme performance a two-beat recording count-in plus score-synchronized word, note, waveform, and playhead guidance across recording and playback, while keeping saved takes microphone-only.

**Architecture:** Consume the package compiler's score-derived line durations, metronome beat, word cues, and melody notes. `AudioContext.currentTime` remains the presentation clock. A prepared microphone session opens before the count-in but starts `MediaRecorder` only from the main-thread downbeat callback. One `DubStudio` presentation value feeds reusable timed-word and melody-lane components on the editor, project playback, and listen-only surfaces.

**Tech Stack:** TypeScript 5.9, React 19, Web Audio API, MediaRecorder, SVG, Tailwind CSS 4, Node `node:test`, Happy DOM, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-nursery-rhyme-karaoke-content-design.md`

**Depends on:** `docs/superpowers/plans/2026-09-01-nursery-rhyme-content-packages.md` merged to `main`.

## Global Constraints

- Consume these exact foundation fields: `DubDefinition.countInBeats`,
  `DubDefinition.countInMidi`, `DubMusicScore.countInBeatMs`,
  `DubMusicScore.countInDurationMs`, `DubLine.durationMs`, `DubLine.words`, and
  `getDubLineMusicPhrase(definition, line).notes`.
- Reuse the foundation playback constant
  `DUB_COUNT_CLICK_DURATION_MS = 200` for both full playback and recording
  count-in; do not infer click length from beat spacing.
- Keep `AudioContext.currentTime` authoritative for audible music and visual guidance. `MediaRecorder.start()` is best-effort main-thread alignment and must not be described or tested as sample-exact.
- Open the microphone before count-in; do not intentionally start capture until the melody downbeat. Never connect melody/count clicks to the microphone stream or saved blob.
- Preserve `echoCancellation: true` and `noiseSuppression: false`.
- Keep the current narrator guide MP3s unchanged and unaligned. A shorter narrator may finish early; an overlong narrator may continue while score guidance freezes.
- Preserve existing pending/saved takes through count-in cancellation or pre-downbeat failure. Replace a pending take only after the new recorder actually starts.
- Preserve consent, privacy, upload, deletion, save-retry, focus, and idempotent cleanup behavior.
- Keep the editor lyric as its route's single `h1`; keep the rhyme title as the single `h1` on project/listen-only pages.
- Do not announce every word or beat in a live region. Do not add focus targets to the lyric, note lane, waveform cursor, or count numbers.
- Keep the melody lane compact inside the existing feedback block, including 640x360 short-wide layout. Add no page CSS.
- Do not add pitch detection, grading, staff notation, tempo/key controls, mixed backing audio, generated vocals, or aligned narrator audio.
- The playback engine supports a scene line range, but the current UI intentionally has no **Play scene** control. Test scene-range timing at the engine boundary; do not reintroduce that control.
- Follow red-green-refactor and commit after every green task.

---

## File Map

- `src/media/speech-recorder.ts`: add a prepared-but-not-started recording session while preserving the immediate-start compatibility API.
- `src/dubbing/dub-playback.ts`: schedule count clicks, downbeat, score-only music duration, and line-relative playback position.
- `src/dubbing/dub-state.ts`: add the unsafe `counting-in` operation and preserve save recovery until the downbeat.
- `src/dubbing/DubKaraokeGuide.tsx`: pure timed-word segmentation plus noninteractive SVG melody contour.
- `src/dubbing/DubTakeWaveform.tsx`: combine waveform, melody lane, and one normalized playhead.
- `src/dubbing/DubStudio.tsx`: coordinate prepared microphone, count-in, recorder downbeat, one presentation state, and every playback surface.
- `src/dubbing/DubSceneEditor.tsx`: render timed words in the existing `h1`, visual count, Cancel, note lane, and recording progress.
- `src/dubbing/DubProjectHome.tsx`: render a compact timed lyric/note guide during full project playback.
- `src/dubbing/DubListenOnly.tsx`: render the same public-guide-only full-playback guidance.
- `src/testing/e2e-browser-mocks.ts`: expose dubbing recorder timestamps/counts without mixing them with lesson recording metrics.
- `tests/speech-recorder.test.mjs`: prepared session lifecycle and unchanged microphone constraints.
- `tests/dub-playback.test.mjs`: score-tempo count-in, downbeat, engine position, overlong guide, and cleanup.
- `tests/dub-state.test.mjs`: unsafe count-in/navigation and delayed recovery clearing.
- `tests/dub-ui.test.mjs`: exact lyric text/accessibility, note geometry, unified presentation, cancellation, and surface behavior.
- `tests/e2e/dubbing.spec.ts`: real browser flow, timing tolerance, privacy, responsive layouts, and reduced motion.

---

### Task 1: Prepare microphone capture without starting it

**Files:**
- Modify: `src/media/speech-recorder.ts`
- Modify: `tests/speech-recorder.test.mjs`

**Interfaces:**

```ts
export type PreparedSpeechRecordingSession = SpeechRecordingSession & {
  start(): void;
};

export function prepareSpeechRecording(
  options?: SpeechRecordingSessionOptions,
): Promise<PreparedSpeechRecordingSession>;
```

`startSpeechRecording(options)` remains and becomes a compatibility wrapper that prepares, calls `start()`, and returns the ordinary `SpeechRecordingSession`. Existing lesson/conversation callers do not change.

- [ ] **Step 1: Add failing prepared-session tests**

Extend the existing fake `MediaRecorder`; do not create a separate incompatible harness. Assert:

```js
const session = await prepareSpeechRecording({
  MediaRecorder: FakeMediaRecorder,
  getUserMedia: async () => stream,
});
assert.equal(recorders[0].state, "inactive");
assert.equal(recorders[0].startCalls, 0);
assert.equal(stream.tracks[0].stopCalls, 0);

session.start();
assert.equal(recorders[0].startCalls, 1);
assert.throws(() => session.start(), /already started|not startable/i);
```

Add cancellation before start: `cancel()` stops the track once, invokes no recorder start/stop, and `session.stop()` rejects with `AbortError`. Add a start-throw test proving stream cleanup. Retain all existing immediate-start, abort, repeated-stop, MIME selection, and chunk tests.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test tests/speech-recorder.test.mjs
```

Expected: `prepareSpeechRecording` is missing.

- [ ] **Step 3: Extract preparation from immediate start**

Move the current microphone request, recorder construction, handlers, result promise, cancellation, and cleanup into `prepareSpeechRecording`. Do not call `recorder.start()` there. Return a one-shot `start()` that catches a start failure, settles/cleans the session, and rethrows.

```ts
export async function startSpeechRecording(
  options: SpeechRecordingSessionOptions = {},
): Promise<SpeechRecordingSession> {
  const prepared = await prepareSpeechRecording(options);
  prepared.start();
  return prepared;
}
```

Keep `MICROPHONE_CONSTRAINTS` byte-for-byte equivalent:

```ts
audio: { echoCancellation: true, noiseSuppression: false }
```

- [ ] **Step 4: Run the focused test and verify GREEN**

```bash
node --test tests/speech-recorder.test.mjs
```

- [ ] **Step 5: Commit the prepared recorder**

```bash
git add src/media/speech-recorder.ts tests/speech-recorder.test.mjs
git commit -m "feat: prepare microphone before dub capture"
```

---

### Task 2: Schedule two count beats and expose score-relative playback position

**Files:**
- Modify: `src/dubbing/dub-playback.ts`
- Modify: `src/dubbing/dub-state.ts`
- Modify: `tests/dub-playback.test.mjs`
- Modify: `tests/dub-state.test.mjs`

**Interfaces:**

```ts
export type DubPlaybackPosition = Readonly<{
  line: DubLine;
  lineElapsedMs: number | null;
}>;

export type PreparedDubLineBacking = {
  countInDurationMs: number;
  durationMs: number;
  start(): void;
  stop(): void;
};
```

Extend prepared-backing options with `onCountIn?(remainingBeats: number)`, `onDownbeat?()`, and the existing `onTick(elapsedMs)`. Extend `startDubPlayback`'s callback to `onTick(elapsedMs, position)` while preserving the first numeric argument.

- [ ] **Step 1: Add failing count-in scheduler tests**

Reuse the existing fake AudioContext/RAF harness. For a definition with
`countInBeats: 2`, `countInMidi: 67`, `music.countInBeatMs: 500`, and
`music.countInDurationMs: 1_000`, assert:

```js
assert.equal(backing.countInDurationMs, 1_000);
backing.start();
assert.deepEqual(counts, [2]);
assert.equal(melody[0].startTimes[0], startAt + 1);
assert.equal(phraseTerminal.stopTimes[0], startAt + 1 + line.durationMs / 1_000);
```

Assert no presentation tick fires during count-in. Advance the first unconnected beat marker and assert `counts` becomes `[2, 1]`; advance the downbeat marker and assert `onDownbeat` fires once and the first presentation tick is zero. Verify exactly two audible count clicks at one-beat spacing. Assert each click stops exactly `DUB_COUNT_CLICK_DURATION_MS` after its start, and that full playback uses the same constant.

Use unconnected scheduled oscillators as beat/downbeat main-thread markers. Give markers a nonzero frequency so the current E2E harness does not mistake them for the held phrase terminal.

- [ ] **Step 2: Add failing cancellation/failure tests**

Stop/abort before downbeat and assert no `onDownbeat`, `onEnded`, or late count callback; all marker handlers are removed and context/nodes close once. Throw from `onCountIn`, `onDownbeat`, and `onTick` in separate cases and assert `onFailure` plus idempotent cleanup.

- [ ] **Step 3: Add failing playback-position tests**

For full playback, assert time before the first bookmark returns `{ line: firstLine, lineElapsedMs: null }`; line boundaries select the correct line; time after a phrase clamps to `line.durationMs`. For a scene range and a one-line range, assert elapsed values are scope-relative but returned positions are line-relative.

Decode an intentionally overlong one-line guide and assert the playback operation continues to its decoded tail while:

- music ends at the authored score boundary;
- `lineElapsedMs` freezes at `line.durationMs`; and
- no artificial musical outro is synthesized to fill the narrator tail.

Decode an intentionally short guide and assert playback, music, and guidance
continue to the authored score boundary after narration ends, with
`lineElapsedMs` reaching `line.durationMs`. Together the two fixtures define
operation duration as the longer of decoded narration and the score scope,
without stretching either clock.

- [ ] **Step 4: Add failing reducer tests**

Add `counting-in` to the expected operations. Assert selection/back/navigation stay unchanged during it. Starting `mic-opening` and `counting-in` preserves `saveRecovery` and its message; starting `recording` clears both because the replacement take has genuinely begun.

- [ ] **Step 5: Run focused tests and verify RED**

```bash
node --test tests/dub-playback.test.mjs tests/dub-state.test.mjs
```

- [ ] **Step 6: Implement count scheduling on the AudioContext clock**

Extract count-click scheduling so full playback and prepared recording share the score's `countInBeatMs`. In `prepareDubLineBacking` compute:

```ts
const countInDurationMs = definition.music.countInDurationMs;
const startAt = context.currentTime;
const downbeatAt = startAt + countInDurationMs / 1_000;
```

For schema version 1, schedule clicks at `startAt` and
`startAt + countInBeatMs / 1000`, using `definition.countInMidi`; schedule the
click stops with `DUB_COUNT_CLICK_DURATION_MS`, the melody at `downbeatAt`,
and the phrase terminal at
`downbeatAt + line.durationMs / 1000`. Assert the number of click boundaries
matches `definition.countInBeats`. Using the separately compiled final
duration boundary preserves 333/334ms rounding. Do not call `onTick` during
count-in; call it with zero at downbeat, then report line-relative elapsed.
`MediaRecorder` is not touched in this module.

- [ ] **Step 7: Implement score-relative playback positions**

Derive position from the definition's authored cues on every existing playback RAF tick. Clamp only `lineElapsedMs`, not the decoded voice/playback elapsed. Pass the authored score scope—not decoded narrator-tail duration—into `scheduleDubMusic`. Keep the operation alive until `max(decodedAudioDuration, scoreScopeDuration)`, while music/guidance run to the score boundary and overlong narration may finish afterward. Schedule explicit score outro notes only for scene/full ranges that reach the outro; one-line Hear/take playback and recording end their music at `line.durationMs`.

- [ ] **Step 8: Add the reducer operation**

Add `"counting-in"` to `DubOperation` and `DUB_UNSAFE_OPERATIONS`. In `OPERATION_STARTED`, preserve recovery/error through `mic-opening`, `counting-in`, guide playback, and take playback; clear recovery/error when `recording` begins.

- [ ] **Step 9: Run focused tests and verify GREEN**

```bash
node --test tests/dub-playback.test.mjs tests/dub-state.test.mjs
```

- [ ] **Step 10: Commit the shared clock contract**

```bash
git add src/dubbing/dub-playback.ts src/dubbing/dub-state.ts tests/dub-playback.test.mjs tests/dub-state.test.mjs
git commit -m "feat: add score-timed dub count-in"
```

---

### Task 3: Build exact timed words and the compact melody lane

**Files:**
- Create: `src/dubbing/DubKaraokeGuide.tsx`
- Modify: `src/dubbing/DubTakeWaveform.tsx`
- Modify: `src/dubbing/DubSceneEditor.tsx`
- Modify: `tests/dub-ui.test.mjs`

**Interfaces:**

```ts
export function DubTimedWords(props: {
  line: DubLine;
  elapsedMs: number | null;
}): ReactNode;

export function DubMelodyLane(props: {
  definition: DubDefinition;
  line: DubLine;
  elapsedMs: number | null;
  showPlayhead?: boolean;
}): ReactNode;
```

Keep pure, exported helpers beside the components:

```ts
export type DubWordState = "future" | "active" | "past";
export type DubTimedWordSegment = Readonly<
  | { kind: "text"; text: string }
  | {
      kind: "word";
      text: string;
      startOffset: number;
      endOffset: number;
      state: DubWordState;
    }
>;
export type DubMelodyRect = Readonly<{
  noteIndex: number;
  atMs: number;
  durationMs: number;
  x: number;
  width: number;
  y: number;
}>;
export type DubGuidancePosition = Readonly<{
  lineId: string | null;
  elapsedMs: number | null;
}>;
export function getDubTimedWordSegments(line: DubLine, elapsedMs: number | null): readonly DubTimedWordSegment[];
export function getDubMelodyGeometry(definition: DubDefinition, line: DubLine): readonly DubMelodyRect[];
export function getActiveDubMelodyNoteIndex(definition: DubDefinition, line: DubLine, elapsedMs: number | null): number | null;
export function getDubPlayheadPercent(line: DubLine, elapsedMs: number | null): number | null;
```

- [ ] **Step 1: Add failing exact-text and boundary tests**

Use a lyric with leading/inter-word spacing, a curly apostrophe, comma, and exclamation mark. Assert segment text reassembles byte-for-byte to `line.text`. At `atMs` the word becomes active; at `atMs + durationMs` it becomes past; during a rest gap there is no active word. With absent/invalid cues, return one static complete-text segment.

Render `DubTimedWords` inside an `h1` and assert `textContent` remains
byte-for-byte equal to the authored lyric at every boundary. Accessibility
APIs normalize repeated/leading whitespace, so assert the heading's accessible
name is the complete lyric after standard whitespace collapse. Assert only the
active word has `aria-current="true"`; nothing has `aria-live`,
`role="status"`, or a tab stop.

- [ ] **Step 2: Add failing note-geometry tests**

Assert note x/width are normalized by `line.durationMs`, y is normalized by line pitch range, one-pitch phrases center every rectangle, and every value is finite. Assert the active-note boundary and normalized playhead clamp from 0 through 100 percent. With no melody notes, render no lane.

- [ ] **Step 3: Run the focused test and verify RED**

```bash
node --test tests/dub-ui.test.mjs
```

- [ ] **Step 4: Implement exact timed word slices**

Iterate generated offsets in order. Emit untouched text nodes for every gap
and punctuation segment; wrap only the exact word slices. If
`elapsedMs === null`, mark every word `future` and omit active/playhead state;
otherwise determine state with
`elapsedMs >= atMs && elapsedMs < atMs + durationMs`. Give the active word
weight plus underline/background/shape using Tailwind utilities, so state is
not color-only. Do not animate or announce word changes.

- [ ] **Step 5: Implement the hidden SVG contour**

Render an `aria-hidden="true"`, `focusable="false"`, noninteractive SVG. Use horizontal note start/duration, inverse vertical MIDI pitch, a non-color active stroke/shape, and an optional vertical playhead. When all pitches match, use the viewBox midpoint. Add no transitions, satisfying reduced motion by construction.

- [ ] **Step 6: Combine waveform, lane, and one cursor**

Change `DubTakeWaveform` to receive `{ blob, definition, elapsedMs, line,
recordingStream }`. Read the compiler's phrase-duration-aligned peaks from
`line.guidePeakBars` and duration from `line.durationMs`. Place the lane below
existing waveforms in the same fixed-height, accessible **Waveform and melody
guide** group. Render one absolute, `aria-hidden` playhead across both waveform
and lane using the normalized elapsed value; call `DubMelodyLane` with
`showPlayhead={false}` there. Preserve analyser/decode fallbacks.

In this same step adapt the existing `DubSceneEditor` call to pass its current
`definition`, `activeLine`, and `recordingElapsedMs` under the new prop names.
Do not add count-in or timed heading behavior yet. This keeps the Task 3 commit
green while Task 4 changes the coordinator.

- [ ] **Step 7: Run the focused test and verify GREEN**

```bash
node --test tests/dub-ui.test.mjs tests/dub-waveform.test.mjs
```

- [ ] **Step 8: Commit reusable karaoke presentation**

```bash
git add src/dubbing/DubKaraokeGuide.tsx src/dubbing/DubTakeWaveform.tsx src/dubbing/DubSceneEditor.tsx tests/dub-ui.test.mjs
git commit -m "feat: render dub lyric and melody guidance"
```

---

### Task 4: Coordinate count-in and one presentation value in `DubStudio`

**Files:**
- Modify: `src/dubbing/DubStudio.tsx`
- Modify: `src/dubbing/DubSceneEditor.tsx`
- Modify: `tests/dub-ui.test.mjs`

**Local presentation contract:**

```ts
type DubPresentation = DubGuidancePosition & Readonly<{
  countInBeat: number | null;
}>;
```

In this task replace `recordingElapsedMs` with this value for recording/count-in and keep the existing `playbackLineIndex` temporarily unchanged. Task 5 converts every playback callback and then removes `playbackLineIndex`, leaving the single presentation value. The selected line plus `elapsedMs: null` is the idle/initial visual state.

- [ ] **Step 1: Add failing coordinated recording tests**

Extend the current Happy DOM studio harness. Assert the exact order:

1. Record opens the microphone and prepares backing.
2. Operation becomes `counting-in`, visual count is `2`, and recorder start count is zero.
3. Next beat shows `1`; recorder remains inactive.
4. Downbeat calls the prepared session's `start()` once, changes to `recording`, and begins elapsed zero/first word/first note together.

Assert the waveform receives the microphone stream only in `recording`, never in `mic-opening` or `counting-in`.

- [ ] **Step 2: Add failing preservation/cancellation tests**

Seed an existing pending preview plus `saveRecovery`. Cancel during count-in and assert the old blob, object URL, pending line ID, saved state, and recovery remain; new stream/backing close once; no upload occurs; Record regains focus. Repeat for melody/downbeat/recorder-start failure before capture. After a successful recorder start, assert the old preview is revoked exactly once and new pending identity takes over.

Keep early Stop after downbeat saving a partial take. If the existing
consent-loss handler is invoked, keep that path, unmount, and repeated cleanup
idempotent; do not add count-in polling or a new revocation signal.

- [ ] **Step 3: Add failing editor behavior tests**

During count-in assert visible `Count-in 2` then `Count-in 1`, an enabled button named **Cancel count-in**, locked Hear/Previous/Next/header navigation, no recording timer, and initial lyric/note state. During recording assert the existing full lyric remains the `h1` accessible name and the unified elapsed prop advances its word/lane/waveform guidance. Hear/take/full callback conversion is tested in Task 5.

- [ ] **Step 4: Run the focused test and verify RED**

```bash
node --test tests/dub-ui.test.mjs
```

- [ ] **Step 5: Replace split timing state and reset it centrally**

Create `resetPresentation()` and call it from `cancelMedia`, selection changes,
recording completion, the existing consent-loss cleanup path, failure, and
unmount. Feed recording backing ticks into the presentation setter; never
create a React interval or `Date.now()` clock. Leave current playback-index
updates in place until Task 5.

- [ ] **Step 6: Preserve the old take until a real downbeat start**

At Record, call `cancelMedia(false)` and retain old pending refs/preview. Await
the backing and `prepareSpeechRecording`, verify the generation is still
current, assign both `recordingBackingRef.current` and
`recordingSessionRef.current`, dispatch `counting-in`, and only then call
`backing.start()`. If preparation or `backing.start()` fails, clear only the
new refs/resources and preserve the old take. Inside `onDownbeat`:

```ts
session.start();
clearTakePreview();
pendingBlobRef.current = null;
pendingLineIdRef.current = line.id;
setPresentation({ lineId: line.id, elapsedMs: 0, countInBeat: null });
dispatch({ type: "OPERATION_STARTED", operation: "recording" });
```

Only run the destructive preview replacement after `session.start()` succeeds. Track whether downbeat capture began so failure cleanup uses `cancelMedia(false)` before start and discards only the new attempt after start.

- [ ] **Step 7: Make Record become Cancel during count-in**

In `handleRecord`, when operation is `counting-in`, cancel the prepared
session/backing without discarding the prior take, dispatch
`OPERATION_FINISHED`, reset presentation, and restore Record focus. Include
`counting-in` in unsafe navigation/media guards. In `DubSceneEditor`, override
the Record button's disabled value only when it is the **Cancel count-in**
action; Hear, take playback, Previous/Next, header navigation, and every other
media action remain locked.

- [ ] **Step 8: Render count-in and guidance in the existing editor structure**

Render `DubTimedWords` inside the current line `h1`. Pass line/definition/unified elapsed to `DubTakeWaveform`. In the feedback block, show the non-live count text and no timer before downbeat. Use understandable stable status copy such as “Get ready. Recording starts after two beats.” rather than live-announcing `2` and `1`.

- [ ] **Step 9: Run the focused test and verify GREEN**

```bash
node --test tests/dub-ui.test.mjs tests/dub-state.test.mjs tests/speech-recorder.test.mjs tests/dub-playback.test.mjs
```

- [ ] **Step 10: Commit recording coordination**

```bash
git add src/dubbing/DubStudio.tsx src/dubbing/DubSceneEditor.tsx tests/dub-ui.test.mjs
git commit -m "feat: coordinate dub recording after count-in"
```

---

### Task 5: Use the same guidance on every actual playback surface

**Files:**
- Modify: `src/dubbing/DubStudio.tsx`
- Modify: `src/dubbing/DubProjectHome.tsx`
- Modify: `src/dubbing/DubListenOnly.tsx`
- Modify: `tests/dub-ui.test.mjs`
- Modify: `tests/dub-playback.test.mjs`

- [ ] **Step 1: Add failing Hear/take/full playback tests**

Assert Hear line and Play my recording consume `DubPlaybackPosition` and update the editor's same timed words/note lane/playhead. For an overlong narrator, assert the operation stays `guide-playing` after the phrase while the visual elapsed freezes at `line.durationMs`.

For project and listen-only full playback, assert the active illustrated line, ordinary lyric caption, word state, and compact lane change from one playback position. Keep the rhyme title as the only `h1`; the caption is not live. Listen-only must still make zero microphone/private-audio/upload/object-URL calls.

- [ ] **Step 2: Assert no scene-control regression**

Keep the existing rendered assertions that **Play scene** is absent. In `tests/dub-playback.test.mjs`, retain engine-only scene-range position coverage from Task 2.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
node --test tests/dub-ui.test.mjs tests/dub-playback.test.mjs
```

- [ ] **Step 4: Feed all playback callbacks into one presentation value**

For Hear/take callbacks, use the returned `position.line.id` and clamped `position.lineElapsedMs`. For full playback, use the same position instead of locally recomputing a line from elapsed time. Remove `playbackLineIndex`, derive illustrated scene/line numbers from `presentation.lineId`, and clear presentation on stop/end/error. Retain decoded playback elapsed internally only for engine lifecycle; do not expose it as score guidance. This step completes the single-presentation-state migration started in Task 4.

- [ ] **Step 5: Render the compact full-playback guide**

Import the shared type from `DubKaraokeGuide.tsx` and add this exact prop to
both `DubProjectHome` and `DubListenOnly`:

```ts
guidance?: DubGuidancePosition | null;
```

Resolve `guidance.lineId` through the passed definition. During active full
playback, render `DubTimedWords` in ordinary caption text and
`DubMelodyLane` below the illustrated stage. A valid line with
`elapsedMs: null` renders its initial lyric/lane state before the first cue;
hide the compact guide only when the line ID is null/unknown. Its defensive
fallback must never block audio.

- [ ] **Step 6: Run focused tests and verify GREEN**

```bash
node --test tests/dub-ui.test.mjs tests/dub-playback.test.mjs
```

- [ ] **Step 7: Commit shared playback guidance**

```bash
git add src/dubbing/DubStudio.tsx src/dubbing/DubProjectHome.tsx src/dubbing/DubListenOnly.tsx tests/dub-ui.test.mjs tests/dub-playback.test.mjs
git commit -m "feat: show karaoke guidance during dub playback"
```

---

### Task 6: Verify browser timing, privacy, accessibility, and responsive layout

**Files:**
- Modify: `src/testing/e2e-browser-mocks.ts`
- Modify: `tests/e2e/dubbing.spec.ts`

- [ ] **Step 1: Add failing dub-only recorder metrics**

Extend `__parrotE2eDub.snapshot()` with dubbing `MediaRecorder` start/stop
timestamps and counts, dubbing microphone-track stop count, AudioContext
created/close/double-close counts, and scheduled backing evidence. Keep
lesson/conversation metrics separate. Add exact dub scenarios
`recorder-start-failed` (the dub `MockMediaRecorder.start()` throws) and
`melody-start-failed` (the first scheduled triangle melody oscillator throws);
neither scenario may affect lesson recorders. Retain the AudioContext mock's
20× clock and expose only this behavioral evidence.

- [ ] **Step 2: Add failing deterministic count-in flow**

Install/pause Playwright's page clock before creating the AudioContext. Press
Record, assert `Count-in 2`, and assert recorder start count remains zero.
Because the existing mock advances AudioContext time at 20×, advance the page
clock by `countInBeatMs / 20`, assert `Count-in 1` and still zero starts, then
advance by `(countInDurationMs - countInBeatMs) / 20` to the exact rounded
downbeat boundary and assert:

- button changes from **Cancel count-in** to **Stop recording**;
- timer begins at 0;
- active word and recording timer begin with the scheduled melody evidence;
  pure component/engine tests, not browser-only hooks, prove hidden note and
  playhead geometry at the same zero boundary; and
- recorder start count becomes one.

Explicitly advance the paused page clock by `line.durationMs / 20` after the
downbeat. Assert `(stopWallMs - startWallMs) * 20` equals `line.durationMs`
within a documented small tolerance. Also assert the recorder start timestamp
occurs only after `countInDurationMs / 20`, so the complete authored count-in
is excluded.

- [ ] **Step 3: Add failing cancellation and privacy flows**

Cancel during `2` and during `1`; assert zero upload/blob, exactly one normal
dub track stop and context close, no double close, previous take retained, and
Record focused. Exercise both injected recorder/melody failure scenarios and
assert they upload nothing. Retain the microphone-only saved-stream assertion
and exact constraints.

In listen-only mode, assert zero microphone requests, private fetches, uploads, and object URLs while public full playback still advances word/note guidance.

- [ ] **Step 4: Add actual-surface accessibility coverage**

Through accessible heading/text/button/group locators, cover Record, Hear line,
Play my recording, project full playback, and listen-only full playback.
Assert the editor heading's normalized accessible name is always the complete
lyric, the project/listen heading is always the rhyme title, active-word
semantics change at authored boundaries, and no word/count becomes a live
announcement or focus target. Locate the hidden SVG only through the visible
accessible **Waveform and melody guide** container for reachability; active
note/playhead math remains in pure unit tests because those graphics are
intentionally absent from the accessibility tree.

- [ ] **Step 5: Extend responsive and reduced-motion loops**

At 280x568 and 320x480, use `scrollIntoViewIfNeeded` to prove the complete
lyric, feedback group, count/record controls, navigation, and errors are all
vertically reachable, with no horizontal overflow. At 640x360 short-wide,
assert the stage, lyric, feedback group/lane, and controls are simultaneously
contained without a nested panel scrollbar. Repeat no-horizontal-overflow and
reachability checks on desktop. Under `prefers-reduced-motion: reduce`, advance
score time and assert discrete active-word change plus idempotent stop/cancel
cleanup; playhead discreteness remains covered by its pure helper test.

- [ ] **Step 6: Run focused browser tests and verify GREEN**

```bash
npx playwright test tests/e2e/dubbing.spec.ts
```

- [ ] **Step 7: Commit browser coverage**

```bash
git add src/testing/e2e-browser-mocks.ts tests/e2e/dubbing.spec.ts
git commit -m "test: cover dub karaoke timing and privacy"
```

---

### Task 7: Verify and merge the karaoke milestone through a PR

**Files:**
- No production changes unless verification exposes a defect.

- [ ] **Step 1: Run repository hygiene and focused suites**

```bash
npm run check:rhyme-catalog
git diff --check
node --test tests/speech-recorder.test.mjs tests/dub-playback.test.mjs tests/dub-state.test.mjs tests/dub-waveform.test.mjs tests/dub-ui.test.mjs
```

- [ ] **Step 2: Run complete verification**

```bash
npm run test
npm run lint
npm run build
npm run test:browser
```

Expected: every command exits 0. Record output and the exact final commit; do not rely on results from an earlier commit.

- [ ] **Step 3: Audit the non-negotiable audio/privacy boundaries**

```bash
rg -n "echoCancellation|noiseSuppression|prepareSpeechRecording|counting-in|countInBeatMs" src tests
```

Confirm from tests that count-in/melody never enter the recorder stream, capture starts only at best-effort downbeat, listen-only opens no private media, and narrator audio remains untouched.

- [ ] **Step 4: Request independent review**

Use `superpowers:requesting-code-review`. Resolve every correctness, timing, accessibility, or privacy finding. Rerun affected focused tests and then rerun the complete commands at the new final HEAD.

- [ ] **Step 5: Finish through a pull request**

Use `superpowers:finishing-a-development-branch`. Push the dependent feature branch, open a PR targeting `main`, wait for required checks, merge only through the PR, and confirm the merged commit is present on `main`.
