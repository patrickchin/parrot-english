# Nursery Rhyme Guided-Coherence Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Nursery Rhymes journey easier to understand, useful without recording consent, accessible, and responsive while preserving its familiar video vocabulary and private recording contracts.

**Architecture:** Keep the catalog, playback scheduler, API, worker, and persisted IDs unchanged. Add one explicit public-guide playback boundary and one focused listen-only presenter, then derive recommended scene work and human-readable progress from the existing reducer state. Keep view styling in Tailwind-powered React components and validate learner behavior, privacy, accessibility, and geometry in rendered Playwright tests.

**Tech Stack:** TypeScript, React, React Router, Tailwind 4, Web Audio, Vite, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-nursery-rhyme-guided-coherence-design.md`

## Global Constraints

- Preserve all six `DUB_DEFINITIONS`, lyrics, artwork, score timing, recording durations, media keys, route IDs, and line IDs.
- Preserve Five Little Ducks `five-little-ducks-v2` and `line-N` compatibility; all generic logic uses each definition's `linesPerScene`.
- Preserve learner-facing **Full video**, **Play full video**, **Stop full video**, **Loading full video**, **Back to full video**, **Scene video**, and **The video could not start** vocabulary. No learner-facing or accessible copy says **whole rhyme**.
- Guardian consent continues to gate microphone access, uploads, private status, private audio, and saved takes. Listen-only playback uses public guide assets only.
- Do not modify `worker/dubs.ts`, `src/dubbing/dub-api.ts`, public audio, artwork, the rhyme catalog, global control tokens, `src/styles.css`, or `src/lesson.css`.
- Add no runtime dependency, media asset, font, animation, analytics, reward system, recommendation engine, or feature flag.
- Use Tailwind 4 utilities directly in components, controls from `src/shared/ui.tsx`, and headers from `src/app/AppHeader.tsx`.
- Use only Bob, Mary, Rose, Jack, Ben, or Sam if a new authored learner name becomes unavoidable. This plan requires no new name.
- Test UI behavior with Playwright accessible locators and rendered geometry. Never assert Tailwind class names or stylesheet source.
- Every interactive target remains at least 48×48 CSS pixels; errors and visible titles must not be clipped to make a viewport pass.
- Do not request the microphone before an explicit Record press and do not silently convert a failed private-take request into a guide presented as the learner's recording.

## File Structure

**Create**

- `src/dubbing/DubListenOnly.tsx` — recording-disabled presentation with only the public full-video player, child-readable explanation, and playback error.

**Modify**

- `src/dubbing/dub-state.ts` — `listen-only` view, first actionable scene selector, and retake-first scene entry.
- `src/dubbing/DubStudio.tsx` — explicit guide-only resolver, listen-only orchestration, load-error-only recovery entry, consent-loss cleanup, contextual status, header destination, and error-announcement ownership.
- `src/dubbing/DuckDub.tsx` — retain compatibility exports and expose the pure guide-only resolver to existing SSR tests.
- `src/dubbing/DubProjectHome.tsx` — recommended action, ready-line progress, completion copy, scene semantics, complete titles, and regular/short-wide presentation.
- `src/dubbing/DubSceneEditor.tsx` — shared brand Record action and fully reachable error text.
- `src/dubbing/NurseryRhymeList.tsx` — expectation copy and label-in-name fix.
- `tests/dub-state.test.mjs` — reducer, scene-choice, and cross-definition domain coverage.
- `tests/dub-ui.test.mjs` — rendered component and orchestration contracts without class assertions.
- `tests/e2e/dubbing.spec.ts` — enabled/listen-only journeys, privacy, guidance, completion, announcements, focus, target sizing, and responsive geometry.
- `tests/e2e/nursery-rhymes.spec.ts` — shelf expectation, card names, and containment.
- `tests/e2e/header.spec.ts` — Nursery Rhymes route-header contract.
- `tests/e2e/shared-control-contrast.spec.ts` — computed Record contrast across interaction states.

**Intentionally unchanged**

- `src/dubbing/rhyme-catalog.ts`, `src/dubbing/dub-playback.ts`, `src/dubbing/dub-api.ts`, `src/shared/ui.tsx`, `worker/dubs.ts`, `public/assets/**`, and persisted recording data.

---

### Task 1: Add privacy-safe listen-only video playback

**Files:**

- Create: `src/dubbing/DubListenOnly.tsx`
- Modify: `src/dubbing/dub-state.ts:5-190`
- Modify: `src/dubbing/DubStudio.tsx:1-820`
- Modify: `src/dubbing/DuckDub.tsx:1-12`
- Test: `tests/dub-state.test.mjs:70-260`
- Test: `tests/dub-ui.test.mjs:20-560`
- Test: `tests/e2e/dubbing.spec.ts:1-260,1015-1065`

**Interfaces:**

- Produces: `DubView = "loading" | "listen-only" | "project" | "scene"`.
- Produces: `resolveGuideOnlyDubLineAudioSource(line, resolveGuide?): DubAudioSource`; the returned object contains exactly one public `preferredUrl` and no fallback.
- Produces: `DubListenOnlyProps` with `definition`, `error`, `onTogglePlayback`, `playback`, `playbackButtonRef`, and `visualLine`.
- Preserves: `resolveDubLineAudioSource` as the private-preferred resolver for enabled projects.
- Consumes: existing `startDubPlayback`, `IllustratedDubScene`, `ActionButton`, media cancellation, and `LOADED` event.

- [ ] **Step 1: Write failing domain and resolver tests**

In `tests/dub-ui.test.mjs`, load `DubListenOnly` from its new module; add `resolveGuideOnlyDubLineAudioSource` to the `DuckDub.tsx` module destructuring; add `DUB_DEFINITIONS` to the catalog-module destructuring; and load `getStaticAudioLineForSpeech` from `/lib/static-audio.ts`. Remove `DubEntry` from the destructuring after deleting its obsolete direct tests. Replace locked-view expectations and add the pure resolver loop:

```js
it("loads recording-disabled status into listen-only and clears private state", () => {
  let state = reduceDubState(createInitialDubState(), {
    type: "LOADED",
    recordingEnabled: true,
    savedLineIds: DUB_LINES.map(({ id }) => id),
  });
  state = reduceDubState(state, { type: "MARK_NEEDS_RETAKE", lineId: "line-1" });
  state = reduceDubState(state, {
    type: "LOADED",
    recordingEnabled: false,
    savedLineIds: [],
  });
  assert.deepEqual(state, { ...createInitialDubState(), view: "listen-only" });
});

it("resolves every listen-only line to its public guide and never private audio", () => {
  for (const definition of DUB_DEFINITIONS) {
    for (const line of definition.lines) {
      const source = resolveGuideOnlyDubLineAudioSource(line);
      assert.deepEqual(source, {
        preferredUrl: getStaticAudioLineForSpeech("narrator", line.text).src,
      });
      assert.equal(source.preferredUrl.includes("/api/dubs/"), false);
      assert.equal(Object.hasOwn(source, "fallbackUrl"), false);
    }
  }
});
```

- [ ] **Step 2: Run the focused tests and confirm the expected red failures**

Run:

```bash
node --test tests/dub-state.test.mjs tests/dub-ui.test.mjs
```

Expected: the state test reports `locked` instead of `listen-only`, and the resolver import is missing.

- [ ] **Step 3: Implement the state name and explicit public resolver**

In `dub-state.ts`, replace the consent-only view name and the `LOADED` result:

```ts
export type DubView = "loading" | "listen-only" | "project" | "scene";
```

```ts
view: event.recordingEnabled ? "project" : "listen-only",
```

In `DubStudio.tsx`, add the pure resolver beside `resolveDubLineAudioSource`:

```ts
export function resolveGuideOnlyDubLineAudioSource(
  line: Pick<DubLine, "text">,
  resolveGuide: typeof getStaticAudioLineForSpeech = getStaticAudioLineForSpeech,
): DubAudioSource {
  return { preferredUrl: resolveGuide("narrator", line.text).src };
}
```

Re-export it without altering the Five Little Ducks wrapper:

```ts
export {
  DubEntry,
  DubLoading,
  resolveDubLineAudioSource,
  resolveGuideOnlyDubLineAudioSource,
} from "./DubStudio";
```

`DubEntry` is now load-recovery UI only because recording-disabled learners use `DubListenOnly`. Replace its conditional consent message with one alert and one retry action:

```tsx
export function DubEntry({
  error,
  onRetryLoad,
  title = FIVE_LITTLE_DUCKS_DUB.title,
}: {
  error: string;
  onRetryLoad(): void;
  title?: string;
}) {
  return (
    <main className="h-dvh w-screen overflow-x-hidden overflow-y-auto overscroll-contain bg-story-shelf px-3 pb-6 pt-20 md:px-6 md:pt-24">
      <section className="mx-auto grid w-full max-w-2xl gap-4 rounded-3xl border-4 border-white bg-white/90 p-5 shadow-card">
        <h1 className="m-0 text-3xl text-brand-ink md:text-4xl">{title}</h1>
        <p className="m-0 rounded-2xl bg-rose-50 p-3 font-bold text-red-800" role="alert">
          {error || "Your saved dub could not be loaded."}
        </p>
        <ActionButton onClick={onRetryLoad}>Try loading again</ActionButton>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Add failing rendered listen-only and privacy browser tests**

Load `DubListenOnly` in `tests/dub-ui.test.mjs` and add:

```js
it("shows public video playback without private or recording controls", () => {
  const html = renderToStaticMarkup(createElement(DubListenOnly, {
    definition: FIVE_LITTLE_DUCKS_DUB,
    error: "",
    onTogglePlayback() {},
    playback: "idle",
    visualLine: DUB_LINES[0],
  }));
  assert.match(html, /You can watch the video now/);
  assert.match(html, /aria-label="Play full video"/);
  assert.doesNotMatch(
    html,
    /Record again|Record line|Play my recording|Save again|Guardian|Delete/,
  );
});
```

Add this rendered-network test to `tests/e2e/dubbing.spec.ts`:

```ts
test("recording-disabled learners watch public video without private media", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=not-granted");
  await expect(page.getByText("You can watch the video now.", { exact: false })).toBeVisible();
  await expectNoLearnerAdultControls(page);
  await expect(page.getByRole("button", { name: /Record|Play my recording|Save/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Scene \d/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Scene video" })).toHaveCount(0);
  await expect(page.getByRole("progressbar", { name: "Project recording progress" })).toHaveCount(0);
  expect((await dubStoreSnapshot(page)).guideFetches).toEqual([]);

  const microphoneBefore = await microphoneSnapshot(page);
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect.poll(async () => (await dubStoreSnapshot(page)).guideFetches.length).toBeGreaterThan(0);

  const [store, microphoneAfter] = await Promise.all([
    dubStoreSnapshot(page),
    microphoneSnapshot(page),
  ]);
  expect(store.guideFetches.every((url) => url.startsWith("/assets/audio/"))).toBe(true);
  expect(store.privateFetches).toEqual([]);
  expect(store.uploads).toEqual([]);
  expect(microphoneAfter.requests).toBe(microphoneBefore.requests);
});
```

Add an all-guide-failure case without changing the shared browser mock:

```ts
test("listen-only guide failure restores Play with one child-readable alert", async ({ page }) => {
  await page.route("**/assets/audio/*", (route) => route.fulfill({ status: 503 }));
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=not-granted");

  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("alert")).toHaveText("The video could not start. Try again.");
  await expect(page.getByRole("button", { name: "Play full video" })).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(1);

  const store = await dubStoreSnapshot(page);
  expect(store.privateFetches).toEqual([]);
  expect(store.uploads).toEqual([]);
});
```

Extend the existing playback-startup failure coverage (or add it if absent) so the shared recoverable path also restores focus:

```ts
test("full-video startup failure restores its Play action", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=playback-setup-failed");
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("alert")).toHaveText("The video could not start. Try again.");
  await expect(page.getByRole("button", { name: "Play full video" })).toBeFocused();
});
```

Delete the two direct `DubEntry` consent-guidance tests because that state no longer exists. Update the existing mounted recording-disabled and consent-loss tests to expect the listen-only message and `Play full video`, while still asserting that tracks, pending blobs, private saved state, and object URLs are cleared.

- [ ] **Step 5: Run the rendered tests and confirm the expected red failures**

Run:

```bash
node --test tests/dub-ui.test.mjs
npx playwright test tests/e2e/dubbing.spec.ts --project=chromium --grep "recording-disabled|consent loss|revoking|listen-only guide failure|startup failure"
```

Expected: the component module is missing and the recording-disabled route has no Play control.

- [ ] **Step 6: Create the focused listen-only presenter**

Create `src/dubbing/DubListenOnly.tsx` with this complete component:

```tsx
import { LoaderCircle, Play, Square } from "lucide-react";
import type { RefObject } from "react";
import { ActionButton } from "../shared/ui";
import { IllustratedDubScene } from "./IllustratedDubScene";
import type { DubDefinition, DubLine } from "./rhyme-catalog";

export type DubListenOnlyProps = {
  definition: DubDefinition;
  error: string;
  onTogglePlayback(): void;
  playback: "idle" | "loading" | "playing";
  playbackButtonRef?: RefObject<HTMLButtonElement | null>;
  visualLine: DubLine;
};

export function DubListenOnly({
  definition,
  error,
  onTogglePlayback,
  playback,
  playbackButtonRef,
  visualLine,
}: DubListenOnlyProps) {
  const playbackLabel = playback === "playing"
    ? "Stop full video"
    : playback === "loading"
      ? "Loading full video…"
      : "Play full video";

  return (
    <main className="h-dvh w-screen overflow-x-hidden overflow-y-auto overscroll-contain bg-story-shelf px-3 pb-5 pt-20 short-wide:px-2 short-wide:pb-2 short-wide:pt-16 md:px-6 md:pt-24">
      <section aria-label="Listen-only video" className="mx-auto grid w-full max-w-5xl gap-3">
        <h1 className="m-0 text-2xl leading-tight text-brand-ink md:text-4xl">
          {definition.title}
        </h1>
        <p className="m-0 rounded-2xl bg-white/90 p-3 font-bold leading-snug text-brand-ink shadow-sm">
          You can watch the video now. Ask a grown-up to turn on voice recording if you want to sing and save your own version.
        </p>
        <section aria-label="Full video player" className="grid aspect-video overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card">
          <IllustratedDubScene compact definition={definition} line={visualLine} playing={playback === "playing"} />
        </section>
        <ActionButton
          aria-label={playbackLabel}
          className="min-h-12 min-w-36 justify-self-start gap-2"
          disabled={playback === "loading"}
          onClick={onTogglePlayback}
          ref={playbackButtonRef}
          size="compact"
          variant="navy"
        >
          {playback === "loading"
            ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            : playback === "playing"
              ? <Square aria-hidden="true" />
              : <Play aria-hidden="true" />}
          {playback === "playing" ? "Stop" : playback === "loading" ? "Loading…" : "Play"}
        </ActionButton>
        {error ? <p className="m-0 rounded-2xl bg-rose-50 p-3 font-bold text-red-800" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
```

- [ ] **Step 7: Integrate guide-only playback and consent-loss transition**

Import `DubListenOnly`. In `startPlayback`, capture the view before starting and use it to separate callbacks and sources:

```ts
const guideOnlyPlayback = state.view === "listen-only";
```

Use these option values in the existing `startDubPlayback` call:

```ts
onLineFallback(lineId) {
  if (!guideOnlyPlayback) dispatch({ type: "MARK_NEEDS_RETAKE", lineId });
},
onLineUnavailable(lineId) {
  unavailableLineIds.add(lineId);
},
resolveAudioSource: guideOnlyPlayback
  ? resolveGuideOnlyDubLineAudioSource
  : resolveLineAudio,
```

Immediately after `startDubPlayback` resolves and after the existing mounted/generation guard, stop an all-guide-failure before assigning `playbackRef.current`:

```ts
if (guideOnlyPlayback && unavailableLineIds.size === lines.length) {
  playback.stop();
  playbackControllerRef.current = null;
  dispatch({ type: "OPERATION_FINISHED" });
  dispatch({ type: "SET_ERROR", message: "The video could not start. Try again." });
  focusAfterRender(fullPlaybackButtonRef, generation);
  return;
}
```

Individual unavailable guide lines retain the existing child-readable scene/line alert while the remaining public audio and music continue. Guide failures never mark retakes.

In the existing generic `startPlayback` catch, restore focus after dispatching the recoverable error:

```ts
dispatch({ type: "OPERATION_FINISHED" });
dispatch({ type: "SET_ERROR", message: "The video could not start. Try again." });
focusAfterRender(
  scope === "full" ? fullPlaybackButtonRef : scenePlaybackButtonRef,
  generation,
);
```

Render the new state before the enabled project branch:

```tsx
} else if (state.view === "listen-only") {
  content = (
    <DubListenOnly
      definition={definition}
      error={state.error}
      onTogglePlayback={() => void startPlayback("full")}
      playback={state.playbackScope === "full"
        ? state.operation === "playback"
          ? "playing"
          : state.operation === "playback-loading"
            ? "loading"
            : "idle"
        : "idle"}
      playbackButtonRef={fullPlaybackButtonRef}
      visualLine={visualLine}
    />
  );
```

Keep `handleConsentLoss` ordering: call `cancelMedia(true)`, clear the load error and playback index, then dispatch `LOADED` with `recordingEnabled: false` and no saved IDs. Never call the private resolver in `listen-only`.

Replace every remaining `state.view === "locked"` branch. Because the listen-only message is already visible, its idle live-status branch stays quiet:

```ts
} else if (state.view === "listen-only") {
  liveStatus = "";
```

The content branch is the `DubListenOnly` branch above; no `locked` comparison or consent-only copy remains in `DubStudio.tsx`, `dub-state.ts`, or `tests/dub-ui.test.mjs`.

- [ ] **Step 8: Run focused state, component, and privacy tests green**

Run:

```bash
node --test tests/dub-state.test.mjs tests/dub-ui.test.mjs
npx playwright test tests/e2e/dubbing.spec.ts --project=chromium --grep "recording-disabled|consent loss|revoking|listen-only guide failure|startup failure"
```

Expected: all selected tests pass; browser snapshots show guide fetches and zero private fetch/upload/microphone activity.

- [ ] **Step 9: Commit the privacy-safe listen-only deliverable**

```bash
git add src/dubbing/DubListenOnly.tsx src/dubbing/dub-state.ts src/dubbing/DubStudio.tsx src/dubbing/DuckDub.tsx tests/dub-state.test.mjs tests/dub-ui.test.mjs tests/e2e/dubbing.spec.ts
git commit -m "feat: add privacy-safe dubbing listen mode"
```

---

### Task 2: Guide learners to the first scene that needs work

**Files:**

- Modify: `src/dubbing/dub-state.ts:80-210`
- Modify: `src/dubbing/DubProjectHome.tsx:1-190`
- Test: `tests/dub-state.test.mjs:90-190`
- Test: `tests/dub-ui.test.mjs:330-500`
- Test: `tests/e2e/dubbing.spec.ts:570-735,960-985,1205-1235`

**Interfaces:**

- Produces: `getFirstActionableDubSceneIndex(state, definition?): number | null`.
- Changes: `OPEN_SCENE` selects the first retake line, then first unsaved line, then scene start.
- Preserves: `onOpenScene(sceneIndex)` as the only project-to-editor transition.
- Consumes: `getDubSceneStatus`, `saved`, `needsRetake`, and `definition.linesPerScene`.

- [ ] **Step 1: Write failing state-selection tests**

Add `getFirstActionableDubSceneIndex` to the import and add these cases:

```js
it("finds the first actionable scene and returns null only when all are ready", () => {
  assert.equal(getFirstActionableDubSceneIndex({ saved: {}, needsRetake: {} }), 0);
  assert.equal(getFirstActionableDubSceneIndex({
    saved: Object.fromEntries(DUB_LINES.slice(0, 4).map(({ id }) => [id, "saved"])),
    needsRetake: {},
  }), 1);
  assert.equal(getFirstActionableDubSceneIndex({
    saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    needsRetake: { "line-9": true },
  }), 2);
  assert.equal(getFirstActionableDubSceneIndex({
    saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    needsRetake: {},
  }), null);
});

it("opens a retake before an earlier unsaved line in the same scene", () => {
  let state = reduceDubState(createInitialDubState(), {
    type: "LOADED",
    recordingEnabled: true,
    savedLineIds: ["line-1"],
  });
  state = reduceDubState(state, { type: "MARK_NEEDS_RETAKE", lineId: "line-4" });
  state = reduceDubState(state, { type: "OPEN_SCENE", sceneIndex: 0 });
  assert.deepEqual([state.selectedSceneIndex, state.selectedLineIndex], [0, 3]);
});

it("uses Old MacDonald's seven-line scene boundaries", () => {
  const saved = Object.fromEntries(
    OLD_MACDONALD_DUB.lines.slice(0, 8).map(({ id }) => [id, "saved"]),
  );
  assert.equal(
    getFirstActionableDubSceneIndex({ saved, needsRetake: {} }, OLD_MACDONALD_DUB),
    1,
  );
});
```

Import both catalog values in `tests/dub-state.test.mjs`:

```js
import { DUB_DEFINITIONS, OLD_MACDONALD_DUB } from "../src/dubbing/rhyme-catalog.ts";
```

In the same test, loop across all six catalog definitions so every authored scene shape proves the catalog-order rule and retake-before-unsaved precedence:

```js
for (const definition of DUB_DEFINITIONS) {
  const firstSceneSaved = Object.fromEntries(
    definition.lines
      .slice(0, definition.linesPerScene)
      .map(({ id }) => [id, "saved"]),
  );
  const expected = definition.lines.length === definition.linesPerScene ? null : 1;
  assert.equal(
    getFirstActionableDubSceneIndex(
      { saved: firstSceneSaved, needsRetake: {} },
      definition,
    ),
    expected,
    definition.id,
  );

  let state = reduceDubState(createInitialDubState(definition), {
    type: "LOADED",
    recordingEnabled: true,
    savedLineIds: [],
  }, definition);
  state = reduceDubState(state, {
    type: "MARK_NEEDS_RETAKE",
    lineId: definition.lines[1].id,
  }, definition);
  state = reduceDubState(state, { type: "OPEN_SCENE", sceneIndex: 0 }, definition);
  assert.equal(state.selectedLineIndex, 1, `${definition.id}: retake precedence`);
}
```

- [ ] **Step 2: Run the state test and confirm the missing helper failure**

```bash
node --test tests/dub-state.test.mjs
```

Expected: module import failure for `getFirstActionableDubSceneIndex`.

- [ ] **Step 3: Implement generic scene and line selection**

Replace `getFirstMissingSceneLineIndex` with retake-first entry logic:

```ts
function getSceneEntryLineIndex(
  state: Pick<DubState, "needsRetake" | "saved">,
  sceneIndex: number,
  definition: DubDefinition = FIVE_LITTLE_DUCKS_DUB,
): number {
  const sceneStart = getSceneStartIndex(sceneIndex, definition);
  const sceneEnd = sceneStart + definition.linesPerScene;
  const retakeIndex = definition.lines.findIndex(
    ({ id }, lineIndex) =>
      lineIndex >= sceneStart
      && lineIndex < sceneEnd
      && Object.hasOwn(state.needsRetake, id),
  );
  if (retakeIndex >= 0) return retakeIndex;
  const missingIndex = definition.lines.findIndex(
    ({ id }, lineIndex) =>
      lineIndex >= sceneStart
      && lineIndex < sceneEnd
      && !hasSavedLine(state.saved, id),
  );
  return missingIndex >= 0 ? missingIndex : sceneStart;
}
```

Use it in `selectScene`, then export the project helper after `getDubSceneStatus`:

```ts
export function getFirstActionableDubSceneIndex(
  state: Pick<DubState, "needsRetake" | "saved">,
  definition: DubDefinition = FIVE_LITTLE_DUCKS_DUB,
): number | null {
  const sceneCount = definition.lines.length / definition.linesPerScene;
  for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
    if (getDubSceneStatus(state, sceneIndex, definition).kind !== "done") {
      return sceneIndex;
    }
  }
  return null;
}
```

- [ ] **Step 4: Write failing project guidance and completion tests**

Update rendered component expectations to these exact phrases:

```js
it("guides empty, partial, retake, and complete projects", () => {
  assert.match(renderProjectHome(), /Ready to start/);
  assert.match(renderProjectHome(), />Start with Scene 1</);

  const partial = renderProjectHome({ saved: { "line-1": "saved" } });
  assert.match(partial, /1 of 24 lines ready/);
  assert.match(partial, />Continue with Scene 1</);

  const saved = Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"]));
  const retake = renderProjectHome({ needsRetake: new Set(["line-5"]), saved });
  assert.match(retake, />Fix Scene 2</);
  assert.match(retake, /Scene 2, Four little ducks, Needs a new take/);

  const complete = renderProjectHome({ activeLine: DUB_LINES[23], saved });
  assert.match(complete, /All 24 lines ready/);
  assert.match(complete, /Your video is ready — great singing!/);
  assert.doesNotMatch(complete, /Start with Scene|Continue with Scene|Fix Scene/);
});
```

Add Playwright acceptance cases for empty and partial projects:

```ts
test("Start and Continue open the earliest line that needs work", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await page.getByRole("button", { name: "Start with Scene 1" }).click();
  await expect(page.getByRole("heading", { name: DUB_LINES[0].text })).toBeFocused();

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await page.getByRole("button", { name: "Continue with Scene 1" }).click();
  await expect(page.getByRole("heading", { name: DUB_LINES[3].text })).toBeFocused();
});
```

Update the existing corrupt-line playback case to require `Fix Scene 2`, and update the partial-scene save flow to require `Scene 1 is ready — great singing!` after **Next, finish scene**.

- [ ] **Step 5: Run the component and guidance browser tests red**

```bash
node --test tests/dub-state.test.mjs tests/dub-ui.test.mjs
npx playwright test tests/e2e/dubbing.spec.ts --project=chromium --grep "Start and Continue|corrupt private audio|finish scene|direct entry"
```

Expected: the project has raw counters and no Start/Continue/Fix action.

- [ ] **Step 6: Implement human-readable progress, recommendation, and completion**

In `DubProjectHome.tsx`, import `getFirstActionableDubSceneIndex` and derive these values before rendering:

```ts
const ready = definition.lines.filter(
  ({ id }) => Object.hasOwn(saved, id) && !needsRetake.has(id),
).length;
const sceneStatuses = sceneLines.map((_, sceneIndex) =>
  getDubSceneStatus({ needsRetake: retakeState, saved }, sceneIndex, definition),
);
const recommendedSceneIndex = getFirstActionableDubSceneIndex(
  { needsRetake: retakeState, saved },
  definition,
);
const recommendedStatus = recommendedSceneIndex === null
  ? null
  : sceneStatuses[recommendedSceneIndex];
const progressText = ready === 0 && needsRetake.size === 0
  ? "Ready to start"
  : ready === definition.lines.length
    ? `All ${definition.lines.length} lines ready`
    : `${ready} of ${definition.lines.length} lines ready`;
const recommendedText = recommendedSceneIndex === null
  ? ""
  : ready === 0 && needsRetake.size === 0
    ? "Start with Scene 1"
    : recommendedStatus?.kind === "needs-retake"
      ? `Fix Scene ${recommendedSceneIndex + 1}`
      : `Continue with Scene ${recommendedSceneIndex + 1}`;
const allComplete = recommendedSceneIndex === null;
const activeSceneComplete = sceneStatuses[activeSceneIndex]?.kind === "done";
const completionText = allComplete
  ? "Your video is ready — great singing!"
  : activeSceneComplete
    ? `Scene ${activeSceneIndex + 1} is ready — great singing!`
    : "";
```

Use `ready` and `progressText` for the progressbar's rendered text and ARIA values. Insert this action at the start of the scene-selection aside:

```tsx
{recommendedSceneIndex !== null ? (
  <ActionButton
    disabled={locked}
    fullWidth
    onClick={() => onOpenScene(recommendedSceneIndex)}
    shape="rounded"
    size="large"
    variant="brand"
  >
    {recommendedText}
  </ActionButton>
) : null}
```

Render `completionText` once as a visible paragraph without a second live-region role. Map scene states to **Ready to start**, **N of M lines ready**, **Scene ready**, and **Needs a new take**. Change the selected scene button to `aria-current={selected ? "step" : undefined}`. Keep full titles in button accessible names.

Replace both scene-status helpers with one exact copy contract and use its `visible` value for card text and `accessible` value in each button's `aria-label`:

```ts
function sceneStatusCopy(status: DubSceneStatus, linesPerScene: number) {
  if (status.kind === "not-started") {
    return { accessible: "Ready to start", visible: "Ready to start" };
  }
  if (status.kind === "in-progress") {
    const progress = `${status.recorded} of ${linesPerScene} lines ready`;
    return { accessible: progress, visible: progress };
  }
  if (status.kind === "done") {
    return { accessible: "Scene ready", visible: "Scene ready" };
  }
  return { accessible: "Needs a new take", visible: "Needs a new take" };
}
```

Set the progressbar to `aria-valuenow={ready}`, `aria-valuetext={progressText}`, and visible `{progressText}` so retakes are never counted as ready.

- [ ] **Step 7: Run state, component, and guidance tests green**

```bash
node --test tests/dub-state.test.mjs tests/dub-ui.test.mjs
npx playwright test tests/e2e/dubbing.spec.ts --project=chromium --grep "Start and Continue|corrupt private audio|finish scene|direct entry"
```

Expected: all selected tests pass across the catalog's two-, four-, and seven-line scene shapes and all six definitions.

- [ ] **Step 8: Commit the guided project deliverable**

```bash
git add src/dubbing/dub-state.ts src/dubbing/DubProjectHome.tsx tests/dub-state.test.mjs tests/dub-ui.test.mjs tests/e2e/dubbing.spec.ts
git commit -m "feat: guide nursery rhyme recording progress"
```

---

### Task 3: Repair journey clarity and accessibility contracts

**Files:**

- Modify: `src/dubbing/NurseryRhymeList.tsx:1-45`
- Modify: `src/dubbing/DubStudio.tsx:660-830`
- Modify: `src/dubbing/DubSceneEditor.tsx:110-215`
- Modify: `tests/dub-ui.test.mjs:330-560`
- Modify: `tests/e2e/nursery-rhymes.spec.ts:1-105`
- Modify: `tests/e2e/header.spec.ts:25-80`
- Modify: `tests/e2e/dubbing.spec.ts:630-660,1030-1080,1380-1405,1590-1645,1850-1870`
- Modify: `tests/e2e/shared-control-contrast.spec.ts:1-390`

**Interfaces:**

- Consumes: `getNurseryRhymesPath()` and shared header/control primitives.
- Produces: project/listen-only header link **Back to Nursery rhymes** → `/dubs`.
- Preserves: picker **Back to home** and editor **Back to full video**.
- Changes: Record uses shared `variant="brand"`; errors own one `role="alert"`, while the global polite status reports operations only.

- [ ] **Step 1: Write failing shelf, route-header, contrast, and announcement tests**

Change the shelf card locator so visible text must be part of the accessible name:

```ts
for (const [name, route] of RHYMES) {
  const card = picker.getByRole("link", {
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+Sing & record$`),
  });
  await expect(card).toHaveAttribute("href", route);
}
```

Require the expectation sentence:

```ts
await expect(page.getByText(
  "Choose a rhyme to watch. With a grown-up's permission, you can sing and save your recording.",
)).toBeVisible();
```

Change both dubbing entries in `header.spec.ts` to:

```ts
control: { name: "Back to Nursery rhymes", role: "link" },
```

Add computed Record contrast to the existing two-viewport loop:

```ts
test(`nursery Record keeps rendered contrast on a ${viewport.name}`, async ({ page }) => {
  await preparePage(page, viewport);
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await page.getByRole("button", { name: "Start with Scene 1" }).click();
  await expectPointerStateContrast({
    interaction: page.getByRole("button", { name: "Record line" }),
    minimum: 4.5,
    name: "Nursery Record",
    page,
  });
});
```

Extend the existing microphone error test:

```ts
const message = "The microphone is off. Ask a grown-up to allow it, then try again.";
await expect(page.getByRole("alert").filter({ hasText: message })).toHaveCount(1);
await expect(page.getByRole("status", { name: "Dub updates" })).not.toContainText(message);
```

Update idle project and listen-only assertions so the polite status does not repeat visible static guidance:

```ts
await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("");
```

Keep the existing assertions that microphone opening, recording, saving, guide/take playback, video loading/playback, and explicit scene selection produce contextual polite updates.

Update scene-button state assertions from `aria-current="page"` to `aria-current="step"`, and replace project **Back to home** expectations with **Back to Nursery rhymes** and `href="/dubs"`.

- [ ] **Step 2: Run the focused browser tests red**

```bash
npx playwright test tests/e2e/nursery-rhymes.spec.ts tests/e2e/header.spec.ts tests/e2e/shared-control-contrast.spec.ts tests/e2e/dubbing.spec.ts --project=chromium --grep "nursery|dubbing studio|microphone|keyboard navigation|scene navigation"
```

Expected: card names omit **Sing & record**, route headers point home, Record contrast is below 4.5:1, project scene state is `page`, and the error is repeated in the polite status.

- [ ] **Step 3: Fix shelf expectation and label-in-name behavior**

In `NurseryRhymeList.tsx`, add this paragraph under the heading and remove `aria-label={definition.title}` from `InteractiveCardLink`:

```tsx
<p className="m-0 text-base font-bold leading-snug text-brand-navy sm:text-lg">
  Choose a rhyme to watch. With a grown-up&apos;s permission, you can sing and save your recording.
</p>
```

Keep the image `alt=""`; the native link name will be the visible title followed by **Sing & record**.

- [ ] **Step 4: Fix route navigation, error ownership, and Record presentation**

Import `getNurseryRhymesPath` in `DubStudio.tsx`. For every non-scene view, render:

```tsx
<HeaderLink
  aria-label="Back to Nursery rhymes"
  icon={<ChevronLeft strokeWidth={3.2} />}
  to={getNurseryRhymesPath()}
>
  Nursery rhymes
</HeaderLink>
```

Keep the scene `HeaderButton` exactly **Back to full video**. Initialize `liveStatus` to an empty string and make the error case an explicit stop before the view-specific branches:

```ts
let liveStatus = "";
```

```ts
} else if (activeError) {
  liveStatus = "";
} else if (state.view === "loading") {
```

Operation, loading, and scene-selection branches continue to set useful text. The explicit `activeError` branch prevents fall-through to project progress or listen-only guidance because the visible alert owns that announcement.

Static project progress and listen-only guidance are already visible and must not be repeated on every render. Remove `savedCount` and replace both idle branches with:

```ts
} else if (state.view === "listen-only" || state.view === "project") {
  liveStatus = "";
```

Keep the loading branch and operation-specific branches above it, and keep the scene-selection branch below it. This leaves the polite region for state changes that are not otherwise immediately announced.

In `DubSceneEditor.tsx`, change only the Record variant:

```tsx
variant="brand"
```

Replace the error-specific text classes with wrapping behavior while leaving operational text compact:

```tsx
className={`m-0 min-w-0 flex-1 text-sm font-black short-wide:text-xs ${feedbackError
  ? "break-words leading-tight text-red-800"
  : operation === "mic-opening" || operation === "saving"
    ? "truncate whitespace-nowrap text-brand-rose"
    : "truncate whitespace-nowrap text-slate-600"}`}
```

- [ ] **Step 5: Update rendered component contracts without class assertions**

Change the static project assertion to cover scene semantics and vocabulary:

```js
const projectHtml = renderProjectHome();
assert.match(projectHtml, /aria-current="step"/);
assert.doesNotMatch(projectHtml, /whole rhyme/i);
```

In the existing mounted back-navigation test, replace the old project-link assertions with:

```js
const backToRhymes = container.querySelector(
  'nav[aria-label="Page navigation"] a[aria-label="Back to Nursery rhymes"]',
);
assert.ok(backToRhymes);
assert.equal(backToRhymes.getAttribute("href"), "/dubs");
```

Keep color and wrapping verification exclusively in Playwright; do not inspect `variant` or class strings in Node tests.

- [ ] **Step 6: Run component and browser tests green**

```bash
node --test tests/dub-ui.test.mjs
npx playwright test tests/e2e/nursery-rhymes.spec.ts tests/e2e/header.spec.ts tests/e2e/shared-control-contrast.spec.ts tests/e2e/dubbing.spec.ts --project=chromium --grep "nursery|dubbing studio|microphone|keyboard navigation|scene navigation"
```

Expected: selected tests pass at 280 px and desktop, with one error announcement and at least 4.5:1 computed Record text contrast in normal, hover, active, and focus states.

- [ ] **Step 7: Commit the journey and accessibility deliverable**

```bash
git add src/dubbing/NurseryRhymeList.tsx src/dubbing/DubStudio.tsx src/dubbing/DubSceneEditor.tsx tests/dub-ui.test.mjs tests/e2e/nursery-rhymes.spec.ts tests/e2e/header.spec.ts tests/e2e/dubbing.spec.ts tests/e2e/shared-control-contrast.spec.ts
git commit -m "fix: improve nursery rhyme accessibility"
```

---

### Task 4: Build the compact short-wide project without weakening phones or desktop

**Files:**

- Modify: `src/dubbing/DubProjectHome.tsx:75-190`
- Modify: `src/dubbing/DubListenOnly.tsx:20-70`
- Test: `tests/e2e/dubbing.spec.ts:740-930,1470-1510,1550-1755,1970-2050`
- Test: `tests/e2e/nursery-rhymes.spec.ts:55-85`

**Interfaces:**

- Consumes: existing `short-wide` Tailwind variant and the Task 2 recommended action.
- Produces: one project scroller; 640×360 split with video left and compact two-column scene actions right.
- Preserves: rich illustrated scene cards on ordinary-height phones and desktop, and the editor's existing short-wide control-panel scroller.

- [ ] **Step 1: Strengthen rendered geometry tests before changing layout**

Replace the existing short-landscape project assertions with a test that names the first and last scene using the new status phrases:

```ts
test("short landscape shows video, guidance, and every compact scene action", async ({ page }) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");

  const routeHeader = page.getByRole("navigation", { name: "Page navigation" });
  const player = page.getByRole("region", { name: "Full video player" });
  const play = page.getByRole("button", { name: "Play full video" });
  const guidance = page.getByRole("button", { name: "Continue with Scene 1" });
  const scenes = page.getByRole("navigation", { name: "Scenes" });
  const sceneSelection = page.getByRole("complementary", { name: "Scene selection" });
  const first = scenes.getByRole("button", { name: /Scene 1, Five little ducks, 3 of 4 lines ready/ });
  const second = scenes.getByRole("button", { name: /Scene 2, Four little ducks, Ready to start/ });
  const fifth = scenes.getByRole("button", { name: /Scene 5, One little duck, Ready to start/ });
  const last = scenes.getByRole("button", { name: /Scene 6, Sad mother duck, Ready to start/ });

  const [headerBox, playerBox, playBox, guidanceBox, firstBox, secondBox, fifthBox, lastBox] = await Promise.all([
    boundingBoxOrThrow(routeHeader),
    boundingBoxOrThrow(player),
    boundingBoxOrThrow(play),
    boundingBoxOrThrow(guidance),
    boundingBoxOrThrow(first),
    boundingBoxOrThrow(second),
    boundingBoxOrThrow(fifth),
    boundingBoxOrThrow(last),
  ]);
  for (const box of [playerBox, playBox, guidanceBox, firstBox, secondBox, fifthBox, lastBox]) {
    expect(box.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
    expect(box.y + box.height).toBeLessThanOrEqual(360);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(640);
  }
  expect(playerBox.x + playerBox.width).toBeLessThanOrEqual(firstBox.x);
  expect(playBox.y).toBeGreaterThanOrEqual(playerBox.y + playerBox.height);
  expect(guidanceBox.y + guidanceBox.height).toBeLessThanOrEqual(firstBox.y);
  expect(firstBox.x + firstBox.width).toBeLessThanOrEqual(secondBox.x);
  expect(Math.abs(firstBox.y - secondBox.y)).toBeLessThanOrEqual(2);
  expect(fifthBox.x + fifthBox.width).toBeLessThanOrEqual(lastBox.x);
  expect(Math.abs(fifthBox.y - lastBox.y)).toBeLessThanOrEqual(2);
  expect(fifthBox.y).toBeGreaterThanOrEqual(firstBox.y + firstBox.height);
  for (const target of [play, guidance, first, second, fifth, last]) {
    await expectTargetAtLeast48(target);
  }
  await expect(first.locator("img")).not.toBeVisible();
  await expect(last.locator("img")).not.toBeVisible();
  for (const container of [sceneSelection, scenes]) {
    const dimensions = await container.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight);
  }
  await expectNoHorizontalOverflow(page);
});
```

Add an Old MacDonald narrow-title test:

```ts
test("the visible Old MacDonald project title wraps without ellipsis", async ({ page }) => {
  await page.setViewportSize({ height: 640, width: 320 });
  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  const heading = page.getByRole("heading", { name: "Old MacDonald Had a Farm" });
  const metrics = await heading.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
      textOverflow: style.textOverflow,
    };
  });
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight);
  expect(metrics.textOverflow).not.toBe("ellipsis");
});
```

At 1280×900, assert scene-card images are visible. Retain the existing 280, 320, 390, 640, and 1280 containment loops and update their accessible names to the new status copy.

- [ ] **Step 2: Run short-wide and narrow-title tests red**

```bash
npx playwright test tests/e2e/dubbing.spec.ts tests/e2e/nursery-rhymes.spec.ts --project=chromium --grep "short landscape|visible Old MacDonald|contained|desktop project"
```

Expected: project title uses ellipsis, the video and scene grid stack at 640×360, and the last scene is below the viewport.

- [ ] **Step 3: Implement the responsive project structure with Tailwind utilities**

In `DubProjectHome.tsx`, make the title/progress header wrap without truncation:

```tsx
<header className="grid min-w-0 items-start gap-2 min-[420px]:grid-cols-[minmax(0,1fr)_auto] min-[420px]:items-center">
  <h1 className="m-0 min-w-0 text-xl leading-tight text-brand-ink short-wide:text-lg md:text-4xl short-wide:md:text-lg">
    {definition.title}
  </h1>
```

Keep the page below the shared header and compact the section and left-media gaps in every short-wide viewport, including widths where `md` also applies:

```tsx
<main className="h-dvh w-screen overflow-x-hidden overflow-y-auto overscroll-contain bg-story-shelf px-3 pb-5 pt-20 short-wide:px-2 short-wide:pb-2 short-wide:pt-16 md:px-6 md:pt-24 short-wide:md:px-2 short-wide:md:pt-16">
  <section aria-label="Dub project workspace" className="mx-auto grid min-w-0 w-full max-w-[1600px] gap-3 short-wide:max-w-[38rem] short-wide:gap-2">
```

Use a two-pane short-wide project while retaining the ordinary-height desktop columns. The combined override prevents `lg` from restacking the intended proportions at widths such as 1280×360:

```tsx
<div className="grid min-w-0 items-start gap-4 short-wide:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)] short-wide:gap-2 lg:grid-cols-[minmax(0,1.7fr)_minmax(24rem,0.8fr)] short-wide:lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)]">
```

Keep the video and Play action in `<div className="grid min-w-0 gap-3 short-wide:gap-1">`. Keep completion, recommended action, heading, and scene navigation inside the right `aside`. Use these compact aside and grid classes:

On the Task 2 recommended action, add the short-wide override so the shared large control cannot grow back to its `md` height on wide, short screens:

```tsx
className="short-wide:h-12 short-wide:min-h-12 short-wide:px-2 short-wide:py-1 short-wide:text-sm short-wide:md:h-12 short-wide:md:text-sm"
```

```tsx
<aside aria-label="Scene selection" className="grid min-w-0 content-start gap-3 rounded-3xl border-4 border-white bg-white/90 p-3 shadow-card short-wide:gap-1.5 short-wide:rounded-2xl short-wide:p-2 md:p-4 short-wide:md:p-2">
```

```tsx
<nav aria-label="Scenes" className="grid min-w-0 grid-cols-2 gap-3 short-wide:gap-1.5">
```

Use one DOM scene button for both presentations. Hide only the decorative thumbnail at short-wide and keep every target at 48 px:

```ts
const { accessible: statusLabel, visible: statusText } = sceneStatusCopy(
  status,
  definition.linesPerScene,
);
```

```tsx
<ActionButton
  aria-current={selected ? "step" : undefined}
  aria-label={`Scene ${sceneIndex + 1}, ${title}, ${statusLabel}`}
  className="relative min-h-36 min-w-0 flex-col items-stretch gap-2 overflow-hidden rounded-2xl p-2 text-left short-wide:min-h-12 short-wide:gap-0.5 short-wide:rounded-xl short-wide:p-1"
  disabled={locked}
  onClick={() => onOpenScene(sceneIndex)}
  shape="rounded"
  size="none"
  variant={selected ? "navy" : "surface"}
>
  <img alt="" className="aspect-video w-full rounded-xl object-cover short-wide:hidden" decoding="async" height={artwork.height} loading="lazy" src={artwork.src} width={artwork.width} />
  <span className="grid min-w-0 gap-0.5 px-1 short-wide:grid-cols-[auto_minmax(0,1fr)] short-wide:items-center short-wide:gap-x-1 short-wide:gap-y-px short-wide:px-0">
    <span className="text-xs font-black uppercase tracking-wide opacity-75 short-wide:leading-3">Scene {sceneIndex + 1}</span>
    <strong className="line-clamp-2 text-base leading-tight short-wide:text-xs short-wide:leading-3">{title}</strong>
    <span className="text-sm font-black short-wide:col-span-2 short-wide:text-xs short-wide:leading-3" data-status-icon={status.kind}>{statusIcon} {statusText}</span>
  </span>
</ActionButton>
```

Use `<h2 className="m-0 text-xl text-brand-ink short-wide:sr-only">Choose a scene</h2>` so the heading remains in the accessibility tree without spending visible short-wide height. Do not add overflow scrolling to the project aside or scene navigation. Keep `DubSceneEditor`'s existing short-wide `overflow-y-auto` controls unchanged.

- [ ] **Step 4: Make listen-only short-wide content fit the same header boundary**

In `DubListenOnly.tsx`, keep one page scroller and replace the main/section content with this compact structure. It keeps the title across both columns, the video on the left, and every explanatory/action state in one right-side wrapper:

```tsx
<main className="h-dvh w-screen overflow-x-hidden overflow-y-auto overscroll-contain bg-story-shelf px-3 pb-5 pt-20 short-wide:px-2 short-wide:pb-2 short-wide:pt-16 md:px-6 md:pt-24 short-wide:md:px-2 short-wide:md:pt-16">
  <section aria-label="Listen-only video" className="mx-auto grid w-full max-w-5xl gap-3 short-wide:max-w-[38rem] short-wide:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)] short-wide:gap-2">
    <h1 className="m-0 text-2xl leading-tight text-brand-ink short-wide:col-span-2 short-wide:text-xl md:text-4xl short-wide:md:text-xl">
      {definition.title}
    </h1>
    <section aria-label="Full video player" className="grid aspect-video overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card">
      <IllustratedDubScene compact definition={definition} line={visualLine} playing={playback === "playing"} />
    </section>
    <div className="grid min-w-0 content-start gap-3 short-wide:gap-2">
      <p className="m-0 rounded-2xl bg-white/90 p-3 font-bold leading-snug text-brand-ink shadow-sm">
        You can watch the video now. Ask a grown-up to turn on voice recording if you want to sing and save your own version.
      </p>
      <ActionButton
        aria-label={playbackLabel}
        className="min-h-12 min-w-36 justify-self-start gap-2"
        disabled={playback === "loading"}
        onClick={onTogglePlayback}
        ref={playbackButtonRef}
        size="compact"
        variant="navy"
      >
        {playback === "loading"
          ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          : playback === "playing"
            ? <Square aria-hidden="true" />
            : <Play aria-hidden="true" />}
        {playback === "playing" ? "Stop" : playback === "loading" ? "Loading…" : "Play"}
      </ActionButton>
      {error ? <p className="m-0 rounded-2xl bg-rose-50 p-3 font-bold text-red-800" role="alert">{error}</p> : null}
    </div>
  </section>
</main>
```

Do not add scene controls or a second scroller.

- [ ] **Step 5: Run all responsive browser tests green**

```bash
npx playwright test tests/e2e/dubbing.spec.ts tests/e2e/nursery-rhymes.spec.ts --project=chromium --grep "short landscape|visible Old MacDonald|contained|desktop project|narrow project|scene editor"
```

Expected: all selected tests pass; the first and last scene, video, Play, and Continue action are visible at 640×360, title metrics prove no ellipsis at 320 px, and rich thumbnails remain visible at desktop.

- [ ] **Step 6: Commit the responsive project deliverable**

```bash
git add src/dubbing/DubProjectHome.tsx src/dubbing/DubListenOnly.tsx tests/e2e/dubbing.spec.ts tests/e2e/nursery-rhymes.spec.ts
git commit -m "feat: compact nursery projects on short screens"
```

---

### Task 5: Run full verification and the post-implementation UX audit

**Files:**

- Verify: every source and test file listed above
- Compare unchanged contracts against pre-implementation commit `6a6a6d6`

**Interfaces:**

- Consumes: the four independently committed deliverables.
- Produces: complete automated, rendered, privacy-network, console, and requirement-by-requirement evidence.
- Produces no empty verification commit.

- [ ] **Step 1: Verify focused domain and component suites**

```bash
node --test tests/dub-state.test.mjs tests/dub-ui.test.mjs tests/dub-playback.test.mjs tests/dub-routing.test.mjs tests/static-audio.test.mjs
```

Expected: all tests pass; catalog IDs, guide inventory, playback timing, and route compatibility remain pinned.

- [ ] **Step 2: Verify TypeScript, lint, production build, and the entire Node suite**

```bash
npm test
npm run lint
npm run build
```

Expected: every command exits 0 with no type, lint, or build error.

- [ ] **Step 3: Verify the complete rendered browser suite**

```bash
npm run test:browser
```

Expected: all Playwright projects pass, including 280–390 px headers, 320×480, 390×844, 640×360, and desktop Nursery Rhymes coverage.

- [ ] **Step 4: Prove protected implementation surfaces stayed unchanged**

```bash
git diff 6a6a6d6 -- worker/dubs.ts src/dubbing/dub-api.ts src/dubbing/rhyme-catalog.ts src/dubbing/dub-playback.ts src/shared/ui.tsx src/styles.css src/lesson.css public/assets
```

Expected: no output.

Run vocabulary and compatibility checks:

```bash
if rg -n -i "whole rhyme" src; then
  exit 1
fi
rg -n "five-little-ducks-v2|line-24" src/dubbing/dub-script.ts
git diff --check
```

Expected: the first command has no matches, the second shows the unchanged v2 ID and final stable line, and `git diff --check` reports nothing.

- [ ] **Step 5: Perform the real-browser UX audit**

Use the Playwright browser-control skill against the local Vite app. Inspect these exact states:

```text
/dubs
/dubs/five-little-ducks?parrotE2eDub=empty
/dubs/five-little-ducks?parrotE2eDub=partial
/dubs/five-little-ducks?parrotE2eDub=complete
/dubs/five-little-ducks?parrotE2eDub=not-granted
/dubs/five-little-ducks?parrotE2eDub=audio-fetch-failed
/dubs/old-macdonald?parrotE2eDub=empty
```

At 320×480, 390×844, 640×360, and 1280×900, verify the visible hierarchy, complete titles, Start/Continue/Fix behavior, completion copy, video language, scene choice, editor flow, listen-only privacy boundary, wrapped errors, focus, target size, one project scroll path, and lack of horizontal overflow. Inspect console output and the dubbing network snapshot; only the recording-disabled status request and public guide assets may occur in listen-only playback.

Repeat the listen-only Play check with public guide requests forced to return 503 and verify that one child-readable alert appears, the Play action regains focus, and no private request or recording state is created. Record any evidence-backed usability issue that remains in the final handoff as a candidate for the next continual-improvement cycle; do not silently expand this cycle's approved scope.

- [ ] **Step 6: Run the requirement-by-requirement completion audit**

Read the approved spec from top to bottom. For each of its eleven acceptance criteria, attach one authoritative item from the commands, rendered checks, network snapshot, or current source. Treat an indirect or missing result as incomplete and return to the task that owns it before making a completion claim.

- [ ] **Step 7: Inspect repository state and avoid an empty commit**

```bash
git status --short --branch
git log -6 --oneline
git diff 6a6a6d6 --stat
```

Expected: only the planned source/test changes and four implementation commits follow the two approved design commits. If verification required a concrete fix, rerun its owning test and commit that fix with a descriptive message; otherwise leave the verified commit history unchanged.
