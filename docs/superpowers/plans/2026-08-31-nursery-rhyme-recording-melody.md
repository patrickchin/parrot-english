# Nursery-Rhyme Recording Melody Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every nursery-rhyme line recording start with its authored melody and stop at that melody phrase's exact duration, while keeping saved takes voice-only.

**Architecture:** Resolve every canonical dub line to one definition-owned music phrase and use that phrase as the only recording-duration authority. Reuse the existing Web Audio scheduler for guide/take playback, add a prepared music-only line player for the recording hot path, and coordinate it with the existing microphone-only MediaRecorder lifecycle in `DubStudio`.

**Tech Stack:** TypeScript 5.9, React 19, Web Audio API, MediaRecorder, Node `node:test`, Happy DOM, Playwright, Vite 8, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-08-31-nursery-rhyme-recording-melody-design.md`

## Global Constraints

- Apply the shared behavior to all six definitions in `DUB_DEFINITIONS`.
- Keep uploaded and pending takes microphone-only; never route the melody into the recorded stream.
- Add no runtime dependency, generation service, generated audio, or new media asset.
- Add no learner-facing music toggle, tempo/key/instrument control, shelf autoplay, or line-level count-in.
- Keep the existing full-rhyme count-in, lyrics, notes, guide voices, artwork, routes, consent, storage, deletion, and API contracts unchanged.
- Preserve Tailwind 4 component styling and shared UI controls; do not add page CSS.
- Preserve accessible names, early Stop behavior, save recovery, focus restoration, cancellation, and idempotent cleanup.
- Use Playwright accessible locators and rendered behavior assertions; never assert CSS source or class names.
- Follow strict red-green-refactor for every production behavior change.

---

## File Map

- `src/dubbing/rhyme-catalog.ts`: owns canonical line-to-phrase resolution and the `DubDefinition` contract.
- `src/dubbing/dub-script.ts`: owns Five Little Ducks content; loses the obsolete fixed recording-duration constant.
- `src/dubbing/dub-playback.ts`: owns full/scene/line Web Audio scheduling and the prepared music-only line player.
- `src/dubbing/DubStudio.tsx`: coordinates guide, take, microphone, backing, upload, abort, and focus lifecycles.
- `src/dubbing/DubSceneEditor.tsx`: renders phrase-derived duration and recording copy.
- `src/dubbing/DubTakeWaveform.tsx`: scales live and decoded waveforms to the selected phrase duration.
- `src/testing/e2e-browser-mocks.ts`: exposes backing-start evidence to Playwright without testing implementation classes.
- `tests/dub-catalog.test.mjs`: protects the single phrase resolver and absence of a fixed duration.
- `tests/dub-playback.test.mjs`: protects line backing timing, synchronization, failure, and cleanup.
- `tests/dub-state.test.mjs`: removes the retired fixed-duration assertion.
- `tests/dub-ui.test.mjs`: protects phrase-derived rendered UI and coordinated studio behavior.
- `tests/dub-waveform.test.mjs`: protects two-, four-, and eight-second waveform scaling.
- `tests/e2e/dubbing.spec.ts`: protects the accessible browser recording flow and all shared rhyme routes.

---

### Task 1: Make the authored phrase the only line-duration authority

**Files:**
- Modify: `src/dubbing/rhyme-catalog.ts:27-47,245-249`
- Modify: `tests/dub-catalog.test.mjs:3-12,207-258`

**Interfaces:**
- Consumes: `DubDefinition.music.linePhrases`, `DubDefinition.lines`, and `DubDefinition.linesPerScene`.
- Produces: `getDubLineMusicPhrase(definition: DubDefinition, line: DubLine): DubMelodyPhrase`.

- [ ] **Step 1: Write failing canonical resolver tests**

Add `getDubLineMusicPhrase` to the imports in `tests/dub-catalog.test.mjs`, then add this test inside the catalog suite:

```js
it("resolves every canonical line to its one authored recording phrase", () => {
  assert.deepEqual(
    OLD_MACDONALD_DUB.lines.map((line) =>
      getDubLineMusicPhrase(OLD_MACDONALD_DUB, line).durationMs),
    [
      8_000, 8_000, 2_000, 2_000, 2_000, 2_000, 8_000,
      8_000, 8_000, 2_000, 2_000, 2_000, 2_000, 8_000,
      8_000, 8_000, 2_000, 2_000, 2_000, 2_000, 8_000,
      8_000, 8_000, 2_000, 2_000, 2_000, 2_000, 8_000,
      8_000, 8_000, 2_000, 2_000, 2_000, 2_000, 8_000,
    ],
  );

  for (const definition of DUB_DEFINITIONS) {
    for (const line of definition.lines) {
      const phrase = getDubLineMusicPhrase(definition, line);
      assert.ok(definition.music.linePhrases.includes(phrase));
    }
  }

  assert.throws(
    () => getDubLineMusicPhrase(TWINKLE_TWINKLE_DUB, { ...TWINKLE_TWINKLE_DUB.lines[0] }),
    /canonical dub line/,
  );
  assert.throws(
    () => getDubLineMusicPhrase({
      ...TWINKLE_TWINKLE_DUB,
      music: {
        ...TWINKLE_TWINKLE_DUB.music,
        linePhrases: TWINKLE_TWINKLE_DUB.music.linePhrases.slice(0, 1),
      },
    }, TWINKLE_TWINKLE_DUB.lines[0]),
    /one phrase per line or scene line/,
  );
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test tests/dub-catalog.test.mjs
```

Expected: `tests/dub-catalog.test.mjs` fails because `getDubLineMusicPhrase` is not exported.

- [ ] **Step 3: Implement the canonical resolver**

Import `DubMelodyPhrase` as a type in `rhyme-catalog.ts` and add:

```ts
export function getDubLineMusicPhrase(
  definition: DubDefinition,
  line: DubLine,
): DubMelodyPhrase {
  const lineIndex = definition.lines.indexOf(line);
  if (lineIndex < 0) throw new TypeError("Dub music requires one canonical dub line.");

  const phraseCount = definition.music.linePhrases.length;
  const phraseIndex = phraseCount === definition.lines.length
    ? lineIndex
    : phraseCount === definition.linesPerScene
      ? lineIndex % definition.linesPerScene
      : -1;
  if (phraseIndex < 0) {
    throw new TypeError("Dub music must define one phrase per line or scene line.");
  }

  const phrase = definition.music.linePhrases[phraseIndex];
  if (!phrase) {
    throw new TypeError("Dub music must define one phrase per line or scene line.");
  }
  return phrase;
}
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
node --test tests/dub-catalog.test.mjs
```

Expected: the catalog file passes.

- [ ] **Step 5: Commit the domain contract**

```bash
git add src/dubbing/rhyme-catalog.ts tests/dub-catalog.test.mjs
git commit -m "refactor: derive dub timing from melody phrases"
```

---

### Task 2: Add prepared music-only line playback

**Files:**
- Modify: `src/dubbing/dub-playback.ts:11-35,133-214,250-475`
- Modify: `tests/dub-playback.test.mjs:5-13,118-246,290-443,1083-1510`

**Interfaces:**
- Consumes: `getDubLineMusicPhrase(definition, line)` from Task 1.
- Produces: `PreparedDubLineBacking` with `durationMs: number`, synchronous `start(): void`, and idempotent `stop(): void`.
- Produces: `prepareDubLineBacking(options): Promise<PreparedDubLineBacking>`.
- Preserves: `startDubPlayback(options): Promise<{ stop(): void }>` and `scheduleDubAudio(options)`.

- [ ] **Step 1: Write failing prepared-backing timing tests**

Extend the existing fake AudioContext and RAF harness rather than creating a second unrelated fake. Import `prepareDubLineBacking`, then add:

```js
it("prepares an exact two-second line backing without fetching audio", async () => {
  const audio = createAudioHarness();
  const raf = createRaf();
  const line = OLD_MACDONALD_DUB.lines[2];
  let ended = 0;
  const ticks = [];

  const backing = await prepareDubLineBacking({
    AudioContext: audio.AudioContext,
    cancelAnimationFrame: raf.cancelAnimationFrame,
    definition: OLD_MACDONALD_DUB,
    line,
    onEnded: () => { ended += 1; },
    onTick: (elapsedMs) => ticks.push(elapsedMs),
    requestAnimationFrame: raf.requestAnimationFrame,
  });

  assert.equal(backing.durationMs, 2_000);
  assert.equal(audio.fetchCalls.length, 0);
  assert.equal(audio.contexts[0].oscillators.length, 0);
  backing.start();

  const context = audio.contexts[0];
  const melody = context.oscillators.filter(({ type }) => type === "triangle");
  assert.equal(context.resumeCalls, 1);
  assert.equal(melody[0].startTimes[0], 10);
  context.currentTime = 12;
  raf.runNext();
  assert.equal(ended, 1);
  assert.equal(ticks.at(-1), 2_000);
  assert.equal(context.closeCalls, 1);
});
```

Add explicit lifecycle and setup-failure tests:

```js
it("closes a prepared line backing once across stop and abort", async () => {
  const audio = createAudioHarness();
  const raf = createRaf();
  const controller = new AbortController();
  const backing = await prepareDubLineBacking({
    AudioContext: audio.AudioContext,
    cancelAnimationFrame: raf.cancelAnimationFrame,
    line: DUB_LINES[0],
    requestAnimationFrame: raf.requestAnimationFrame,
    signal: controller.signal,
  });

  backing.start();
  backing.stop();
  const scheduledStopCounts = audio.contexts[0].oscillators.map(({ stopCalls }) => stopCalls);
  backing.stop();
  controller.abort();

  assert.equal(audio.contexts[0].closeCalls, 1);
  assert.deepEqual(
    audio.contexts[0].oscillators.map(({ stopCalls }) => stopCalls),
    scheduledStopCounts,
  );
  assert.equal(raf.callbacks.size, 0);
});

it("closes the prepared context when melody scheduling fails", async () => {
  const failure = new Error("music setup failed");
  const audio = createAudioHarness({ oscillatorStopFailure: failure });
  const backing = await prepareDubLineBacking({
    AudioContext: audio.AudioContext,
    line: DUB_LINES[0],
  });

  assert.throws(() => backing.start(), /music setup failed/);
  assert.equal(audio.contexts[0].closeCalls, 1);
  backing.stop();
  assert.equal(audio.contexts[0].closeCalls, 1);
});
```

- [ ] **Step 2: Run the focused playback test and verify RED**

Run:

```bash
node --test tests/dub-playback.test.mjs
```

Expected: the file fails because `prepareDubLineBacking` and `PreparedDubLineBacking` do not exist.

- [ ] **Step 3: Reuse the catalog resolver in the existing scheduler**

Replace `scheduleDubMusic`'s local phrase-count/index logic with:

```ts
const getPhrase = (line: DubLine) => getDubLineMusicPhrase(definition, line);
```

Use `getPhrase(line)` in the scheduling loop and for the final phrase. Keep the current count-in only when the canonical full dub is selected.

- [ ] **Step 4: Implement the prepared line-backing lifecycle**

Add these public contracts beside the current playback option types:

```ts
export type PreparedDubLineBacking = {
  durationMs: number;
  start(): void;
  stop(): void;
};

type PrepareDubLineBackingOptions = {
  AudioContext?: typeof globalThis.AudioContext;
  cancelAnimationFrame?: typeof globalThis.cancelAnimationFrame;
  definition?: DubDefinition;
  line: DubLine;
  onEnded?: () => void;
  onTick?: (elapsedMs: number) => void;
  requestAnimationFrame?: typeof globalThis.requestAnimationFrame;
  signal?: AbortSignal;
};
```

Implement `prepareDubLineBacking` with the existing `scheduleDubMusic`, `stopNode`, abort-error, and context-close patterns:

```ts
export async function prepareDubLineBacking({
  AudioContext: AudioContextClass = globalThis.AudioContext,
  cancelAnimationFrame: cancelFrame = globalThis.cancelAnimationFrame,
  definition = FIVE_LITTLE_DUCKS_DUB,
  line,
  onEnded,
  onTick = () => {},
  requestAnimationFrame: requestFrame = globalThis.requestAnimationFrame,
  signal,
}: PrepareDubLineBackingOptions): Promise<PreparedDubLineBacking> {
  const phrase = getDubLineMusicPhrase(definition, line);
  const context = new AudioContextClass();
  let frameId: number | null = null;
  let oscillators: OscillatorNode[] = [];
  let started = false;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (frameId !== null) cancelFrame(frameId);
    oscillators.forEach(stopNode);
    signal?.removeEventListener("abort", stop);
    void context.close().catch(() => undefined);
  };

  signal?.addEventListener("abort", stop, { once: true });
  try {
    if (signal?.aborted) throw createAbortError();
    await context.resume();
    if (signal?.aborted) throw createAbortError();
  } catch (error) {
    stop();
    throw error;
  }

  return {
    durationMs: phrase.durationMs,
    start() {
      if (started || stopped) throw new Error("Dub line backing is not startable.");
      started = true;
      const master = context.createGain();
      master.gain.value = 0.95;
      master.connect(context.destination);
      const music = context.createGain();
      music.gain.value = definition.music.volume;
      music.connect(master);
      const startAt = context.currentTime;
      try {
        oscillators = scheduleDubMusic(
          context,
          definition,
          [line],
          line.cueMs,
          phrase.durationMs,
          music,
          startAt,
        );
      } catch (error) {
        stop();
        throw error;
      }
      const tick = () => {
        frameId = null;
        const elapsedMs = Math.min(
          phrase.durationMs,
          Math.max(0, (context.currentTime - startAt) * 1_000),
        );
        onTick(elapsedMs);
        if (elapsedMs >= phrase.durationMs) {
          stop();
          onEnded?.();
          return;
        }
        frameId = requestFrame(tick);
      };
      onTick(0);
      frameId = requestFrame(tick);
    },
    stop,
  };
}
```

Keep cleanup idempotent if the concrete implementation needs a guarded `closePromise`; do not swallow setup failures or call `onEnded` for manual stop/abort.

- [ ] **Step 5: Run playback tests and verify GREEN**

Run:

```bash
node --test tests/dub-playback.test.mjs
```

Expected: every existing full/scene test and every new prepared-backing test passes.

- [ ] **Step 6: Commit the Web Audio capability**

```bash
git add src/dubbing/dub-playback.ts tests/dub-playback.test.mjs
git commit -m "feat: prepare phrase-length dub backing"
```

---

### Task 3: Synchronize recording, guide, take, timer, and waveform

**Files:**
- Modify: `src/dubbing/rhyme-catalog.ts:34-47,88-243`
- Modify: `src/dubbing/dub-script.ts:4-9,84-98`
- Modify: `src/dubbing/DubStudio.tsx:12-30,197-298,388-620,674-782`
- Modify: `src/dubbing/DubSceneEditor.tsx:1-110,129-215`
- Modify: `src/dubbing/DubTakeWaveform.tsx:1-205`
- Modify: `tests/dub-catalog.test.mjs:207-258`
- Modify: `tests/dub-state.test.mjs:1-28`
- Modify: `tests/dub-ui.test.mjs:1-180,442-820,846-1025`
- Modify: `tests/dub-waveform.test.mjs:1-80`

**Interfaces:**
- Consumes: `getDubLineMusicPhrase(definition, line)` and `prepareDubLineBacking(options)`.
- Produces: `DubTakeWaveform` prop `durationMs: number`.
- Produces: a `DubDefinition` type with no `recordingMs` property.
- Preserves: `DubStudio`, `DubSceneEditor`, and `DubTakeWaveform` public component names and all route/API contracts.

- [ ] **Step 1: Write failing phrase-derived editor and waveform tests**

Update the static editor test to render Old MacDonald line 3 and assert its two-second timing:

```js
it("derives recording copy and progress from the selected melody phrase", () => {
  const line = OLD_MACDONALD_DUB.lines[2];
  const idle = renderSceneEditor({ activeLine: line, definition: OLD_MACDONALD_DUB });
  const recording = renderSceneEditor({
    activeLine: line,
    definition: OLD_MACDONALD_DUB,
    operation: "recording",
    recordingElapsedMs: 1_500,
    recordingStream: { getTracks: () => [] },
  });

  assert.match(idle, /Melody length: 0:02/);
  assert.match(recording, /Recording with melody/);
  assert.match(recording, /0:01 \/ 0:02/);
  assert.match(recording, /aria-valuemax="2000"/);
  assert.match(recording, /aria-valuenow="1500"/);
});
```

In `tests/dub-catalog.test.mjs`, add this assertion to the resolver test:

```js
for (const definition of DUB_DEFINITIONS) {
  assert.equal("recordingMs" in definition, false);
}
```

Remove the `DUB_RECORDING_MS` import and its `6_000` assertion from `tests/dub-state.test.mjs`; the catalog resolver becomes the timing contract.

In `tests/dub-waveform.test.mjs`, prove the existing padding primitive for the three authored timeline sizes:

```js
it("scales one second of samples across two-, four-, and eight-second timelines", () => {
  const samples = Array.from({ length: 8 }, () => 1);
  const visibleBars = (durationMs) => getNormalizedPeakBars(
    samples,
    8,
    Math.round(8 * durationMs / 1_000),
  ).filter((peak) => peak > 0).length;

  assert.equal(visibleBars(2_000), 4);
  assert.equal(visibleBars(4_000), 2);
  assert.equal(visibleBars(8_000), 1);
});
```

Update every direct `DubTakeWaveform` render in `tests/dub-ui.test.mjs` to pass the selected phrase duration through `DubSceneEditor`.

- [ ] **Step 2: Write failing studio lifecycle tests**

Extend the existing recording and AudioContext harnesses so they record MediaRecorder starts and triangle-oscillator starts. Add mounted `DubStudio` tests that assert:

```js
assert.deepEqual(events.slice(0, 2), ["recorder:start", "melody:start"]);
assert.equal(container.querySelector('[aria-label="Recording time"]').getAttribute("aria-valuemax"), "4000");
```

Drive the prepared backing's fake AudioContext to the phrase end and assert exactly one PUT upload. Add separate tests for manual Stop, route/unmount cancellation, microphone rejection after backing preparation, and backing setup failure; assert music stops, the context closes once, failed starts do not upload, and manual Stop still uploads the partial take.

Add guide/take tests that click `Hear line` and `Play my recording`, inspect the fake AudioContext, and assert the decoded voice source and first triangle oscillator share the same start time.

- [ ] **Step 3: Run focused UI tests and verify RED**

Run:

```bash
node --test tests/dub-ui.test.mjs tests/dub-waveform.test.mjs
```

Expected: tests fail because the editor still uses `definition.recordingMs`, waveform still imports `DUB_RECORDING_MS`, and the studio does not prepare or start line backing.

- [ ] **Step 4: Make the editor and waveform phrase-driven**

Remove `recordingMs` from `DubDefinition`, delete `DUB_RECORDING_MS`, and delete every `recordingMs` initializer in `dub-script.ts` and `rhyme-catalog.ts`. Do not replace them with another global duration.

In `DubSceneEditor`, resolve once per render:

```ts
const recordingDurationMs = getDubLineMusicPhrase(definition, activeLine).durationMs;
```

Use `recordingDurationMs` for elapsed clamping, total label, idle copy, progress `aria-valuemax`, progress width, and the new `durationMs` waveform prop. Render idle copy as `Melody length: ${recordingLimitLabel}` and active timer copy as `Recording with melody`.

In `DubTakeWaveform`, add `durationMs: number` to its props, pass it into both hooks, include it in their effect dependencies, and replace both `DUB_RECORDING_MS` calculations:

```ts
const timelineSampleCount = Math.round(audio.sampleRate * durationMs / 1_000);
const barIndex = Math.min(
  BAR_COUNT - 1,
  Math.floor(Math.max(0, elapsedMs) / durationMs * BAR_COUNT),
);
```

Guard the division with the domain guarantee that every phrase duration is positive; do not introduce a fallback global duration.

- [ ] **Step 5: Coordinate prepared backing with MediaRecorder**

Add `recordingBackingRef` and include it in `cancelMedia` and `finishRecording`. In `startRecording`, capture the selected line, prepare its backing first, open the microphone second, then start the backing immediately after `startSpeechRecording` returns:

```ts
const backing = await prepareDubLineBacking({
  definition,
  line,
  onEnded: () => void finishRecording(generation),
  onTick: (elapsedMs) => {
    if (mountedRef.current && generation === mediaGenerationRef.current) {
      setRecordingElapsedMs(elapsedMs);
    }
  },
  signal: controller.signal,
});
recordingBackingRef.current = backing;
const session = await startSpeechRecording({ signal: controller.signal });
if (!mountedRef.current || generation !== mediaGenerationRef.current) {
  session.cancel();
  backing.stop();
  return;
}
recordingSessionRef.current = session;
backing.start();
dispatch({ type: "OPERATION_STARTED", operation: "recording" });
```

Delete the fixed recording interval, timeout, and `recordingStartedAtRef`. In `finishRecording`, clear `recordingBackingRef.current` before calling `backing.stop()` so natural completion cannot re-enter the finish path. A backing preparation/start failure must cancel any opened recording session, discard the blob, dispatch `OPERATION_FINISHED`, and show `The melody could not start. Try recording again.`

Update the live-region message from `Recording…` to `Recording with melody…`.

- [ ] **Step 6: Route guide and take playback through synchronized Web Audio**

Replace `playAudioLine` calls with one-line `startDubPlayback` calls. Keep the controller-specific completion callback inline so it cannot finish a successor operation:

```ts
const playback = await startDubPlayback({
  definition,
  lines: [line],
  onEnded() {
    if (generation !== mediaGenerationRef.current) return;
    playbackRef.current = null;
    controllerRef.current = null;
    dispatch({ type: "OPERATION_FINISHED" });
  },
  onTick() {},
  resolveAudioSource: () => ({ preferredUrl: audioUrl }),
  signal: controller.signal,
});
if (generation !== mediaGenerationRef.current) playback.stop();
else playbackRef.current = playback;
```

Use `guideControllerRef` or `takeControllerRef` as `controllerRef` in the corresponding handler. For `Hear line`, `audioUrl` is the checked-in guide `src`. For a pending take it is the existing local object URL. For a saved take use `getDubLineAudioUrl(line.id, { dubId: definition.id })` directly, with no guide fallback. Preserve `DubNotEnabledError`, Needs-retake, focus, Stop labels, and current messages. Remove `loadDubLineAudio`, fetched-take object URL state, and HTML-audio-only ownership code only after the synchronized tests prove the replacement behavior.

- [ ] **Step 7: Run focused dubbing tests and verify GREEN**

Run:

```bash
node --test tests/dub-catalog.test.mjs tests/dub-playback.test.mjs tests/dub-state.test.mjs tests/dub-ui.test.mjs tests/dub-waveform.test.mjs
```

Expected: all focused tests pass with no unhandled rejection or duplicate-close output.

- [ ] **Step 8: Commit the integrated line workflow**

```bash
git add src/dubbing/rhyme-catalog.ts src/dubbing/dub-script.ts src/dubbing/DubStudio.tsx src/dubbing/DubSceneEditor.tsx src/dubbing/DubTakeWaveform.tsx tests/dub-catalog.test.mjs tests/dub-state.test.mjs tests/dub-ui.test.mjs tests/dub-waveform.test.mjs
git commit -m "feat: record nursery rhymes with melody"
```

---

### Task 4: Prove the six-route browser behavior and complete verification

**Files:**
- Modify: `src/testing/e2e-browser-mocks.ts:2129-2376,3507-3571`
- Modify: `tests/e2e/dubbing.spec.ts:5-19,99-104,1263-1342`

**Interfaces:**
- Consumes: the shared `DubStudio` behavior from Task 3.
- Produces: `DubStoreSnapshot.backingStarts: Array<{ at: number; midi: number }>` as test-only browser evidence.
- Preserves: existing E2E query parameters, mock APIs, accessible locators, and viewport suites.

- [ ] **Step 1: Add failing browser assertions for synchronized backing and phrase duration**

Record oscillator starts only for dub scenarios in the E2E mock. Extend `DubStoreSnapshot` with `backingStarts`, then update the former six-second test:

```ts
test("automatically stops and saves at the selected four-second phrase", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await expect(page.getByText("Melody length: 0:04", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("progressbar", { name: "Recording time" }))
    .toHaveAttribute("aria-valuemax", "4000");
  await expect(page.getByRole("timer", { name: "Recording duration" }))
    .toContainText("Recording with melody");
  await expect.poll(async () => (await dubStoreSnapshot(page)).backingStarts.length)
    .toBeGreaterThan(0);
  await expect(page.getByRole("img", { name: "Your recording waveform" }))
    .toBeVisible({ timeout: 6_000 });
  await expect.poll(async () => (await dubStoreSnapshot(page)).uploads).toHaveLength(1);
});
```

Add this Old MacDonald duration test, manually stopping each case so the eight-second line does not slow the suite:

```ts
test("Old MacDonald records on its two- and eight-second phrase windows", async ({ page }) => {
  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await expect(page.getByText("Melody length: 0:08", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("progressbar", { name: "Recording time" }))
    .toHaveAttribute("aria-valuemax", "8000");
  await page.getByRole("button", { name: "Stop recording" }).click();
  await page.getByRole("button", { name: "Next line" }).click();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Melody length: 0:02", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("progressbar", { name: "Recording time" }))
    .toHaveAttribute("aria-valuemax", "2000");
  await page.getByRole("button", { name: "Stop recording" }).click();
});
```

Parameterize a shared-route smoke test in `tests/e2e/dubbing.spec.ts`, where the existing `dubStoreSnapshot` helper is already available:

```ts
for (const definition of DUB_DEFINITIONS) {
  test(`${definition.title} starts its authored backing while recording`, async ({ page }) => {
    await page.goto(`${definition.route}?parrotE2eDub=empty`);
    await page.getByRole("button", { name: "Play full video" }).waitFor();
    await page.getByRole("button", { name: /^Scene 1,/ }).click();
    await expect(page.getByText(/^Melody length: 0:/)).toBeVisible();
    await page.getByRole("button", { name: "Record line" }).click();
    await expect.poll(async () => (await dubStoreSnapshot(page)).backingStarts.length)
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "Stop recording" }).click();
  });
}
```

- [ ] **Step 2: Run the focused Playwright tests and verify RED**

Run:

```bash
npx playwright test tests/e2e/dubbing.spec.ts
```

Expected: the new backing assertions fail because the E2E mock snapshot does not yet expose oscillator starts. Phrase-derived UI assertions already pass from Tasks 1-3.

- [ ] **Step 3: Instrument Web Audio starts without exposing implementation details to production UI**

Add one test-only array beside the existing dub-store metrics:

```ts
const backingStarts: Array<{ at: number; midi: number }> = [];
```

Give `MockScheduledAudioNode` a `kind: "voice" | "oscillator"` constructor argument. Construct buffer sources with `"voice"` and oscillators with `"oscillator"`; in `start(when)`, append only oscillator starts created while `getE2eDubScenario()` is active, including the node's current `frequency.value`. Return a copy from `dubStore.snapshot()`:

```ts
backingStarts: backingStarts.map((start) => ({ ...start })),
```

Keep lesson/story AudioContext behavior unchanged and retain the existing duplicate-close counter.

- [ ] **Step 4: Run focused browser tests and verify GREEN**

Run:

```bash
npx playwright test tests/e2e/dubbing.spec.ts
```

Expected: both files pass across their configured projects.

- [ ] **Step 5: Run complete verification**

Run each command independently and require a zero exit code:

```bash
npm test
npm run lint
npm run build
npm run test:browser
git diff --check
```

Inspect `git status --short` and `git diff --stat HEAD~3..HEAD`. Confirm there are no changes beneath `public/assets/audio`, `worker`, `migrations`, or package manifests.

- [ ] **Step 6: Commit browser coverage and any verified mock adjustment**

```bash
git add src/testing/e2e-browser-mocks.ts tests/e2e/dubbing.spec.ts
git commit -m "test: cover melody-backed rhyme recording"
```

- [ ] **Step 7: Re-run exact-commit verification**

Run on the final commit candidate:

```bash
npm test
npm run lint
npm run build
npm run test:browser
git status --short
```

Expected: all commands pass and `git status --short` prints nothing.
