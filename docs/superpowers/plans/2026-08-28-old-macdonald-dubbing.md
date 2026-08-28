# Old MacDonald Dubbing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Old MacDonald Had a Farm as a second learner-facing dubbing project while keeping Five Little Ducks compatible and using one shared, consent-aware recording engine.

**Architecture:** Introduce a small immutable rhyme catalog containing the existing Five Little Ducks definition and a five-scene, 35-line Old MacDonald definition. Parameterize the existing state, playback, UI, browser API, Worker routing, storage cleanup, and account-deletion paths by the resolved definition, while preserving Five Little Ducks compatibility exports and route behavior. Add a local farm scene renderer and ElevenLabs narrator guide assets for the new definition.

**Tech Stack:** TypeScript, React 19, React Router, Web Audio, MediaRecorder, Cloudflare Workers/R2/D1, Node `node:test`, Vite SSR tests, Playwright, and the existing ElevenLabs static-audio generator.

**Spec:** `docs/superpowers/specs/2026-08-28-old-macdonald-dubbing-design.md`

## Global Constraints

- Existing Five Little Ducks IDs, line IDs, route, 24-line timing, API payload shape, and saved-data compatibility remain unchanged.
- The new route is `/dubs/old-macdonald` and its private R2 namespace is `old-macdonald-v1`.
- Old MacDonald uses the traditional cow, duck, pig, dog, and sheep verses, with five scenes and seven authored lines per scene.
- The existing guardian voice consent record remains the single consent boundary for all rhyme recordings.
- Revoke and account deletion enumerate every supported rhyme namespace and retire all associated markers and line objects.
- Generate saved guide audio with ElevenLabs, `eleven_v3`, the configured narrator voice, and warm rhythmic nursery-rhyme delivery.
- Use Tailwind utilities and shared controls for UI; test rendered behavior with accessible locators, never CSS source or class names.
- Do not add a dependency; do not use local or macOS text-to-speech.

---

## File map

- Create `src/dubbing/rhyme-catalog.ts`: immutable definitions, Old MacDonald lyrics, scene metadata, and compatibility exports for Five Little Ducks.
- Create `src/dubbing/FarmScene.tsx`: local farm visual renderer with compact, thumbnail, playing, and deterministic line states.
- Create `src/dubbing/DubStudio.tsx`: shared controller extracted from `DuckDub.tsx`; accepts a rhyme definition and scene renderer.
- Modify `src/dubbing/dub-script.ts`: re-export the existing Five Little Ducks definition and legacy constants/functions.
- Modify `src/dubbing/dub-state.ts`: accept a definition while defaulting to Five Little Ducks.
- Modify `src/dubbing/dub-playback.ts`: schedule and resolve ranges using the active definition.
- Modify `src/dubbing/dub-api.ts`: build requests and validate payloads for an explicit rhyme ID.
- Modify `src/dubbing/DubProjectHome.tsx` and `src/dubbing/DubSceneEditor.tsx`: consume definition-specific counts, titles, lines, and renderer.
- Modify `src/dubbing/DuckDub.tsx`: preserve it as a Five Little Ducks wrapper around `DubStudio`.
- Modify `src/dubbing/DuckScene.tsx`: preserve the existing duck renderer contract and tests.
- Modify `src/dubbing/GuardianDubbingSettings.tsx`: keep shared consent and existing Five Little Ducks management copy aligned with the catalog.
- Modify `src/app/app-routes.ts`, `src/app/App.tsx`, and `src/app/HomeMenu.tsx`: expose and protect the new route.
- Modify `worker/dub-route.ts`, `worker/dub-storage.ts`, `worker/dubs.ts`, and `worker/account-deletion.ts`: resolve definitions, isolate R2 namespaces, and clean all supported namespaces.
- Modify `lib/static-audio.js` and `scripts/generate-static-audio.mjs`: register and generate Old MacDonald guides.
- Create `tests/dub-catalog.test.mjs` and `tests/farm-scene.test.mjs`; modify existing dubbing, routing, Worker, audio, app-shell, and browser tests.
- Create `public/assets/audio/old-macdonald-v1-guide-*.mp3` for each unique authored guide line.

### Task 1: Add the immutable rhyme catalog and Old MacDonald content

**Files:**
- Create: `src/dubbing/rhyme-catalog.ts`
- Modify: `src/dubbing/dub-script.ts`
- Create: `tests/dub-catalog.test.mjs`

**Interfaces:**
- Produces `DubDefinition`, `DUB_DEFINITIONS`, `getDubDefinition(dubId)`, and `OLD_MACDONALD_DUB`.
- `DubDefinition` contains `id`, `route`, `title`, `durationMs`, `recordingMs`, `linesPerScene`, `sceneTitles`, `lines`, `guideAudioPrefix`, and `sceneKind`.
- Each `DubLine` contains `id`, `cueMs`, `text`, and `visualBeat`; all arrays and line objects are frozen.
- `DUB_DEFINITIONS` includes the existing `five-little-ducks-v2` definition and `old-macdonald-v1`.

- [ ] **Step 1: Write the failing catalog tests**

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DUB_DEFINITIONS,
  OLD_MACDONALD_DUB,
  getDubDefinition,
} from "../src/dubbing/rhyme-catalog.ts";

describe("rhyme catalog", () => {
  it("contains the traditional five-scene Old MacDonald definition", () => {
    assert.equal(getDubDefinition("old-macdonald-v1"), OLD_MACDONALD_DUB);
    assert.equal(OLD_MACDONALD_DUB.route, "/dubs/old-macdonald");
    assert.equal(OLD_MACDONALD_DUB.lines.length, 35);
    assert.equal(OLD_MACDONALD_DUB.linesPerScene, 7);
    assert.deepEqual(OLD_MACDONALD_DUB.sceneTitles, [
      "Cows on the farm",
      "Ducks on the farm",
      "Pigs on the farm",
      "A dog on the farm",
      "Sheep on the farm",
    ]);
    assert.deepEqual(
      OLD_MACDONALD_DUB.lines.slice(0, 7).map(({ text }) => text),
      [
        "Old MacDonald had a farm, E-I-E-I-O!",
        "And on his farm he had some cows, E-I-E-I-O!",
        "With a moo-moo here",
        "And a moo-moo there",
        "Here a moo, there a moo",
        "Everywhere a moo-moo",
        "Old MacDonald had a farm, E-I-E-I-O!",
      ],
    );
  });

  it("freezes definitions and rejects unknown IDs", () => {
    assert.equal(Object.isFrozen(OLD_MACDONALD_DUB.lines), true);
    assert.equal(Object.isFrozen(OLD_MACDONALD_DUB.lines[0]), true);
    assert.throws(() => getDubDefinition("missing"), /Unknown dub/);
    assert.equal(DUB_DEFINITIONS.length, 2);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails for the missing catalog**

Run: `node --test tests/dub-catalog.test.mjs`

Expected: FAIL because `src/dubbing/rhyme-catalog.ts` and `OLD_MACDONALD_DUB` do not exist yet.

- [ ] **Step 3: Implement the catalog with the five traditional verses**

Define the seven-line scene shape once per animal and flatten five scenes into 35 stable lines. Use `old-macdonald-v1-line-1` through `old-macdonald-v1-line-35`, monotonically increasing four-second cues, a 150-second authored duration, a six-second recording window, and visual beats identifying `intro`, `cows`, `ducks`, `pigs`, `dog`, or `sheep`. Keep the Five Little Ducks values byte-for-byte compatible by moving them behind `FIVE_LITTLE_DUCKS_DUB` and re-exporting `DUB_ID`, `DUB_ROUTE`, `DUB_DURATION_MS`, `DUB_LINES_PER_VERSE`, `DUB_RECORDING_MS`, `DUB_LINES`, `DUB_VERSES`, `DUB_SCENE_TITLES`, `getDubLineAtElapsed`, and `getDubVerseLineAtElapsed`.

- [ ] **Step 4: Run the focused test and the existing script tests**

Run: `node --test tests/dub-catalog.test.mjs tests/dub-state.test.mjs tests/dub-playback.test.mjs`

Expected: PASS, with all existing Five Little Ducks assertions unchanged.

- [ ] **Step 5: Commit the catalog**

```bash
git add src/dubbing/rhyme-catalog.ts src/dubbing/dub-script.ts tests/dub-catalog.test.mjs
git commit -m "feat: add Old MacDonald rhyme definition"
```

### Task 2: Parameterize dubbing state and Web Audio playback

**Files:**
- Modify: `src/dubbing/dub-state.ts`
- Modify: `src/dubbing/dub-playback.ts`
- Modify: `tests/dub-state.test.mjs`
- Modify: `tests/dub-playback.test.mjs`

**Interfaces:**
- Every new definition argument is optional and defaults to `FIVE_LITTLE_DUCKS_DUB`, preserving current callers.
- `createInitialDubState(definition = FIVE_LITTLE_DUCKS_DUB): DubState`.
- `reduceDubState(state, event, definition = FIVE_LITTLE_DUCKS_DUB): DubState`.
- `getDubSceneStatus(state, sceneIndex, definition = FIVE_LITTLE_DUCKS_DUB)`.
- `startDubPlayback({ definition = FIVE_LITTLE_DUCKS_DUB, lines = definition.lines, ... }): Promise<{ stop(): void }>`.
- `scheduleDubAudio` and elapsed-range validation use `definition.lines` and `definition.durationMs`.

- [ ] **Step 1: Add failing state tests for seven-line scenes**

```js
import { OLD_MACDONALD_DUB } from "../src/dubbing/rhyme-catalog.ts";
import {
  createInitialDubState,
  getDubSceneStatus,
  reduceDubState,
} from "../src/dubbing/dub-state.ts";

it("uses the active rhyme's scene size and line count", () => {
  const state = reduceDubState(
    createInitialDubState(OLD_MACDONALD_DUB),
    { type: "LOADED", savedLineIds: OLD_MACDONALD_DUB.lines.slice(0, 6).map(({ id }) => id) },
    OLD_MACDONALD_DUB,
  );
  assert.equal(state.selectedSceneIndex, 0);
  assert.equal(state.selectedLineIndex, 6);
  assert.deepEqual(
    getDubSceneStatus(
      { saved: Object.fromEntries(OLD_MACDONALD_DUB.lines.slice(0, 6).map(({ id }) => [id, "saved"])), needsRetake: {} },
      0,
      OLD_MACDONALD_DUB,
    ),
    { kind: "in-progress", recorded: 6 },
  );
});
```

- [ ] **Step 2: Run the focused state test and confirm the pre-change failure**

Run: `node --test tests/dub-state.test.mjs`

Expected: FAIL because the reducer currently uses the fixed four-line Five Little Ducks constants.

- [ ] **Step 3: Implement definition-aware state calculations**

Replace fixed `DUB_LINES`, `DUB_LINES_PER_VERSE`, and scene-count reads inside helper functions with the selected definition. Keep `firstMissingDubLineIndex(savedLineIds)` as a compatibility wrapper and add an optional definition parameter. Do not change the serialized `DubState` shape or event names.

- [ ] **Step 4: Add failing playback tests for an Old MacDonald scene**

Pass `definition: OLD_MACDONALD_DUB` and `lines: OLD_MACDONALD_DUB.lines.slice(7, 14)` to the existing fake `AudioContext`; assert seven fetch/decode requests, the first cue starts at zero for the scene, and the final scene duration uses `definition.durationMs` only for the full rhyme.

- [ ] **Step 5: Implement definition-aware scheduling and verify**

Use the active definition for canonical range checks, full-rhyme detection, trailing duration, and default lines. Preserve the current fallback and abort behavior. Run:

`node --test tests/dub-state.test.mjs tests/dub-playback.test.mjs`

Expected: PASS with all existing and new cases.

- [ ] **Step 6: Commit the shared state/playback changes**

```bash
git add src/dubbing/dub-state.ts src/dubbing/dub-playback.ts tests/dub-state.test.mjs tests/dub-playback.test.mjs
git commit -m "refactor: parameterize dubbing playback by rhyme"
```

### Task 3: Make the browser API, route parser, storage, and Worker definition-aware

**Files:**
- Modify: `src/dubbing/dub-api.ts`
- Modify: `worker/dub-route.ts`
- Modify: `worker/dub-storage.ts`
- Modify: `worker/dubs.ts`
- Modify: `worker/account-deletion.ts`
- Modify: `tests/dub-api.test.mjs`
- Modify: `tests/dub-routing.test.mjs`
- Modify: `tests/dub-worker.test.mjs`
- Modify: `tests/account-deletion.test.mjs`

**Interfaces:**
- `loadDubStatus({ dubId = DUB_ID, ...options })`, `saveDubLine(lineId, blob, { dubId = DUB_ID, ...options })`, `grantDubConsent({ dubId = DUB_ID, ...options })`, `deleteDub({ dubId = DUB_ID, ...options })`, and `getDubLineAudioUrl(lineId, { dubId = DUB_ID, ...options })` preserve old request URLs by default.
- `parseDubRoute(pathname)` returns `{ audio, consent, definition, dubId, lineId }` for either supported route and rejects cross-rhyme line IDs.
- `createDubStorageKeys(identity, dubId = DUB_ID)` and `objectPrefix(userId, dubId = DUB_ID)` isolate keys by definition ID.

- [ ] **Step 1: Add failing route/API/storage tests for the new rhyme**

```js
it("routes Old MacDonald and rejects a duck line under its namespace", () => {
  const oldRoute = parseDubRoute("/api/dubs/old-macdonald-v1/lines/old-macdonald-v1-line-1");
  assert.equal(oldRoute.definition.id, "old-macdonald-v1");
  assert.equal(oldRoute.lineId, "old-macdonald-v1-line-1");
  assert.equal(
    parseDubRoute("/api/dubs/old-macdonald-v1/lines/line-1"),
    null,
  );
});

it("builds Old MacDonald API URLs without changing the default duck API", () => {
  assert.equal(
    getDubLineAudioUrl("old-macdonald-v1-line-1", { dubId: "old-macdonald-v1" }),
    "/api/dubs/old-macdonald-v1/lines/old-macdonald-v1-line-1/audio",
  );
  assert.equal(getDubLineAudioUrl("line-1"), "/api/dubs/five-little-ducks-v2/lines/line-1/audio");
});
```

- [ ] **Step 2: Run the route/API tests and confirm they fail**

Run: `node --test tests/dub-api.test.mjs tests/dub-routing.test.mjs`

Expected: FAIL because only `five-little-ducks-v2` is currently accepted.

- [ ] **Step 3: Implement catalog-based route parsing and browser request construction**

Resolve the definition from the path before validating a line. Keep encoded aliases rejected exactly as before. Thread `dubId` through every status, upload, consent, delete, and audio URL while retaining `five-little-ducks-v2` as the default.

- [ ] **Step 4: Add failing Worker and storage-isolation tests**

Assert that an Old MacDonald status contains 35 line slots, an Old MacDonald upload writes only under `.../learner-dubs/old-macdonald-v1/...`, and account deletion fences both rhyme namespaces. Assert an Old MacDonald URL cannot read `line-1` from the duck definition.

- [ ] **Step 5: Implement Worker definition resolution and all-rhyme cleanup**

Use `route.definition` for line validation, status construction, upload limits, and audio lookup. Pass `route.dubId` to storage key creation. Add a catalog-driven key list for account deletion, keep the existing legacy Five Little Ducks namespace cleanup, and keep the shared consent repository unchanged. A `DELETE` mutation continues to revoke the shared consent and purges all supported current rhyme namespaces, matching the existing consent boundary.

- [ ] **Step 6: Run focused Worker tests**

Run: `node --test tests/dub-api.test.mjs tests/dub-routing.test.mjs tests/dub-worker.test.mjs tests/account-deletion.test.mjs`

Expected: PASS with current Five Little Ducks behavior and the new namespace tests.

- [ ] **Step 7: Commit the API and Worker changes**

```bash
git add src/dubbing/dub-api.ts worker/dub-route.ts worker/dub-storage.ts worker/dubs.ts worker/account-deletion.ts tests/dub-api.test.mjs tests/dub-routing.test.mjs tests/dub-worker.test.mjs tests/account-deletion.test.mjs
git commit -m "feat: support multiple private dubbing rhymes"
```

### Task 4: Extract the shared studio UI and add the farm scene

**Files:**
- Create: `src/dubbing/DubStudio.tsx`
- Create: `src/dubbing/FarmScene.tsx`
- Modify: `src/dubbing/DuckDub.tsx`
- Modify: `src/dubbing/DubProjectHome.tsx`
- Modify: `src/dubbing/DubSceneEditor.tsx`
- Modify: `src/dubbing/DuckScene.tsx`
- Create: `tests/farm-scene.test.mjs`
- Modify: `tests/dub-ui.test.mjs`

**Interfaces:**
- `DubStudio({ definition, Scene, ... })` owns the existing loading, intro, project, scene, recording, save, guide, and playback state.
- `Scene` receives `{ compact?, line, playing?, thumbnail? }` and returns the visual scene.
- `DubProjectHome` and `DubSceneEditor` receive `definition` and `Scene` and derive all counts/titles/lines from it.
- `DuckDub` remains `export function DuckDub()` and renders `DubStudio` with `FIVE_LITTLE_DUCKS_DUB` and `DuckScene`.

- [ ] **Step 1: Add failing farm-renderer and Old MacDonald UI tests**

```js
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { FarmScene } from "../src/dubbing/FarmScene.tsx";
import { OLD_MACDONALD_DUB } from "../src/dubbing/rhyme-catalog.ts";

it("renders the active farm animal and keeps thumbnails accessible", () => {
  const html = renderToStaticMarkup(createElement(FarmScene, {
    line: OLD_MACDONALD_DUB.lines[14],
    thumbnail: true,
  }));
  assert.match(html, /data-farm-animal="pigs"/);
  assert.match(html, /aria-label="Farm scene/);
});
```

Add a rendered `DubProjectHome` assertion for `Old MacDonald Had a Farm`, `0 / 35`, five scene controls, and `0 / 7` status text. Keep existing duck UI assertions intact.

- [ ] **Step 2: Run the focused UI tests and confirm they fail**

Run: `node --test tests/farm-scene.test.mjs tests/dub-ui.test.mjs`

Expected: FAIL because no farm renderer or definition-aware UI exists.

- [ ] **Step 3: Extract `DuckDub` into `DubStudio` without changing behavior**

Move the current controller implementation into `DubStudio.tsx`, replace fixed constants with the definition and optional `Scene` prop, and leave `DuckDub.tsx` as a thin compatibility wrapper. Preserve focus recovery, abort cleanup, friendly error copy, and existing default URLs.

- [ ] **Step 4: Parameterize project and scene presentation**

Replace fixed `DUB_LINES.length`, `DUB_LINES_PER_VERSE`, `DUB_VERSES`, and hard-coded title/`/ 4` labels with definition-derived values. Keep semantic names such as `Project recording progress`, `Scenes`, and line controls. Do not assert class names in tests.

- [ ] **Step 5: Implement the local farm renderer**

Render a responsive farm background with a farmer and the currently introduced animal, using deterministic CSS/React shapes or emoji-free accessible labels. Use `data-farm-animal` only as a test/debug semantic marker, not as a styling contract. Support compact and thumbnail modes and suppress decorative motion when reduced motion is requested.

- [ ] **Step 6: Run focused UI tests and the existing dubbing suite**

Run: `node --test tests/farm-scene.test.mjs tests/dub-ui.test.mjs tests/dub-waveform.test.mjs`

Expected: PASS with the existing Five Little Ducks scene assertions and new Old MacDonald assertions.

- [ ] **Step 7: Commit the shared UI and farm renderer**

```bash
git add src/dubbing/DubStudio.tsx src/dubbing/FarmScene.tsx src/dubbing/DuckDub.tsx src/dubbing/DubProjectHome.tsx src/dubbing/DubSceneEditor.tsx src/dubbing/DuckScene.tsx tests/farm-scene.test.mjs tests/dub-ui.test.mjs
git commit -m "feat: add shared rhyme studio and farm scene"
```

### Task 5: Wire routes, home entry, guardian copy, and browser mocks

**Files:**
- Modify: `src/app/app-routes.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/HomeMenu.tsx`
- Modify: `src/dubbing/GuardianDubbingSettings.tsx`
- Modify: `src/testing/e2e-browser-mocks.ts`
- Modify: `tests/app-routes.test.mjs`
- Modify: `tests/app-shell-ui.test.mjs`
- Modify: `tests/e2e/home-menu.spec.ts`
- Modify: `tests/e2e/dubbing.spec.ts`

**Interfaces:**
- `getOldMacDonaldDubPath()` returns `/dubs/old-macdonald`.
- Safe-return and canonical route checks recognize the new path and reject extra path segments.
- `App` mounts `DubStudio` for the new route and keeps the current `DuckDub` route.
- Browser mocks select the active API base from the requested rhyme ID and return 35 Old MacDonald slots.

- [ ] **Step 1: Add failing route and browser tests**

Assert that the new route is canonical, appears in authenticated routes and safe return targets, and that the home menu exposes an accessible `Old MacDonald Had a Farm` link. Add a browser test that opens `/dubs/old-macdonald`, sees the title and `0 / 35`, and can open the first scene.

- [ ] **Step 2: Run route/home tests and confirm the pre-change failure**

Run: `node --test tests/app-routes.test.mjs tests/app-shell-ui.test.mjs`

Expected: FAIL because the route and home entry are not declared.

- [ ] **Step 3: Implement route helpers and app wiring**

Add the route helper and route pattern, use `OLD_MACDONALD_DUB` with `FarmScene` in `App.tsx`, and add the new picture-led home card without removing the existing Five Little Ducks card. Keep accessible labels even if compact styles hide visual text.

- [ ] **Step 4: Update browser mocks and guardian settings**

Make the mock status and upload handlers validate the requested rhyme ID, keep consent shared, and return definition-specific line counts. Keep guardian consent controls single and shared; show existing Five Little Ducks saved-line copy unless the current settings surface already supports a catalog list without a second API contract.

- [ ] **Step 5: Run the focused app and browser tests**

Run: `node --test tests/app-routes.test.mjs tests/app-shell-ui.test.mjs && npm run test:browser -- tests/e2e/home-menu.spec.ts tests/e2e/dubbing.spec.ts`.

Expected: both commands exit 0.

- [ ] **Step 6: Commit route and browser wiring**

```bash
git add src/app/app-routes.ts src/app/App.tsx src/app/HomeMenu.tsx src/dubbing/GuardianDubbingSettings.tsx src/testing/e2e-browser-mocks.ts tests/app-routes.test.mjs tests/app-shell-ui.test.mjs tests/e2e/home-menu.spec.ts tests/e2e/dubbing.spec.ts
git commit -m "feat: expose Old MacDonald dubbing route"
```

### Task 6: Register and generate saved ElevenLabs guide audio

**Files:**
- Modify: `lib/static-audio.js`
- Inspect: `scripts/generate-static-audio.mjs` to confirm the existing metadata-driven CLI needs no code change
- Create: `public/assets/audio/old-macdonald-v1-guide-*.mp3`
- Modify: `tests/static-audio.test.mjs`

**Interfaces:**
- `getStaticAudioLineForSpeech("narrator", oldMacDonaldLine)` returns an ID with prefix `old-macdonald-v1-guide-` and a source under `/assets/audio/`.
- Each unique Old MacDonald guide has `ttsText` beginning with `[warm, rhythmic nursery-rhyme delivery]` and uses the narrator speaker.

- [ ] **Step 1: Add failing static-audio metadata tests**

```js
it("registers every unique Old MacDonald lyric with a saved guide", () => {
  const uniqueLines = new Set(OLD_MACDONALD_DUB.lines.map(({ text }) => text));
  for (const text of uniqueLines) {
    const line = getStaticAudioLineForSpeech("narrator", text);
    assert.match(line.id, /^old-macdonald-v1-guide-/);
    assert.equal(line.text, text);
    assert.match(line.ttsText, /^\[warm, rhythmic nursery-rhyme delivery\]/);
    assert.equal(existsSync(new URL(`../public${line.src}`, import.meta.url)), true);
  }
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node --test tests/static-audio.test.mjs`

Expected: FAIL on the first uncached Old MacDonald line.

- [ ] **Step 3: Add metadata and generate the MP3s**

Register exact-text metadata from the Old MacDonald definition. Check for an available ElevenLabs key without printing it: `test -n "$ELEVENLABS_API_KEY" || test -f .dev.vars`. Generate only the new IDs with the existing CLI and ElevenLabs provider. If the key is present, run the generator and verify every file is non-empty; if it is absent, stop with the exact missing-key blocker rather than substituting local TTS.

- [ ] **Step 4: Verify audio metadata and file integrity**

Run: `node --test tests/static-audio.test.mjs tests/generate-static-audio.test.mjs`

Expected: PASS, including one existing saved file for every unique new guide and unchanged speaker/language restrictions.

- [ ] **Step 5: Commit the audio assets**

```bash
git add lib/static-audio.js scripts/generate-static-audio.mjs tests/static-audio.test.mjs public/assets/audio/old-macdonald-v1-guide-*.mp3
git commit -m "feat: add Old MacDonald guide audio"
```

### Task 7: Full verification, responsive browser coverage, and review

**Files:**
- Modify: `tests/e2e/dubbing.spec.ts` if responsive coverage is not already shared by the existing tests.
- Modify: `tests/dub-ui.test.mjs` only for discovered behavioral regressions.

- [ ] **Step 1: Run all unit and integration tests**

Run: `npm test`

Expected: exit code 0 with zero failures; record the final test count.

- [ ] **Step 2: Run typecheck/build and lint**

Run: `npm run build && npm run lint`

Expected: both commands exit 0 with no TypeScript or ESLint errors.

- [ ] **Step 3: Run browser tests for the new and existing routes**

Run: `npm run test:browser`

Expected: existing Five Little Ducks scenarios and Old MacDonald route scenarios pass at ultra-narrow, short-landscape, and desktop sizes; controls remain contained and accessible.

- [ ] **Step 4: Review the final diff and media inventory**

Run: `git diff --check && git status --short && git diff 306a3f3..HEAD --stat`.

Confirm no generated output, secrets, local TTS files, unrelated changes, or untracked assets remain. Confirm the Old MacDonald MP3 inventory matches the unique lyric metadata count.

- [ ] **Step 5: Request code review before integration**

Provide the reviewer the implementation summary, the approved spec path, the base SHA before Task 1, and the final HEAD SHA. Fix Critical and Important findings, rerun the affected focused tests, then rerun the full verification commands before claiming completion.
